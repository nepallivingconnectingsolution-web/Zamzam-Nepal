import { IsEmail, IsIn, IsString, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Partner-eligible roles a user can self-register as (not "admin"). */
export const REGISTERABLE_ROLES = ['customer', 'driver', 'hotel', 'restaurant', 'grocery', 'bus_operator', 'freight'] as const;
export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number];

export class RegisterDto {
  @IsString()
  @MinLength(1, { message: 'Enter your name.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  // Same rule as RegisterPage.tsx: /^[0-9]{7,15}$/
  @Matches(/^[0-9]{7,15}$/, { message: 'Enter a valid mobile number.' })
  mobile!: string;

  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  password!: string;

  @IsIn(REGISTERABLE_ROLES, { message: 'Choose a valid account type.' })
  role!: RegisterableRole;
}

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
