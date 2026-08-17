import {
  BadRequestException, Controller, Get, Param, Post,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PartnerDocumentsService } from './partner-documents.service';
import { PARTNER_DOCUMENT_CATALOG, type PartnerType } from './dto/partner-documents.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('partner/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hotel', 'restaurant', 'grocery', 'bus_operator', 'freight')
export class PartnerDocumentsController {
  constructor(private readonly documents: PartnerDocumentsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.mine(user.id, user.role as PartnerType);
  }

  @Post(':type')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPG, PNG, WEBP or PDF files are allowed.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const partnerType = user.role as PartnerType;
    const validTypes = PARTNER_DOCUMENT_CATALOG[partnerType].map((d) => d.type);
    if (!validTypes.includes(type)) {
      throw new BadRequestException(`type must be one of: ${validTypes.join(', ')}.`);
    }
    if (!file) throw new BadRequestException('Attach a JPG, PNG, WEBP or PDF file to upload.');
    return this.documents.upload(user.id, partnerType, type, file);
  }
}