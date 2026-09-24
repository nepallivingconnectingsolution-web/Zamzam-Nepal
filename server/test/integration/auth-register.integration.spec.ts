import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { ConflictException } from '@nestjs/common';
import { createTestDb } from '../setup/test-db';
import { fakeConfigService } from '../setup/fakes';
import { AuthService } from '../../src/modules/auth/auth.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { PasswordResetService } from '../../src/common/password-reset/password-reset.service';
import type { AccountVerificationService } from '../../src/common/account-verification/account-verification.service';
import { driverApplications, driverProfiles, users } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';
import type { RegisterDto } from '../../src/modules/auth/dto/auth.dto';

/**
 * register() creates the account, best-effort sends the two verification
 * codes, and issues tokens right away — email/mobile OTP is optional and no
 * longer gates either register() or login(). This file is about the
 * surrounding account logic (KYC state, duplicates, driver bootstrap) rather
 * than OTP mechanics (see account-verification.integration.spec.ts for that).
 */
function fakeAccountVerification(): AccountVerificationService {
  return {
    sendEmailOtp: jest.fn().mockResolvedValue({ sentTo: 'a***@t.l' }),
    sendMobileOtp: jest.fn().mockResolvedValue({ sentTo: '98*****678' }),
    verifyEmailOtp: jest.fn().mockResolvedValue(undefined),
    verifyMobileOtp: jest.fn().mockResolvedValue(undefined),
    isFullyVerified: jest.fn().mockResolvedValue(false),
  } as unknown as AccountVerificationService;
}

describe('AuthService.register', () => {
  let db: Database;
  let close: () => Promise<void>;
  let auth: AuthService;
  let accountVerification: AccountVerificationService;

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
    accountVerification = fakeAccountVerification();
    auth = new AuthService(db, new JwtService(), fakeConfigService(), notifications, {} as PasswordResetService, accountVerification);
  });

  afterEach(async () => {
    await close();
  });

  it('creates the account, best-effort sends both verification codes, and signs the user straight in', async () => {
    const result = await auth.register(baseDto);
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(accountVerification.sendEmailOtp).toHaveBeenCalledWith(result.user.id);
    expect(accountVerification.sendMobileOtp).toHaveBeenCalledWith(result.user.id);

    const [row] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(row.kycStatus).toBe('APPROVED');
    expect(row.role).toBe('customer');
  });

  it('never lets an OTP send failure block registration', async () => {
    (accountVerification.sendEmailOtp as jest.Mock).mockRejectedValue(new Error('mail provider down'));
    (accountVerification.sendMobileOtp as jest.Mock).mockRejectedValue(new Error('sms provider down'));

    const result = await auth.register(baseDto);
    expect(result).toHaveProperty('accessToken');
    expect(result.email).toBeUndefined();
    expect(result.mobile).toBeUndefined();
  });

  it('registers a business partner (e.g. hotel) as PENDING and still sends verification codes', async () => {
    const result = await auth.register({ ...baseDto, email: 'hotelowner@example.com', mobile: '9811111111', role: 'hotel' });
    const [row] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(row.kycStatus).toBe('PENDING');
    expect(row.role).toBe('hotel');
  });

  it('lets an unverified PENDING business log in, but still refuses a SUSPENDED one', async () => {
    await auth.register({ ...baseDto, email: 'fr@example.com', mobile: '9844444444', role: 'freight' });

    const pending = await auth.login({ email: 'fr@example.com', password: 'password123' });
    if (!('user' in pending)) throw new Error('expected a user session');
    expect(pending.user.kycStatus).toBe('PENDING');

    await db.update(users).set({ kycStatus: 'SUSPENDED' }).where(eq(users.email, 'fr@example.com'));
    await expect(auth.login({ email: 'fr@example.com', password: 'password123' })).rejects.toMatchObject({
      response: { code: 'SUSPENDED' },
    });
  });

  it('lets an unverified customer log in — OTP verification is optional, not a login gate', async () => {
    await auth.register(baseDto);
    await expect(auth.login({ email: 'anita@example.com', password: 'password123' })).resolves.toHaveProperty('accessToken');
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

  it('issues a working access token on login that decodes back to the user id and role', async () => {
    const result = await auth.register(baseDto);
    const session = await auth.login({ email: baseDto.email, password: baseDto.password });
    if (!('accessToken' in session)) throw new Error('expected tokens to be issued');

    const jwt = new JwtService();
    const payload = jwt.decode<{ sub: string; role: string; type: string }>(session.accessToken);
    expect(payload?.sub).toBe(result.user.id);
    expect(payload?.role).toBe('customer');
    expect(payload?.type).toBe('access');
  });

  it('registers a driver, sends verification codes, and creates a DRAFT application and profile', async () => {
    const r = await auth.register({ ...baseDto, email: 'drv@example.com', mobile: '9833333333', role: 'driver' });
    const [row] = await db.select().from(users).where(eq(users.id, r.user.id));
    expect(row.kycStatus).toBe('PENDING');
    expect(row.role).toBe('driver');
    const apps = await db.select().from(driverApplications);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ userId: r.user.id, status: 'DRAFT', isLegacy: false });
    expect(await db.select().from(driverProfiles)).toHaveLength(1);
  });

  it('lets both an unverified PENDING driver and an unverified PENDING hotel partner log in', async () => {
    await auth.register({ ...baseDto, email: 'drv@example.com', mobile: '9833333333', role: 'driver' });
    await auth.register({ ...baseDto, email: 'h@example.com', mobile: '9844444444', role: 'hotel' });
    await expect(auth.login({ email: 'drv@example.com', password: 'password123' })).resolves.toHaveProperty('accessToken');
    await expect(auth.login({ email: 'h@example.com', password: 'password123' })).resolves.toHaveProperty('accessToken');
  });

  it('lets a SUSPENDED driver log in (to see why) but blocks a suspended customer', async () => {
    const d = await auth.register({ ...baseDto, email: 'drv@example.com', mobile: '9833333333', role: 'driver' });
    const c = await auth.register({ ...baseDto, email: 'c@example.com', mobile: '9855555555', role: 'customer' });
    expect(d.user.id).toBeTruthy();
    expect(c.user.id).toBeTruthy();
    await db.update(users).set({ kycStatus: 'SUSPENDED' });
    await expect(auth.login({ email: 'drv@example.com', password: 'password123' })).resolves.toHaveProperty('accessToken');
    await expect(auth.login({ email: 'c@example.com', password: 'password123' })).rejects.toMatchObject({ status: 403 });
  });
});
