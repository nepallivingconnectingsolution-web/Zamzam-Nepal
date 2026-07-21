import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { DriverDocumentsService } from './driver-documents.service';
import { VerifyDriverDocumentDto } from './dto/driver-documents.dto';
import { SuperAdminAuthGuard } from '../super-admin/super-admin-auth.guard';
import { CurrentSuperAdmin } from '../super-admin/current-super-admin.decorator';
import type { AuthenticatedSuperAdmin } from '../super-admin/super-admin-jwt.strategy';

/**
 * Driver document verification — the admin half of the driver KYC trust
 * gate. Lives under the same /super-admin URL space and auth strategy as
 * the rest of the super-admin API, but stays in the driver-documents
 * module so the whole domain is in one folder (mirrors AdminVehiclesController).
 */
@Controller('super-admin/driver-documents')
@UseGuards(SuperAdminAuthGuard)
export class AdminDriverDocumentsController {
  constructor(private readonly documents: DriverDocumentsService) {}

  @Get()
  list(@Query('status') status?: 'PENDING' | 'APPROVED' | 'SUSPENDED') {
    return this.documents.adminList(status);
  }

  @Patch(':id/verify')
  verify(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('id') documentId: string,
    @Body() dto: VerifyDriverDocumentDto,
  ) {
    return this.documents.adminVerify(admin.id, documentId, dto.status, dto.reviewNote);
  }
}