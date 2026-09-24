import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { memoryStorage } from 'multer';
import { ApplicationService } from './application.service';
import { RequirementsService } from './requirements.service';
import { ONBOARDING_VEHICLE_TYPES, SaveProfileDto, SaveVehicleDto, UploadFileDto } from './dto/application.dto';
import { MAX_UPLOAD_BYTES } from '../../common/uploads/validate-upload';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class RequirementsQueryDto {
  @IsIn(ONBOARDING_VEHICLE_TYPES, { message: 'vehicleType must be bike or car.' })
  vehicleType!: string;

  @IsOptional() @IsString() @MaxLength(24)
  serviceClass?: string;
}

/**
 * The driver's own onboarding application. Every route is scoped to the calling
 * driver; there is no id in any path that could point at someone else's data.
 */
@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class ApplicationController {
  constructor(
    private readonly applications: ApplicationService,
    private readonly requirements: RequirementsService,
  ) {}

  @Get('application')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.applications.getOrCreate(user.id);
  }

  @Put('application/profile')
  saveProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveProfileDto) {
    return this.applications.saveProfile(user.id, dto);
  }

  @Put('application/vehicle')
  saveVehicle(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveVehicleDto) {
    return this.applications.saveVehicle(user.id, dto);
  }

  @Post('application/files')
  @UseInterceptors(
    FileInterceptor('file', {
      // memoryStorage so the bytes can be sniffed and moderated before anything is stored.
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Attach a JPG, PNG, WEBP or PDF file.');
    return this.applications.uploadFile(user.id, { docType: dto.docType, expiryDate: dto.expiryDate, file });
  }

  @Delete('application/files/:docId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('docId') docId: string) {
    return this.applications.deleteFile(user.id, docId);
  }

  @Post('application/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthenticatedUser) {
    return this.applications.submit(user.id);
  }

  @Post('application/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthenticatedUser) {
    return this.applications.reopen(user.id);
  }

  @Get('requirements')
  requirementsFor(@Query() q: RequirementsQueryDto) {
    return this.requirements.forVehicle(q.vehicleType, q.serviceClass);
  }
}
