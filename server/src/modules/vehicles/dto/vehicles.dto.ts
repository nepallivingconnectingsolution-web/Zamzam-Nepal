import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Must stay in sync with vehicleCategoryEnum in database/schema.ts. */
export const VEHICLE_CATEGORIES = ['bike', 'car', 'van', 'mini_truck', 'truck'] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export class RegisterVehicleDto {
  @IsIn(VEHICLE_CATEGORIES, { message: 'category must be one of: bike, car, van, mini_truck, truck.' })
  category!: VehicleCategory;

  @IsString()
  @MinLength(2, { message: 'Enter the vehicle make and model.' })
  @MaxLength(80)
  makeModel!: string;

  @IsString()
  @MinLength(4, { message: 'Enter a valid plate number.' })
  @MaxLength(24)
  // Nepali plates mix letters, digits, spaces and hyphens (e.g. "BA 2 PA 1234").
  @Matches(/^[A-Za-z0-9 \-]+$/, { message: 'Plate number can only contain letters, numbers, spaces and hyphens.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  plateNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  color?: string;

  @IsOptional()
  @IsInt({ message: 'Max weight must be a whole number of kilograms.' })
  @Min(1)
  @Max(40000)
  maxWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  seats?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentRef?: string;
}

/** All fields optional — the edit form PATCHes only what changed. */
export class UpdateVehicleDto {
  @IsOptional()
  @IsIn(VEHICLE_CATEGORIES, { message: 'category must be one of: bike, car, van, mini_truck, truck.' })
  category?: VehicleCategory;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  makeModel?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9 \-]+$/, { message: 'Plate number can only contain letters, numbers, spaces and hyphens.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40000)
  maxWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  seats?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentRef?: string;
}

/** Super-admin verification decision — mirrors KycDecisionDto's shape. */
export class VerifyVehicleDto {
  @IsIn(['APPROVED', 'SUSPENDED'], { message: 'status must be APPROVED or SUSPENDED.' })
  status!: 'APPROVED' | 'SUSPENDED';
}