import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateHotelDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsString()
  @MinLength(1)
  address!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'checkInTime must look like "14:00".' })
  checkInTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'checkOutTime must look like "11:00".' })
  checkOutTime?: string;
}

export class UpdateHotelDto extends CreateHotelDto {}

export class CreateRoomTypeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @Min(1)
  pricePerNight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  totalRooms!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxGuests?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];
}

export class UpdateRoomTypeDto extends CreateRoomTypeDto {}

export class BookRoomDto {
  @IsString()
  roomTypeId!: string;

  @Matches(DATE_ISO, { message: 'checkIn must look like "2026-07-01".' })
  checkIn!: string;

  @Matches(DATE_ISO, { message: 'checkOut must look like "2026-07-03".' })
  checkOut!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  roomCount?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  guests!: number;

  @IsString()
  @MinLength(1)
  guestName!: string;

  @IsString()
  @MinLength(1)
  guestPhone!: string;

  @IsIn(['wallet', 'esewa', 'khalti', 'connectips', 'imepay', 'card', 'cash'])
  method!: string;
}

export class CreateReviewDto {
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