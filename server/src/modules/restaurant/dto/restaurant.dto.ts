import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateRestaurantDto {
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
  @IsString()
  @MinLength(1)
  cuisine?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'openTime must look like "09:00".' })
  openTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'closeTime must look like "21:00".' })
  closeTime?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minOrder?: number;
}

export class UpdateRestaurantDto extends CreateRestaurantDto {}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCategoryDto extends CreateCategoryDto {}

export class CreateMenuItemDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @Type(() => Number)
  @Min(1)
  price!: number;

  @IsOptional()
  @IsBoolean()
  isVeg?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  spiceLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  prepTimeMin?: number;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class UpdateMenuItemDto extends CreateMenuItemDto {}

export class OrderItemInputDto {
  @IsString()
  @MinLength(1)
  menuItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsIn(['delivery', 'pickup'])
  fulfillment!: 'delivery' | 'pickup';

  @IsString()
  @MinLength(1)
  customerName!: string;

  // Was @IsString() @MinLength(1) — a single character passed validation.
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number.' })
  customerPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Same accepted methods as hotel bookings — payment rails are shared.
  @IsIn(['wallet', 'esewa', 'khalti', 'connectips', 'imepay', 'card', 'cash'])
  method!: string;
}

export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;
}

export class CreateFoodReviewDto {
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