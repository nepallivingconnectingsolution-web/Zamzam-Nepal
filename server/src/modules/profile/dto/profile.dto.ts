import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetCustomerProfileDto {
  @IsString()
  @MinLength(1, { message: 'Your name is required.' })
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class SetBusinessProfileDto {
  @IsString()
  @MinLength(1, { message: 'Business name is required.' })
  businessName!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  documentRef?: string;
}
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Enter your current password.' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters.' })
  @MaxLength(72, { message: 'New password must be at most 72 characters.' })
  newPassword!: string;
}