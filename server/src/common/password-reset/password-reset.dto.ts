import { IsEmail, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Shared across /auth/* and /super-admin/auth/* — see password-reset.service.ts. */
export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class VerifyResetOtpDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' })
  otp!: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' })
  otp!: string;

  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  newPassword!: string;
}
