import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Must stay in sync with driverDocumentTypeEnum in database/schema.ts. */
export const DRIVER_DOCUMENT_TYPES = ['citizenship', 'license', 'nid'] as const;
export type DriverDocumentType = (typeof DRIVER_DOCUMENT_TYPES)[number];

/** Super-admin verification decision — mirrors VerifyVehicleDto's shape. */
export class VerifyDriverDocumentDto {
  @IsIn(['APPROVED', 'SUSPENDED'], { message: 'status must be APPROVED or SUSPENDED.' })
  status!: 'APPROVED' | 'SUSPENDED';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reviewNote?: string;
}