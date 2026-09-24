import { eq } from 'drizzle-orm';
import { createTestDb } from '../setup/test-db';
import { OtpService } from '../../src/modules/driver-onboarding/otp/otp.service';
import { SmsProvider } from '../../src/common/sms/sms.provider';
import { ConsoleSmsProvider } from '../../src/common/sms/console-sms.provider';
import { driverProfiles, phoneOtps, users } from '../../src/database/schema';

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

describe('OtpService', () => {
  const setup = async () => {
    const { db, close } = await createTestDb();
    await db.insert(users).values({
      id: 'u1', name: 'A', email: 'a@t.l', mobile: '9812345678', passwordHash: 'x', role: 'driver',
    });
    const sms = new CaptureSms();
    return { db, close, sms, svc: new OtpService(db, sms) };
  };

  it('sends to the account mobile and verifies the phone', async () => {
    const { db, close, sms, svc } = await setup();
    const r = await svc.send('u1');
    expect(r.sentTo).toBe('98*****678');
    expect(r.expiresInSeconds).toBe(300);
    expect(sms.sent[0].to).toBe('9812345678');
    await expect(svc.verify('u1', '000000')).rejects.toMatchObject({ status: 400 });
    await expect(svc.verify('u1', sms.lastCode())).resolves.toEqual({ verified: true });
    const [p] = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, 'u1'));
    expect(p.phoneVerifiedAt).not.toBeNull();
    await close();
  });

  it('never stores the code in plain text', async () => {
    const { db, close, sms, svc } = await setup();
    await svc.send('u1');
    const [row] = await db.select().from(phoneOtps);
    expect(row.codeHash).toHaveLength(64);
    expect(row.codeHash).not.toContain(sms.lastCode());
    await close();
  });

  it('blocks reuse of a consumed code', async () => {
    const { close, sms, svc } = await setup();
    await svc.send('u1');
    const code = sms.lastCode();
    await svc.verify('u1', code);
    await expect(svc.verify('u1', code)).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('invalidates the previous code when a new one is sent', async () => {
    const { close, sms, svc } = await setup();
    await svc.send('u1');
    const first = sms.lastCode();
    await svc.send('u1');
    const second = sms.lastCode();
    if (first !== second) await expect(svc.verify('u1', first)).rejects.toMatchObject({ status: 400 });
    await expect(svc.verify('u1', second)).resolves.toEqual({ verified: true });
    await close();
  });

  it('limits sends to 3 per 10 minutes', async () => {
    const { close, svc } = await setup();
    await svc.send('u1');
    await svc.send('u1');
    await svc.send('u1');
    await expect(svc.send('u1')).rejects.toMatchObject({ status: 429 });
    await close();
  });

  it('burns the code after 5 wrong attempts', async () => {
    const { close, sms, svc } = await setup();
    await svc.send('u1');
    const good = sms.lastCode();
    const wrong = good === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await expect(svc.verify('u1', wrong)).rejects.toBeDefined();
    await expect(svc.verify('u1', good)).rejects.toMatchObject({ status: 429 });
    await close();
  });

  it('rejects an expired code', async () => {
    const { db, close, sms, svc } = await setup();
    await svc.send('u1');
    await db.update(phoneOtps).set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(svc.verify('u1', sms.lastCode())).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('does not count a failed SMS send against the rate limit', async () => {
    const { close, sms, svc } = await setup();
    sms.fail = true;
    for (let i = 0; i < 4; i++) await expect(svc.send('u1')).rejects.toBeDefined();
    sms.fail = false;
    await expect(svc.send('u1')).resolves.toBeDefined();
    await close();
  });

  it('refuses when the account has no mobile number', async () => {
    const { db, close, svc } = await setup();
    await db.update(users).set({ mobile: null }).where(eq(users.id, 'u1'));
    await expect(svc.send('u1')).rejects.toMatchObject({ status: 400 });
    await close();
  });
});

describe('ConsoleSmsProvider', () => {
  it('refuses to run in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new ConsoleSmsProvider()).toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
