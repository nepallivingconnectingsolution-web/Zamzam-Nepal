import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { DATABASE_CONNECTION, type Database } from '../../../database/database.module';
import { driverProfiles, phoneOtps, users } from '../../../database/schema';
import { apiError } from '../../../common/exceptions';
import { id } from '../../../common/id';
import { SmsProvider } from '../../../common/sms/sms.provider';
import { ConsoleSmsProvider } from '../../../common/sms/console-sms.provider';

const TTL_SECONDS = 300;
const MAX_SENDS = 3;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const hash = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex');

/** 9812345678 -> 98*****678 */
const mask = (phone: string) =>
  phone.length <= 5 ? '*'.repeat(phone.length) : `${phone.slice(0, 2)}${'*'.repeat(phone.length - 5)}${phone.slice(-3)}`;

@Injectable()
export class OtpService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly sms: SmsProvider,
  ) {}

  /** Codes are only ever sent to the account's own mobile number, never to an arbitrary number. */
  async send(userId: string): Promise<{ sentTo: string; expiresInSeconds: number; devCode?: string }> {
    const [user] = await this.db.select({ mobile: users.mobile }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.mobile) apiError(400, 'Add a mobile number to your account first.', 'NO_MOBILE');

    const [{ recent }] = await this.db
      .select({ recent: count() })
      .from(phoneOtps)
      .where(and(eq(phoneOtps.userId, userId), gte(phoneOtps.createdAt, new Date(Date.now() - SEND_WINDOW_MS))));
    if (Number(recent) >= MAX_SENDS) {
      apiError(429, 'Too many codes requested. Try again in a few minutes.', 'OTP_RATE_LIMIT');
    }

    // Only the newest code is ever valid.
    await this.db
      .update(phoneOtps)
      .set({ consumedAt: new Date() })
      .where(and(eq(phoneOtps.userId, userId), isNull(phoneOtps.consumedAt)));

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const rowId = id('otp');
    await this.db.insert(phoneOtps).values({
      id: rowId,
      userId,
      phone: user.mobile,
      codeHash: hash(userId, code),
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
    });

    try {
      await this.sms.send(user.mobile, `Your ZamZam verification code is ${code}. It expires in 5 minutes.`);
    } catch (err) {
      // A code that never reached the phone must not use up the driver's send allowance.
      await this.db.delete(phoneOtps).where(eq(phoneOtps.id, rowId));
      throw err;
    }
    // Only ever set when the console/no-real-SMS provider is actually wired
    // in (dev, or ALLOW_CONSOLE_SMS_IN_PRODUCTION for manual QA) — a real
    // SmsProvider (Sparrow) never reaches this branch, so a real user's code
    // never appears in the response body.
    const devCode = this.sms instanceof ConsoleSmsProvider ? code : undefined;
    return { sentTo: mask(user.mobile), expiresInSeconds: TTL_SECONDS, ...(devCode && { devCode }) };
  }

  async verify(userId: string, code: string): Promise<{ verified: true }> {
    const invalid = () => apiError(400, 'That code is invalid or has expired.', 'OTP_INVALID');

    const [user] = await this.db.select({ mobile: users.mobile }).from(users).where(eq(users.id, userId)).limit(1);
    const [row] = await this.db
      .select()
      .from(phoneOtps)
      .where(and(eq(phoneOtps.userId, userId), isNull(phoneOtps.consumedAt)))
      .orderBy(desc(phoneOtps.createdAt))
      .limit(1);

    if (!row || row.expiresAt.getTime() < Date.now() || !user?.mobile || row.phone !== user.mobile) return invalid();
    if (row.attempts >= MAX_ATTEMPTS) {
      apiError(429, 'Too many wrong attempts. Request a new code.', 'OTP_ATTEMPTS');
    }

    const expected = Buffer.from(row.codeHash, 'hex');
    const given = Buffer.from(hash(userId, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await this.db
        .update(phoneOtps)
        .set({ attempts: sql`${phoneOtps.attempts} + 1` })
        .where(eq(phoneOtps.id, row.id));
      return invalid();
    }

    // Atomic single-use: a double submit consumes it once.
    const consumed = await this.db
      .update(phoneOtps)
      .set({ consumedAt: new Date() })
      .where(and(eq(phoneOtps.id, row.id), isNull(phoneOtps.consumedAt)))
      .returning({ id: phoneOtps.id });
    if (consumed.length === 0) return invalid();

    const now = new Date();
    await this.db
      .insert(driverProfiles)
      .values({ userId, phoneVerifiedAt: now })
      .onConflictDoUpdate({ target: driverProfiles.userId, set: { phoneVerifiedAt: now, updatedAt: now } });
    return { verified: true };
  }
}
