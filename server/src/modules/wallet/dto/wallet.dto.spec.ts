import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TopupDto } from './wallet.dto';

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(TopupDto, payload));
}

describe('TopupDto', () => {
  it('accepts a valid top-up', async () => {
    expect(await errorsFor({ amount: 1000, method: 'esewa' })).toHaveLength(0);
  });

  it('rejects an amount below the NPR 10 minimum', async () => {
    const errors = await errorsFor({ amount: 5, method: 'esewa' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects an amount above the NPR 100,000 per-transaction cap', async () => {
    const errors = await errorsFor({ amount: 100_001, method: 'esewa' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects more than 2 decimal places', async () => {
    const errors = await errorsFor({ amount: 100.999, method: 'esewa' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects a payment method outside the allowed set', async () => {
    const errors = await errorsFor({ amount: 1000, method: 'bitcoin' });
    expect(errors.some((e) => e.property === 'method')).toBe(true);
  });
});
