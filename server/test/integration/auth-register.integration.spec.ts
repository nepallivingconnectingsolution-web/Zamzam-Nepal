import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@nestjs/common';
import { createTestDb } from '../setup/test-db';
import { fakeConfigService } from '../setup/fakes';
import { AuthService } from '../../src/modules/auth/auth.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import type { Database } from '../../src/database/database.module';
import type { RegisterDto } from '../../src/modules/auth/dto/auth.dto';

type RegisterResult = Awaited<ReturnType<AuthService['register']>>;
function issuedTokens(r: RegisterResult): r is Extract<RegisterResult, { accessToken: string }> {
  return 'accessToken' in r;
}

describe('AuthService.register', () => {
  let db: Database;
  let close: () => Promise<void>;
  let auth: AuthService;

  const baseDto: RegisterDto = {
    name: 'Anita Rai',
    email: 'anita@example.com',
    mobile: '9812345678',
    password: 'password123',
    role: 'customer',
  };

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const notifications = new NotificationsService(db);
    auth = new AuthService(db, new JwtService(), fakeConfigService(), notifications);
  });

  afterEach(async () => {
    await close();
  });

  it('registers a customer and immediately issues tokens (not pending KYC)', async () => {
    const result = await auth.register(baseDto);
    expect(result.registered).toBe(true);
    if (!issuedTokens(result)) throw new Error('expected tokens to be issued for a customer');
    expect(result.accessToken).toBeTruthy();
    expect(result.user.kycStatus).toBe('APPROVED');
  });

  it('registers a partner role (e.g. hotel) as PENDING with no tokens issued', async () => {
    const result = await auth.register({ ...baseDto, email: 'hotelowner@example.com', mobile: '9811111111', role: 'hotel' });
    expect(result.registered).toBe(true);
    expect('pending' in result && result.pending).toBe(true);
    expect('accessToken' in result).toBe(false);
  });

  it('rejects a second registration with the same email as a clean 409, not a raw DB error', async () => {
    await auth.register(baseDto);
    await expect(auth.register({ ...baseDto, mobile: '9822222222' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a second registration with the same mobile as a clean 409, not a raw DB error', async () => {
    await auth.register(baseDto);
    await expect(
      auth.register({ ...baseDto, email: 'someoneelse@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('issues a working access token that decodes back to the new user id and role', async () => {
    const result = await auth.register(baseDto);
    if (!issuedTokens(result)) throw new Error('expected tokens to be issued');

    const jwt = new JwtService();
    const payload = jwt.decode<{ sub: string; role: string; type: string }>(result.accessToken);
    expect(payload?.sub).toBe(result.user.id);
    expect(payload?.role).toBe('customer');
    expect(payload?.type).toBe('access');
  });
});
