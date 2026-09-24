import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListApplicationsQueryDto {
  @IsOptional() @IsString() @MaxLength(30)
  status?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  q?: string;

  @IsOptional() @IsIn(['newest', 'oldest', 'updated'], { message: 'sort must be newest, oldest or updated.' })
  sort?: 'newest' | 'oldest' | 'updated';

  @IsOptional() @IsNumberString()
  page?: string;

  @IsOptional() @IsNumberString()
  limit?: string;
}

export class RejectDocumentDto {
  @Transform(trim) @IsString() @MinLength(3, { message: 'Give a reason so the driver knows what to fix.' }) @MaxLength(500)
  reason!: string;

  @IsOptional() @IsIn(['REJECTED', 'RESUBMISSION_REQUIRED'])
  kind?: 'REJECTED' | 'RESUBMISSION_REQUIRED';
}

export class ApproveApplicationDto {
  @IsOptional() @IsInt() @Min(0)
  expectedVersion?: number;
}

export class ReasonDto {
  @Transform(trim) @IsString() @MinLength(3, { message: 'Give a reason so the driver understands the decision.' }) @MaxLength(500)
  reason!: string;
}

export class ResubmissionDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  reason?: string;
}

export class SuspendDto {
  @IsIn(['DRIVER', 'VEHICLE', 'BOTH'], { message: 'scope must be DRIVER, VEHICLE or BOTH.' })
  scope!: 'DRIVER' | 'VEHICLE' | 'BOTH';

  @Transform(trim) @IsString() @MinLength(3, { message: 'Give a reason for the suspension.' }) @MaxLength(500)
  reason!: string;
}

export class ReactivateDto {
  @IsIn(['DRIVER', 'VEHICLE', 'BOTH'], { message: 'scope must be DRIVER, VEHICLE or BOTH.' })
  scope!: 'DRIVER' | 'VEHICLE' | 'BOTH';
}

export class NoteDto {
  @Transform(trim) @IsString() @MinLength(1, { message: 'Write a note.' }) @MaxLength(2000)
  text!: string;
}

export class UpsertRequirementDto {
  @IsIn(['', 'bike', 'car'], { message: 'vehicleType must be empty (all), bike or car.' })
  vehicleType!: string;

  @IsString() @MaxLength(24)
  serviceClass!: string;

  @IsIn(['DRIVER', 'VEHICLE'])
  subject!: 'DRIVER' | 'VEHICLE';

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(40)
  docType!: string;

  @IsIn(['DOCUMENT', 'PHOTO'])
  kind!: 'DOCUMENT' | 'PHOTO';

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  label!: string;

  @IsBoolean()
  isRequired!: boolean;

  @IsBoolean()
  requiresExpiry!: boolean;

  @IsInt() @Min(0) @Max(1000)
  sortOrder!: number;
}
