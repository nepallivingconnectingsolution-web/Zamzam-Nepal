import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { DriverDocumentsService } from './driver-documents.service';
import { DRIVER_DOCUMENT_TYPES, type DriverDocumentType } from './dto/driver-documents.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { DRIVER_DOCUMENTS_DIR, ensureDriverDocumentsDir } from './storage';
import { id } from '../../common/id';

/** Photos of physical documents and scanned PDFs — nothing else. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Driver identity/compliance documents (citizenship, driving license,
 * national ID) — the "get verified" half of the driver KYC flow. Verified
 * by the super admin the same way vehicles are (see
 * admin-driver-documents.controller.ts).
 */
@Controller('driver/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DriverDocumentsController {
  constructor(private readonly documents: DriverDocumentsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.mine(user.id);
  }

  @Post(':type')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureDriverDocumentsDir();
          cb(null, DRIVER_DOCUMENTS_DIR);
        },
        filename: (_req, file, cb) => cb(null, `${id('doc')}${extname(file.originalname).toLowerCase()}`),
      }),
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
    if (!(DRIVER_DOCUMENT_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException('type must be one of: citizenship, license, nid.');
    }
    if (!file) throw new BadRequestException('Attach a JPG, PNG, WEBP or PDF file to upload.');

    return this.documents.upload(user.id, type as DriverDocumentType, file);
  }
}