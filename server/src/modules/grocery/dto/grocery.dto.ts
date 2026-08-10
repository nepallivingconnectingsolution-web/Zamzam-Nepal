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

export class CreateStoreDto {
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
  storeType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'openTime must look like "07:00".' })
  openTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'closeTime must look like "22:00".' })
  closeTime?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  freeDeliveryAbove?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(180)
  deliveryEtaMinutes?: number;
}

export class UpdateStoreDto extends CreateStoreDto {}

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

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  unit?: string;

  @Type(() => Number)
  @Min(1)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  mrp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

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

export class UpdateProductDto extends CreateProductDto {}

export class OrderItemInputDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
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

  @IsIn(['wallet', 'esewa', 'khalti', 'connectips', 'imepay', 'card', 'cash'])
  method!: string;
}

export const GROCERY_ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PACKING',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;
export type GroceryOrderStatus = (typeof GROCERY_ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsIn(GROCERY_ORDER_STATUSES)
  status!: GroceryOrderStatus;
}

export class CreateGroceryReviewDto {
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