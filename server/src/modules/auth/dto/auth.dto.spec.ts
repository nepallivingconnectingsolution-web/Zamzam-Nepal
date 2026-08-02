import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto, RegisterDto } from './auth.dto';

async function errorsFor<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  const instance = plainToInstance(cls, payload);
  return validate(instance as object);
}

describe('RegisterDto', () => {
  const valid = {
    name: 'Anita Rai',
    email: 'anita@example.com',
    mobile: '9812345678',
    password: 'password123',
    role: 'customer',
  };

  it('accepts a fully valid payload', async () => {
    expect(await errorsFor(RegisterDto, valid)).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const errors = await errorsFor(RegisterDto, { ...valid, email: 'not-an-email' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects a mobile number outside 7-15 digits', async () => {
    expect((await errorsFor(RegisterDto, { ...valid, mobile: '123' })).some((e) => e.property === 'mobile')).toBe(true);
    expect(
      (await errorsFor(RegisterDto, { ...valid, mobile: '1234567890123456' })).some((e) => e.property === 'mobile'),
    ).toBe(true);
  });

  it('rejects a mobile number containing non-digits', async () => {
    const errors = await errorsFor(RegisterDto, { ...valid, mobile: '98123abc78' });
    expect(errors.some((e) => e.property === 'mobile')).toBe(true);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const errors = await errorsFor(RegisterDto, { ...valid, password: 'short' });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects a role outside the registerable set (e.g. "admin")', async () => {
    const errors = await errorsFor(RegisterDto, { ...valid, role: 'admin' });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('trims and lowercases the email', async () => {
    const instance = plainToInstance(RegisterDto, { ...valid, email: '  Anita@Example.COM  ' });
    expect(instance.email).toBe('anita@example.com');
  });
});

describe('LoginDto', () => {
  it('accepts a valid payload', async () => {
    expect(await errorsFor(LoginDto, { email: 'a@b.com', password: 'x' })).toHaveLength(0);
  });

  it('rejects an empty password', async () => {
    const errors = await errorsFor(LoginDto, { email: 'a@b.com', password: '' });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});
