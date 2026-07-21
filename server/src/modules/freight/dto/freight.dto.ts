import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const CATEGORIES = ['bike', 'car', 'van', 'mini_truck', 'truck'] as const;

export class CreateLoadDto {
  @IsString() @MinLength(2, { message: 'Enter a pickup location.' }) @MaxLength(160)
  fromLabel!: string;

  @IsString() @MinLength(2, { message: 'Enter a drop-off location.' }) @MaxLength(160)
  toLabel!: string;

  @IsString() @MinLength(3, { message: 'Describe the cargo.' }) @MaxLength(500)
  cargoDescription!: string;

  @IsInt({ message: 'Weight must be a whole number of kilograms.' })
  @Min(1) @Max(40000)
  weightKg!: number;

  @IsOptional() @IsIn(CATEGORIES, { message: 'Invalid preferred vehicle type.' })
  preferredCategory?: (typeof CATEGORIES)[number];

  @IsOptional() @IsNumber() @Min(0) @Max(10_000_000)
  budget?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate must be YYYY-MM-DD.' })
  pickupDate?: string;

  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  pickupLat?: number;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  pickupLng?: number;

  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  dropLat?: number;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  dropLng?: number;
}

export class PlaceBidDto {
  @IsNumber({}, { message: 'Enter a bid amount.' })
  @Min(1) @Max(10_000_000)
  amount!: number;

  @IsOptional() @IsString() @MaxLength(300)
  message?: string;

  @IsOptional() @IsString() @MaxLength(32)
  vehicleId?: string;
}

/** Customer rates a delivered load. One review per load. */
export class CreateLoadReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}