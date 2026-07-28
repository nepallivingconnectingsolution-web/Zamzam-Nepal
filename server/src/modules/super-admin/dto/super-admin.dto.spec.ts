import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KycDecisionDto, ResolveTransactionDto } from './super-admin.dto';

describe('ResolveTransactionDto', () => {
  it('accepts SUCCESS and FAILED', async () => {
    for (const outcome of ['SUCCESS', 'FAILED']) {
      const errors = await validate(plainToInstance(ResolveTransactionDto, { outcome }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects any other value, closing the pre-fix gap where a bare string reached the DB layer', async () => {
    const errors = await validate(plainToInstance(ResolveTransactionDto, { outcome: 'MAYBE' }));
    expect(errors.some((e) => e.property === 'outcome')).toBe(true);
  });

  it('rejects a missing outcome', async () => {
    const errors = await validate(plainToInstance(ResolveTransactionDto, {}));
    expect(errors.some((e) => e.property === 'outcome')).toBe(true);
  });
});

describe('KycDecisionDto', () => {
  it('accepts APPROVED and SUSPENDED', async () => {
    for (const kycStatus of ['APPROVED', 'SUSPENDED']) {
      const errors = await validate(plainToInstance(KycDecisionDto, { kycStatus }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects PENDING (not a valid admin decision, only a starting state)', async () => {
    const errors = await validate(plainToInstance(KycDecisionDto, { kycStatus: 'PENDING' }));
    expect(errors.some((e) => e.property === 'kycStatus')).toBe(true);
  });
});
