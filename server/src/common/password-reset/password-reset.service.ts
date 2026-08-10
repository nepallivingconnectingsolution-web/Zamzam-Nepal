import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt, createHash } from 'crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { passwordResetTokens } from '../../database/schema';
import { id } from '../id';
import { MailerService } from '../mailer/mailer.service';

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60_000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 3;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

export type ResetAccountType = 'user' | 'super_admin';

/**
 * Shared forgot-password OTP engine — the one backend module behind both
 * `/auth/*` (customer/driver/every partner vertical, all one `users` row)
 * and `/super-admin/auth/*` (separate identity table). Callers resolve
 * "does this email belong to an account" themselves (the two identity
 * tables are genuinely separate — see schema.ts), then hand this service
 * the resolved account id; everything about generating, hashing, emailing,
 * rate-limiting, and verifying the OTP itself lives in exactly one place.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Always resolves without throwing — the controller returns a generic
   * "if that email exists, we've sent a code" response regardless of
   * whether `account` is null, whether the per-email quota is exhausted, or
   * whether the send itself succeeds. This is what prevents the endpoint
   * from being usable to enumerate registered emails.
   */
  async requestOtp(email: string, account: { id: string; type: ResetAccountType } | null): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const recent = await this.db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.email, email), gte(passwordResetTokens.createdAt, oneHourAgo)));

    if (recent.length >= MAX_REQUESTS_PER_HOUR) {
      this.logger.warn(`Password reset request quota exceeded for ${email}`);
      return;
    }
    if (!account) return; // Unknown email — silently no-op, same outward response either way.

    const otp = generateOtp();
    await this.db.insert(passwordResetTokens).values({
      id: id('prt'),
      userId: account.type === 'user' ? account.id : null,
      superAdminId: account.type === 'super_admin' ? account.id : null,
      email,
      otpHash: sha256Hex(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await this.mailer.sendPasswordResetOtp(email, otp);
  }

  /** Checks the OTP without consuming it — used by the "verify code" step so a wrong entry can be retried. */
  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const token = await this.latestActiveToken(email);
    if (!token) return false;
    if (token.attempts >= MAX_VERIFY_ATTEMPTS) return false;

    const match = token.otpHash === sha256Hex(otp);
    if (!match) {
      await this.db
        .update(passwordResetTokens)
        .set({ attempts: token.attempts + 1 })
        .where(eq(passwordResetTokens.id, token.id));
    }
    return match;
  }

  /**
   * Re-validates the OTP and, if valid, marks the token used in the same
   * call — the final password-set step must consume the token itself
   * rather than trust an earlier "verify" call, otherwise a code could be
   * replayed to reset the password twice.
   */
  async consumeOtp(
    email: string,
    otp: string,
  ): Promise<{ userId: string | null; superAdminId: string | null } | null> {
    const token = await this.latestActiveToken(email);
    if (!token) return null;
    if (token.attempts >= MAX_VERIFY_ATTEMPTS) return null;
    if (token.otpHash !== sha256Hex(otp)) {
      await this.db
        .update(passwordResetTokens)
        .set({ attempts: token.attempts + 1 })
        .where(eq(passwordResetTokens.id, token.id));
      return null;
    }

    await this.db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, token.id));
    return { userId: token.userId, superAdminId: token.superAdminId };
  }

  private async latestActiveToken(email: string) {
    const [token] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.email, email), eq(passwordResetTokens.used, false)))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);

    if (!token) return null;
    if (token.expiresAt < new Date()) return null;
    return token;
  }
}
