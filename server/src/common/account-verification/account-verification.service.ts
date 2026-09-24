import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { emailVerificationTokens, phoneOtps, users } from '../../database/schema';
import { apiError } from '../exceptions';
import { id } from '../id';
import { MailerService } from '../mailer/mailer.service';
import { SmsProvider } from '../sms/sms.provider';

const OTP_TTL_MS = 10 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MS = 60 * 60_000;

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 9812345678 -> 98*****678 */
function maskPhone(phone: string): string {
  return phone.length <= 5 ? '*'.repeat(phone.length) : `${phone.slice(0, 2)}${'*'.repeat(phone.length - 5)}${phone.slice(-3)}`;
}

/** a@b.com -> a***@b.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Gates whether a freshly registered account can log in: separate one-time
 * codes for email (via MailerService/Resend) and mobile (via the shared
 * SmsProvider), each with its own storage, rate limit and attempt cap.
 * Deliberately independent of driver-onboarding's phone OtpService — that
 * one marks driverProfiles.phoneVerifiedAt (a driver-specific gate); this
 * one marks users.emailVerifiedAt / users.mobileVerifiedAt (an
 * every-account gate over the same phone_otps table, which is safe because
 * a user only ever runs one of the two flows at a time — one at
 * registration, the other later during driver onboarding).
 */
@Injectable()
export class AccountVerificationService {
  private readonly logger = new Logger(AccountVerificationService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly mailer: MailerService,
    private readonly sms: SmsProvider,
  ) {}

  async sendEmailOtp(userId: string): Promise<{ sentTo: string }> {
    const [user] = await this.db.select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) apiError(404, 'Account not found.');
    if (user.emailVerifiedAt) return { sentTo: maskEmail(user.email) };

    const oneWindowAgo = new Date(Date.now() - SEND_WINDOW_MS);
    const [{ recent }] = await this.db
      .select({ recent: count() })
      .from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.userId, userId), gte(emailVerificationTokens.createdAt, oneWindowAgo)));
    if (Number(recent) >= MAX_SENDS_PER_WINDOW) {
      apiError(429, 'Too many codes requested. Try again in a few minutes.', 'OTP_RATE_LIMIT');
    }

    const otp = generateOtp();
    const rowId = id('evt');
    await this.db.insert(emailVerificationTokens).values({
      id: rowId,
      userId,
      email: user.email,
      otpHash: sha256Hex(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    try {
      await this.mailer.sendAccountVerificationOtp(user.email, otp);
    } catch (err) {
      await this.db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, rowId));
      throw err;
    }
    return { sentTo: maskEmail(user.email) };
  }

  async verifyEmailOtp(userId: string, otp: string): Promise<void> {
    const invalid = () => apiError(400, 'That code is invalid or has expired.', 'OTP_INVALID');

    const [token] = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.userId, userId), eq(emailVerificationTokens.used, false)))
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(1);

    if (!token || token.expiresAt.getTime() < Date.now()) return invalid();
    if (token.attempts >= MAX_VERIFY_ATTEMPTS) {
      apiError(429, 'Too many wrong attempts. Request a new code.', 'OTP_ATTEMPTS');
    }
    if (token.otpHash !== sha256Hex(otp)) {
      await this.db.update(emailVerificationTokens).set({ attempts: token.attempts + 1 }).where(eq(emailVerificationTokens.id, token.id));
      return invalid();
    }

    await this.db.update(emailVerificationTokens).set({ used: true }).where(eq(emailVerificationTokens.id, token.id));
    await this.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  }

  async sendMobileOtp(userId: string): Promise<{ sentTo: string }> {
    const [user] = await this.db.select({ mobile: users.mobile, mobileVerifiedAt: users.mobileVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) apiError(404, 'Account not found.');
    if (!user.mobile) apiError(400, 'Add a mobile number to your account first.', 'NO_MOBILE');
    if (user.mobileVerifiedAt) return { sentTo: maskPhone(user.mobile) };

    const oneWindowAgo = new Date(Date.now() - SEND_WINDOW_MS);
    const [{ recent }] = await this.db
      .select({ recent: count() })
      .from(phoneOtps)
      .where(and(eq(phoneOtps.userId, userId), gte(phoneOtps.createdAt, oneWindowAgo)));
    if (Number(recent) >= MAX_SENDS_PER_WINDOW) {
      apiError(429, 'Too many codes requested. Try again in a few minutes.', 'OTP_RATE_LIMIT');
    }

    // Only the newest code is ever valid.
    await this.db.update(phoneOtps).set({ consumedAt: new Date() }).where(and(eq(phoneOtps.userId, userId), isNull(phoneOtps.consumedAt)));

    const otp = generateOtp();
    const rowId = id('otp');
    await this.db.insert(phoneOtps).values({
      id: rowId,
      userId,
      phone: user.mobile,
      codeHash: sha256Hex(`${userId}:${otp}`),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    try {
      await this.sms.send(user.mobile, `Your Zamzam verification code is ${otp}. It expires in 10 minutes.`);
    } catch (err) {
      await this.db.delete(phoneOtps).where(eq(phoneOtps.id, rowId));
      throw err;
    }
    return { sentTo: maskPhone(user.mobile) };
  }

  async verifyMobileOtp(userId: string, otp: string): Promise<void> {
    const invalid = () => apiError(400, 'That code is invalid or has expired.', 'OTP_INVALID');

    const [user] = await this.db.select({ mobile: users.mobile }).from(users).where(eq(users.id, userId)).limit(1);
    const [row] = await this.db
      .select()
      .from(phoneOtps)
      .where(and(eq(phoneOtps.userId, userId), isNull(phoneOtps.consumedAt)))
      .orderBy(desc(phoneOtps.createdAt))
      .limit(1);

    if (!row || row.expiresAt.getTime() < Date.now() || !user?.mobile || row.phone !== user.mobile) return invalid();
    if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
      apiError(429, 'Too many wrong attempts. Request a new code.', 'OTP_ATTEMPTS');
    }

    const expected = Buffer.from(row.codeHash, 'hex');
    const given = Buffer.from(sha256Hex(`${userId}:${otp}`), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await this.db.update(phoneOtps).set({ attempts: row.attempts + 1 }).where(eq(phoneOtps.id, row.id));
      return invalid();
    }

    const consumed = await this.db
      .update(phoneOtps)
      .set({ consumedAt: new Date() })
      .where(and(eq(phoneOtps.id, row.id), isNull(phoneOtps.consumedAt)))
      .returning({ id: phoneOtps.id });
    if (consumed.length === 0) return invalid();

    await this.db.update(users).set({ mobileVerifiedAt: new Date() }).where(eq(users.id, userId));
  }

  /** True once every channel this account actually has is confirmed (no mobile yet == nothing to verify there). */
  async isFullyVerified(userId: string): Promise<boolean> {
    const [user] = await this.db
      .select({ mobile: users.mobile, emailVerifiedAt: users.emailVerifiedAt, mobileVerifiedAt: users.mobileVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return false;
    return !!user.emailVerifiedAt && (!user.mobile || !!user.mobileVerifiedAt);
  }
}
