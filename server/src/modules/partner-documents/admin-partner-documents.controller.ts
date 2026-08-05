import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { PartnerDocumentsService } from './partner-documents.service';
import { VerifyPartnerDocumentDto, type PartnerType } from './dto/partner-documents.dto';
import { SuperAdminAuthGuard } from '../super-admin/super-admin-auth.guard';
import { CurrentSuperAdmin } from '../super-admin/current-super-admin.decorator';
import type { AuthenticatedSuperAdmin } from '../super-admin/super-admin-jwt.strategy';

@Controller('super-admin/partner-documents')
@UseGuards(SuperAdminAuthGuard)
export class AdminPartnerDocumentsController {
  constructor(private readonly documents: PartnerDocumentsService) {}

  @Get()
  list(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'SUSPENDED',
    @Query('partnerType') partnerType?: PartnerType,
  ) {
    return this.documents.adminList(status, partnerType);
  }

  @Patch(':id/verify')
  verify(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('id') documentId: string,
    @Body() dto: VerifyPartnerDocumentDto,
  ) {
    return this.documents.adminVerify(admin.id, documentId, dto.status, dto.reviewNote);
  }
}