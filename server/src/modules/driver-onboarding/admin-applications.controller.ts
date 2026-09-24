import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminApplicationsService } from './admin-applications.service';
import { RequirementsService } from './requirements.service';
import {
  ApproveApplicationDto,
  ListApplicationsQueryDto,
  NoteDto,
  ReactivateDto,
  ReasonDto,
  RejectDocumentDto,
  ResubmissionDto,
  SuspendDto,
  UpsertRequirementDto,
} from './dto/admin-applications.dto';
import { SuperAdminAuthGuard } from '../super-admin/super-admin-auth.guard';
import { CurrentSuperAdmin } from '../super-admin/current-super-admin.decorator';
import type { AuthenticatedSuperAdmin } from '../super-admin/super-admin-jwt.strategy';

/**
 * Driver verification for the super admin. Static routes (stats, requirements,
 * documents/...) are declared before the `:id` routes so they are never
 * swallowed as an application id.
 */
@Controller('super-admin/driver-applications')
@UseGuards(SuperAdminAuthGuard)
export class AdminApplicationsController {
  constructor(
    private readonly admin: AdminApplicationsService,
    private readonly requirements: RequirementsService,
  ) {}

  @Get()
  list(@Query() q: ListApplicationsQueryDto) {
    return this.admin.list({
      status: q.status,
      q: q.q,
      sort: q.sort,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('requirements')
  listRequirements() {
    return this.requirements.listAll();
  }

  @Put('requirements')
  upsertRequirement(@Body() dto: UpsertRequirementDto) {
    return this.requirements.upsert(dto);
  }

  @Patch('documents/:docId/approve')
  approveDocument(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Param('docId') docId: string) {
    return this.admin.reviewDocument(admin.id, docId, { action: 'approve' });
  }

  @Patch('documents/:docId/reject')
  rejectDocument(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('docId') docId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.admin.reviewDocument(admin.id, docId, { action: 'reject', reason: dto.reason, kind: dto.kind });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.admin.detail(id);
  }

  @Post(':id/start-review')
  @HttpCode(200)
  startReview(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Param('id') id: string) {
    return this.admin.startReview(admin.id, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('id') id: string,
    @Body() dto: ApproveApplicationDto,
  ) {
    return this.admin.approve(admin.id, id, dto.expectedVersion);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.reject(admin.id, id, dto.reason);
  }

  @Post(':id/request-resubmission')
  @HttpCode(200)
  requestResubmission(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('id') id: string,
    @Body() dto: ResubmissionDto,
  ) {
    return this.admin.requestResubmission(admin.id, id, dto.reason);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Param('id') id: string, @Body() dto: SuspendDto) {
    return this.admin.suspend(admin.id, id, dto);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Param('id') id: string, @Body() dto: ReactivateDto) {
    return this.admin.reactivate(admin.id, id, dto);
  }

  @Post(':id/notes')
  @HttpCode(200)
  addNote(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.admin.addNote(admin.id, id, dto.text);
  }
}
