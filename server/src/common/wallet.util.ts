import { sql } from 'drizzle-orm';
import { apiError } from './exceptions';

/**
 * Shared wallet ledger helpers.
 *
 * Money-safety rules enforced here (see AUDIT_REPORT.md — "Infinite money
 * exploit"):
 *
 *  1. A booking only ever debits the wallet when it is actually PAID from
 *     the wallet (`method === 'wallet'`). The debit is a single atomic
 *     conditional UPDATE — the `available >= amount` predicate lives inside
 *     the UPDATE itself, so two concurrent bookings can never both spend
 *     the same balance.
 *
 *  2. A cancellation only ever credits the wallet when the original payment
 *     came OUT of the wallet. Bookings "paid" with esewa/khalti/card/cash
 *     (which have no real gateway integration yet) must never mint wallet
 *     balance on cancel — that was the book→cancel→free-money loop.
 */

/** True when a cancellation of this payment method should credit the wallet. */
export function refundsToWallet(method: string | null | undefined): boolean {
  return method === 'wallet';
}

/**
 * Atomically debit `amount` (NPR, string or number, 2dp) from a user's
 * available balance. Throws 402 if the balance is insufficient (or the
 * wallet row does not exist).
 *
 * Must be called with the transaction handle (`tx`) of the surrounding
 * booking transaction so the debit rolls back together with the booking.
 */
export async function debitWalletOrFail(
  tx: { execute: (q: unknown) => Promise<{ rows: unknown[] }> },
  userId: string,
  amount: string | number,
): Promise<void> {
  const result = await tx.execute(
    sql`UPDATE wallets
        SET available = available - ${amount}, updated_at = now()
        WHERE user_id = ${userId} AND available >= ${amount}
        RETURNING user_id`,
  );
  if (result.rows.length === 0) {
    apiError(402, 'Insufficient wallet balance. Top up your wallet or choose another payment method.');
  }
}

/** Credit `amount` back to a user's available balance (creates the wallet row if missing). */
export async function creditWallet(
  tx: { execute: (q: unknown) => Promise<unknown> },
  userId: string,
  amount: string | number,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO wallets (user_id, available, escrow, currency)
        VALUES (${userId}, ${amount}, 0, 'NPR')
        ON CONFLICT (user_id) DO UPDATE
        SET available = wallets.available + ${amount}, updated_at = now()`,
  );
}
