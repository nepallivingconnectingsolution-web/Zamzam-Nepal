import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateRideDto {
  @IsIn(['taxi', 'bike', 'parcel'], { message: 'service must be taxi, bike or parcel.' })
  service!: 'taxi' | 'bike' | 'parcel';

  @IsString()
  @MinLength(2, { message: 'Enter a pickup location.' })
  @MaxLength(160)
  fromLabel!: string;

  @IsString()
  @MinLength(2, { message: 'Enter a drop-off location.' })
  @MaxLength(160)
  toLabel!: string;

  @IsNumber() @Min(-90) @Max(90)
  pickupLat!: number;

  @IsNumber() @Min(-180) @Max(180)
  pickupLng!: number;

  @IsNumber() @Min(-90) @Max(90)
  dropLat!: number;

  @IsNumber() @Min(-180) @Max(180)
  dropLng!: number;

  /** Parcel only — used for capacity matching and ignored for taxi/bike. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40000)
  parcelWeightKg?: number;
}

/**
 * Customer settles a PAYMENT_PENDING trip. Only 'wallet' settles in-app
 * today; cash is confirmed by the driver via POST /rides/:id/confirm-cash.
 * Khalti/eSewa slot in here later without a route change.
 */
export class PayRideDto {
  @IsIn(['wallet'], { message: 'Only wallet payment is supported in-app right now.' })
  method!: 'wallet';
}

/** Customer rates a completed taxi/bike/parcel trip. One review per ride. */
export class CreateRideReviewDto {
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