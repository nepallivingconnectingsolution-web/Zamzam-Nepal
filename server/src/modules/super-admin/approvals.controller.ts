import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApprovalsService, type ApprovalBucket } from './approvals.service';
import { SuperAdminAuthGuard } from './super-admin-auth.guard';

const BUCKETS: readonly string[] = ['PENDING', 'APPROVED', 'REJECTED'];
const bucket = (s?: string): ApprovalBucket | undefined => (s && BUCKETS.includes(s) ? (s as ApprovalBucket) : undefined);

/**
 * The single inbox for driver and business registrations. Decisions are still
 * made through the existing endpoints (driver applications, partner documents,
 * users/:id/kyc); this only gathers what is waiting and resolves one item for
 * its review page.
 */
@Controller('super-admin/approvals')
@UseGuards(SuperAdminAuthGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(@Query('status') status?: string, @Query('type') type?: string, @Query('q') q?: string) {
    return this.approvals.list({ status: bucket(status) ?? 'PENDING', type, q });
  }

  @Get(':userId')
  resolve(@Param('userId') userId: string) {
    return this.approvals.resolve(userId);
  }
}

/** Partner Docs: the record of every partner and their documents. */
@Controller('super-admin/partner-records')
@UseGuards(SuperAdminAuthGuard)
export class PartnerRecordsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  records(@Query('status') status?: string, @Query('type') type?: string, @Query('q') q?: string) {
    return this.approvals.records({ status: bucket(status), type, q });
  }
}
