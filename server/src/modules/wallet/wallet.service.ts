import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { transactions, wallets } from '../../database/schema';
import { creditWallet } from '../../common/wallet.util';
import { id } from '../../common/id';

@Injectable()
export class WalletService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async balance(userId: string) {
    const [wallet] = await this.db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    const available = wallet ? Number(wallet.available) : 0;
    const escrow = wallet ? Number(wallet.escrow) : 0;
    return {
      balance: available,
      available,
      escrow,
      currency: wallet?.currency ?? 'NPR',
    };
  }

  /**
   * Credits the wallet and records a TOPUP ledger entry atomically —
   * both succeed or neither does, so the balance and the transaction
   * history can never disagree.
   *
   * Gateway note: eSewa/Khalti keys are not provisioned yet, so this runs
   * as a sandbox top-up (instant SUCCESS). When live keys arrive, the
   * gateway verification call slots in *before* this transaction and the
   * status flow becomes PENDING -> SUCCESS on webhook confirmation.
   */
  async topup(userId: string, amount: number, method: 'esewa' | 'khalti' | 'card') {
    const label = method === 'esewa' ? 'eSewa' : method === 'khalti' ? 'Khalti' : 'Card';
    const value = amount.toFixed(2); // numeric column — always store 2dp strings

    await this.db.transaction(async (tx) => {
      await creditWallet(tx, userId, value);
      await tx.insert(transactions).values({
        id: id('txn'),
        userId,
        type: 'TOPUP',
        status: 'SUCCESS',
        amount: value,
        currency: 'NPR',
        description: `Wallet top-up via ${label}`,
        inbound: true,
      });
    });

    return this.balance(userId);
  }

  async transactions(userId: string) {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      // Hard cap: one hyperactive account must not be able to make this
      // response (and the phone rendering it) unbounded. 500 rows is ~2
      // years of heavy personal use; older history stays queryable via
      // the super-admin ledger.
      .limit(500);

    return rows.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amount: Number(t.amount),
      currency: t.currency,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
      inbound: t.inbound,
    }));
  }
}
