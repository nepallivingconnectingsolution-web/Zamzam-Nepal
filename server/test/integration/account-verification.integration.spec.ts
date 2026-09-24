import { eq } from 'drizzle-orm';
import { createTestDb } from '../setup/test-db';
import { AccountVerificationService } from '../../src/common/account-verification/account-verification.service';
import { SmsProvider } from '../../src/common/sms/sms.provider';
import type { MailerService } from '../../src/common/mailer/mailer.service';
import { emailVerificationTokens, phoneOtps, users } from '../../src/database/schema';

class CaptureSms extends SmsProvider {
  sent: { to: string; text: string }[] = [];
  fail = false;
  async send(to: string, text: string) {
    if (this.fail) throw new Error('gateway down');
    this.sent.push({ to, text });
  }
  lastCode() {
    return /(\d{6})/.exec(this.sent[this.sent.length - 1].text)![1];
  }
}

class CaptureMailer {
  sent: { to: string; otp: string }[] = [];
  fail = false;
  async sendAccountVerificationOtp(to: string, otp: string) {
    if (this.fail) throw new Error('resend down');
    this.sent.push({ to, otp });
  }
  lastOtp() {
    return this.sent[this.sent.length - 1].otp;
  }
}

describe('AccountVerificationService', () => {
  const setup = async (mobile: string | null = '9812345678') => {
    const { db, close } = await createTestDb();
    await db.insert(users).values({
      id: 'u1', name: 'A', email: 'a@t.l', mobile, passwordHash: 'x', role: 'customer',
    });
    const mailer = new CaptureMailer();
    const sms = new CaptureSms();
    const svc = new AccountVerificationService(db, mailer as unknown as MailerService, sms);
    return { db, close, mailer, sms, svc };
  };

  describe('email verification', () => {
    it('sends a code and verifies it, marking users.emailVerifiedAt', async () => {
      const { db, close, mailer, svc } = await setup();
      const r = await svc.sendEmailOtp('u1');
      expect(r.sentTo).toBe('a***@t.l');
      expect(mailer.sent[0].to).toBe('a@t.l');
      await expect(svc.verifyEmailOtp('u1', '000000')).rejects.toMatchObject({ status: 400 });
      await svc.verifyEmailOtp('u1', mailer.lastOtp());
      const [u] = await db.select().from(users).where(eq(users.id, 'u1'));
      expect(u.emailVerifiedAt).not.toBeNull();
      await close();
    });

    it('never stores the code in plain text', async () => {
      const { db, close, mailer, svc } = await setup();
      await svc.sendEmailOtp('u1');
      const [row] = await db.select().from(emailVerificationTokens);
      expect(row.otpHash).toHaveLength(64);
      expect(row.otpHash).not.toContain(mailer.lastOtp());
      await close();
    });

    it('blocks reuse of a consumed code', async () => {
      const { close, mailer, svc } = await setup();
      await svc.sendEmailOtp('u1');
      const otp = mailer.lastOtp();
      await svc.verifyEmailOtp('u1', otp);
      await expect(svc.verifyEmailOtp('u1', otp)).rejects.toMatchObject({ status: 400 });
      await close();
    });

    it('limits sends to 3 per hour', async () => {
      const { close, svc } = await setup();
      await svc.sendEmailOtp('u1');
      await svc.sendEmailOtp('u1');
      await svc.sendEmailOtp('u1');
      await expect(svc.sendEmailOtp('u1')).rejects.toMatchObject({ status: 429 });
      await close();
    });

    it('burns the code after 5 wrong attempts', async () => {
      const { close, mailer, svc } = await setup();
      await svc.sendEmailOtp('u1');
      const good = mailer.lastOtp();
      const wrong = good === '111111' ? '222222' : '111111';
      for (let i = 0; i < 5; i++) await expect(svc.verifyEmailOtp('u1', wrong)).rejects.toBeDefined();
      await expect(svc.verifyEmailOtp('u1', good)).rejects.toMatchObject({ status: 429 });
      await close();
    });

    it('does not count a failed email send against the rate limit', async () => {
      const { close, mailer, svc } = await setup();
      mailer.fail = true;
      for (let i = 0; i < 4; i++) await expect(svc.sendEmailOtp('u1')).rejects.toBeDefined();
      mailer.fail = false;
      await expect(svc.sendEmailOtp('u1')).resolves.toBeDefined();
      await close();
    });

    it('is a no-op once already verified', async () => {
      const { db, close, mailer, svc } = await setup();
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, 'u1'));
      const r = await svc.sendEmailOtp('u1');
      expect(r.sentTo).toBe('a***@t.l');
      expect(mailer.sent).toHaveLength(0);
      await close();
    });
  });

  describe('mobile verification', () => {
    it('sends a code and verifies it, marking users.mobileVerifiedAt', async () => {
      const { db, close, sms, svc } = await setup();
      const r = await svc.sendMobileOtp('u1');
      expect(r.sentTo).toBe('98*****678');
      await expect(svc.verifyMobileOtp('u1', '000000')).rejects.toMatchObject({ status: 400 });
      await svc.verifyMobileOtp('u1', sms.lastCode());
      const [u] = await db.select().from(users).where(eq(users.id, 'u1'));
      expect(u.mobileVerifiedAt).not.toBeNull();
      await close();
    });

    it('refuses when the account has no mobile number', async () => {
      const { close, svc } = await setup(null);
      await expect(svc.sendMobileOtp('u1')).rejects.toMatchObject({ status: 400 });
      await close();
    });

    it('invalidates the previous code when a new one is sent', async () => {
      const { close, sms, svc } = await setup();
      await svc.sendMobileOtp('u1');
      const first = sms.lastCode();
      await svc.sendMobileOtp('u1');
      const second = sms.lastCode();
      if (first !== second) await expect(svc.verifyMobileOtp('u1', first)).rejects.toMatchObject({ status: 400 });
      await expect(svc.verifyMobileOtp('u1', second)).resolves.toBeUndefined();
      await close();
    });
  });

  describe('isFullyVerified', () => {
    it('is false until both channels are verified', async () => {
      const { db, close, svc } = await setup();
      expect(await svc.isFullyVerified('u1')).toBe(false);
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, 'u1'));
      expect(await svc.isFullyVerified('u1')).toBe(false);
      await db.update(users).set({ mobileVerifiedAt: new Date() }).where(eq(users.id, 'u1'));
      expect(await svc.isFullyVerified('u1')).toBe(true);
      await close();
    });

    it('does not require mobile verification when the account has no mobile', async () => {
      const { db, close, svc } = await setup(null);
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, 'u1'));
      expect(await svc.isFullyVerified('u1')).toBe(true);
      await close();
    });
  });
});
