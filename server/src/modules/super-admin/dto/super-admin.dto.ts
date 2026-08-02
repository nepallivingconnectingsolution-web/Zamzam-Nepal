import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SuperAdminLoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  password!: string;
}

export class KycDecisionDto {
  @IsIn(['APPROVED', 'SUSPENDED'], { message: 'kycStatus must be APPROVED or SUSPENDED.' })
  kycStatus!: 'APPROVED' | 'SUSPENDED';
}

export class ResolveTransactionDto {
  @IsIn(['SUCCESS', 'FAILED'], { message: 'outcome must be SUCCESS or FAILED.' })
  outcome!: 'SUCCESS' | 'FAILED';
}

/** All fields optional — the Settings page PATCHes only what changed. */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platformName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid support email address.' })
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  supportPhone?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Service fee must be a number with up to 2 decimals.' })
  @Min(0, { message: 'Service fee cannot be negative.' })
  @Max(100, { message: 'Service fee cannot exceed 100%.' })
  serviceFeePercent?: number;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;
}


export class CmsBannerDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsString()
  @MinLength(1, { message: 'Banner title is required.' })
  @MaxLength(80, { message: 'Banner titles are limited to 80 characters.' })
  title!: string;

  @IsString()
  @MaxLength(200, { message: 'Banner messages are limited to 200 characters.' })
  message!: string;

  @IsBoolean()
  active!: boolean;
}

/** All fields optional — the CMS page PATCHes only the section that changed. */
export class UpdateCmsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'A maximum of 20 banners is supported.' })
  @ValidateNested({ each: true })
  @Type(() => CmsBannerDto)
  banners?: CmsBannerDto[];

  @IsOptional()
  @IsObject()
  serviceFlags?: Record<string, boolean>;
}