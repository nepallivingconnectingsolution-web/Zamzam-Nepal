import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const iso = { strict: true } as const;
const CURRENT_YEAR = new Date().getFullYear();

export const GENDERS = ['male', 'female', 'other'] as const;
export const LANGUAGES = ['ne', 'en'] as const;
export const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid'] as const;
export const ONBOARDING_VEHICLE_TYPES = ['bike', 'car'] as const;
export type OnboardingVehicleType = (typeof ONBOARDING_VEHICLE_TYPES)[number];

/** Personal + licence fields, all optional so each wizard step saves only its own. */
export class SaveProfileDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2, { message: 'Enter your full legal name.' }) @MaxLength(120)
  legalName?: string;

  @IsOptional() @IsISO8601(iso, { message: 'Enter a valid date of birth.' })
  dateOfBirth?: string;

  @IsOptional() @IsIn(GENDERS, { message: 'Choose male, female or other.' })
  gender?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(3, { message: 'Enter your address.' }) @MaxLength(200)
  address?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(2, { message: 'Enter your city.' }) @MaxLength(80)
  city?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(2, { message: 'Choose your province.' }) @MaxLength(40)
  province?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(2, { message: 'Enter your emergency contact name.' }) @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional() @Matches(/^[0-9]{7,15}$/, { message: 'Enter a valid emergency contact number.' })
  emergencyContactPhone?: string;

  @IsOptional() @IsIn(LANGUAGES, { message: 'Choose Nepali or English.' })
  language?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(3, { message: 'Enter your licence number.' }) @MaxLength(40)
  licenceNumber?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(1, { message: 'Choose your licence category.' }) @MaxLength(16)
  licenceClass?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(2, { message: 'Enter the issuing authority.' }) @MaxLength(120)
  licenceAuthority?: string;

  @IsOptional() @IsISO8601(iso, { message: 'Enter a valid licence issue date.' })
  licenceIssueDate?: string;

  @IsOptional() @IsISO8601(iso, { message: 'Enter a valid licence expiry date.' })
  licenceExpiryDate?: string;

  @IsOptional() @IsInt() @Min(1) @Max(8)
  currentStep?: number;
}

export class SaveVehicleDto {
  @IsIn(ONBOARDING_VEHICLE_TYPES, { message: 'Choose Bike or Car.' })
  category!: OnboardingVehicleType;

  @Transform(trim) @IsString() @MinLength(2, { message: 'Enter the vehicle make.' }) @MaxLength(40)
  make!: string;

  @Transform(trim) @IsString() @MinLength(1, { message: 'Enter the vehicle model.' }) @MaxLength(40)
  model!: string;

  @Transform(trim) @IsString() @MinLength(4, { message: 'Enter your number plate.' }) @MaxLength(24)
  @Matches(/^[A-Za-z0-9 \-]+$/, { message: 'Plate number can only contain letters, numbers, spaces and hyphens.' })
  plateNumber!: string;

  @IsInt({ message: 'Enter the manufacturing year.' }) @Min(1990, { message: 'Enter a valid manufacturing year.' }) @Max(CURRENT_YEAR + 1, { message: 'Enter a valid manufacturing year.' })
  manufactureYear!: number;

  @IsOptional() @IsInt() @Min(1990) @Max(CURRENT_YEAR + 1)
  registrationYear?: number;

  @Transform(trim) @IsString() @MinLength(2, { message: 'Enter the vehicle colour.' }) @MaxLength(24)
  color!: string;

  @IsOptional() @IsIn(FUEL_TYPES, { message: 'Choose a fuel type.' })
  fuelType?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(24)
  serviceClass?: string;

  @IsOptional() @IsInt() @Min(1) @Max(12)
  seats?: number;
}

export class UploadFileDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(40)
  docType!: string;

  @IsOptional() @IsISO8601(iso, { message: 'Enter a valid expiry date.' })
  expiryDate?: string;
}
