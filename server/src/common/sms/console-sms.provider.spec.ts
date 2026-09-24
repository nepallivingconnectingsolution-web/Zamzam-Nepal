import { ConsoleSmsProvider } from './console-sms.provider';

describe('ConsoleSmsProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('constructs fine outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION;
    expect(() => new ConsoleSmsProvider()).not.toThrow();
  });

  it('refuses to construct in production by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION;
    expect(() => new ConsoleSmsProvider()).toThrow(/cannot be used in production/);
  });

  it('constructs in production when ALLOW_CONSOLE_SMS_IN_PRODUCTION=true is explicitly set', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION = 'true';
    expect(() => new ConsoleSmsProvider()).not.toThrow();
  });

  it('still refuses in production for any other value of the flag', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION = 'yes';
    expect(() => new ConsoleSmsProvider()).toThrow(/cannot be used in production/);
  });
});
