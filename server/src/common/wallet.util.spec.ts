import { HttpException } from '@nestjs/common';
import { debitWalletOrFail, creditWallet, refundsToWallet } from './wallet.util';

function fakeTx(rows: unknown[]) {
  return { execute: jest.fn().mockResolvedValue({ rows }) };
}

describe('refundsToWallet', () => {
  it('is true only for the wallet payment method', () => {
    expect(refundsToWallet('wallet')).toBe(true);
    expect(refundsToWallet('esewa')).toBe(false);
    expect(refundsToWallet('khalti')).toBe(false);
    expect(refundsToWallet('card')).toBe(false);
    expect(refundsToWallet('cash')).toBe(false);
    expect(refundsToWallet(undefined)).toBe(false);
    expect(refundsToWallet(null)).toBe(false);
  });
});

describe('debitWalletOrFail', () => {
  it('resolves silently when the conditional UPDATE returns a row (sufficient balance)', async () => {
    const tx = fakeTx([{ user_id: 'u1' }]);
    await expect(debitWalletOrFail(tx, 'u1', '100.00')).resolves.toBeUndefined();
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('throws a 402 HttpException when the UPDATE returns no rows (insufficient balance, or no wallet row)', async () => {
    const tx = fakeTx([]);
    await expect(debitWalletOrFail(tx, 'u1', '100.00')).rejects.toBeInstanceOf(HttpException);
    try {
      await debitWalletOrFail(fakeTx([]), 'u1', '100.00');
      throw new Error('expected debitWalletOrFail to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(402);
    }
  });
});

describe('creditWallet', () => {
  it('always resolves (upsert has no failure branch)', async () => {
    const tx = fakeTx([]);
    await expect(creditWallet(tx, 'u1', '50.00')).resolves.toBeUndefined();
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});
