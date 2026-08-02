import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { transactions, wallets } from '../../database/schema';
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
   * Records a TOPUP request as PENDING. It does NOT credit the wallet —
   * eSewa/Khalti/card keys are not provisioned yet, so there is no way to
   * verify a customer actually paid. Crediting instantly here previously
   * let any authenticated user mint arbitrary spendable balance (see
   * AUDIT_REPORT.md). The wallet is only ever credited when a super-admin
   * resolves this transaction as SUCCESS (`SuperAdminService.resolveTransaction`),
   * mirroring how PENDING refunds are already resolved.
   *
   * Gateway note: once live keys arrive, the gateway verification
   * webhook should call the same resolution path instead of a human.
   */
  async topup(userId: string, amount: number, method: 'esewa' | 'khalti' | 'card') {
    const label = method === 'esewa' ? 'eSewa' : method === 'khalti' ? 'Khalti' : 'Card';
    const value = amount.toFixed(2); // numeric column — always store 2dp strings

    const [txn] = await this.db
      .insert(transactions)
      .values({
        id: id('txn'),
        userId,
        type: 'TOPUP',
        status: 'PENDING',
        amount: value,
        currency: 'NPR',
        description: `Wallet top-up via ${label}`,
        inbound: true,
      })
      .returning();

    return {
      status: 'PENDING' as const,
      transactionId: txn.id,
      message: `Your NPR ${value} top-up via ${label} is being verified and will be added to your balance shortly.`,
    };
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
