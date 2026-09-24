import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SetDriverStatusDto {
  @IsBoolean()
  online!: boolean;
}

export class UpdateLocationDto {
  @IsNumber({}, { message: 'lat must be a number.' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({}, { message: 'lng must be a number.' })
  @Min(-180)
  @Max(180)
  lng!: number;

  /** Optional GPS quality fields; older app builds send only lat/lng. */
  @IsOptional() @IsNumber() @Min(0) @Max(100000)
  accuracy?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(360)
  heading?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(200)
  speed?: number;

  /** Device time of the fix, epoch ms. Ignored if it is in the future. */
  @IsOptional() @IsNumber()
  timestamp?: number;
}

/**
 * GET /drivers/nearby query. The global ValidationPipe has
 * enableImplicitConversion, so "27.71" in the URL arrives here as a number.
 */
export class NearbyDriversQueryDto {
  @IsIn(['taxi', 'bike', 'parcel'], {
    message: 'service must be taxi, bike or parcel.',
  })
  service!: 'taxi' | 'bike' | 'parcel';

  @IsNumber({}, { message: 'lat must be a number.' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({}, { message: 'lng must be a number.' })
  @Min(-180)
  @Max(180)
  lng!: number;

  /** Parcel only: declared package weight, filters out too-small vehicles. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40000)
  weightKg?: number;
}