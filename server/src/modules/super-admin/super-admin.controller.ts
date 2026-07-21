import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminLoginDto, KycDecisionDto, UpdateCmsDto, UpdateSettingsDto } from './dto/super-admin.dto';
import { SuperAdminAuthGuard } from './super-admin-auth.guard';
import { CurrentSuperAdmin } from './current-super-admin.decorator';
import type { AuthenticatedSuperAdmin } from './super-admin-jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';


@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly superAdmin: SuperAdminService,
     private readonly notifications: NotificationsService) {}

  @Post('auth/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: SuperAdminLoginDto) {
    return this.superAdmin.login(dto);
  }

  @Get('metrics')
  @UseGuards(SuperAdminAuthGuard)
  metrics() {
    return this.superAdmin.metrics();
  }

  @Get('users')
  @UseGuards(SuperAdminAuthGuard)
 users(@Query('q') q?: string, @Query('limit') limit = '50', @Query('offset') offset = '0') {
    // Clamp like every other list route — ?limit=999999 must not be able
    // to dump the entire users table in one response.
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return this.superAdmin.listUsers(q, safeLimit, safeOffset);
  }

  @Get('registrations')
  @UseGuards(SuperAdminAuthGuard)
  registrations() {
    return this.superAdmin.listRegistrations();
  }

  @Get('disputes')
  @UseGuards(SuperAdminAuthGuard)
  disputes(@Query('limit') limit?: string) {
    return this.superAdmin.listDisputes(limit ? Number(limit) : undefined);
  }

  @Get('transactions')
  @UseGuards(SuperAdminAuthGuard)
  transactions(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Clamp so a hand-crafted URL can't request an unbounded page.
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return this.superAdmin.listTransactions({ q, type, limit: safeLimit, offset: safeOffset });
  }

 @Get('audit')
  @UseGuards(SuperAdminAuthGuard)
  audit(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return this.superAdmin.listAuditLogs({ q, limit: safeLimit, offset: safeOffset });
  }

  @Get('roles')
  @UseGuards(SuperAdminAuthGuard)
  roles() {
    return this.superAdmin.rolesOverview();
  }

  @Get('reports')
  @UseGuards(SuperAdminAuthGuard)
  reports(@Query('days') days?: string) {
    // 1-365 days, default 30 — clamped so a crafted URL can't scan history unbounded.
    const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    return this.superAdmin.reports(safeDays);
  }

  @Get('rides')
  @UseGuards(SuperAdminAuthGuard)
  rides(
    @Query('status') status?: string,
    @Query('service') service?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return this.superAdmin.listRides({ status, service, limit: safeLimit, offset: safeOffset });
  }

  @Get('heatmap')
  @UseGuards(SuperAdminAuthGuard)
  heatmap() {
    return this.superAdmin.demandHeatmap();
  }

  @Get('wallet')
  @UseGuards(SuperAdminAuthGuard)
  wallet() {
    return this.superAdmin.walletOverview();
  }

  @Post('transactions/:id/resolve')
@UseGuards(SuperAdminAuthGuard)
resolveRefund(@Param('id') id: string, @Body('outcome') outcome: 'SUCCESS' | 'FAILED') {
  return this.superAdmin.resolveRefund(id, outcome);
}

  @Patch('disputes/:id/resolve')
  @UseGuards(SuperAdminAuthGuard)
  resolveDispute(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('id') disputeId: string,
  ) {
    return this.superAdmin.resolveDispute(admin.id, disputeId);
  }

  @Get('users/:id')
  @UseGuards(SuperAdminAuthGuard)
  userDetail(@Param('id') userId: string) {
    return this.superAdmin.userDetail(userId);
  }

  @Get('notifications')
@UseGuards(SuperAdminAuthGuard)
listNotifications(@Query('limit') limit = '20', @Query('offset') offset = '0') {
  return this.notifications.list(Number(limit) || 20, Number(offset) || 0);
}

@Get('notifications/unread-count')
@UseGuards(SuperAdminAuthGuard)
notificationsUnreadCount() {
  return this.notifications.unreadCount();
}

@Patch('notifications/read-all')
@UseGuards(SuperAdminAuthGuard)
markAllNotificationsRead() {
  return this.notifications.markAllRead();
}

@Patch('notifications/:id/read')
@UseGuards(SuperAdminAuthGuard)
markNotificationRead(@Param('id') notificationId: string) {
  return this.notifications.markRead(notificationId);
}

  /* ── Partners: the 360° view over both bus & hotel partner businesses ── */

  @Get('partners')
  @UseGuards(SuperAdminAuthGuard)
  partners() {
    return this.superAdmin.listPartners();
  }

  @Get('partners/:id')
  @UseGuards(SuperAdminAuthGuard)
  partnerDetail(@Param('id') partnerId: string) {
    return this.superAdmin.partnerDetail(partnerId);
  }

  /* ── Revenue: combined bus + hotel earnings ─────────────────────────── */

  @Get('revenue')
  @UseGuards(SuperAdminAuthGuard)
  revenue() {
    return this.superAdmin.revenueOverview();
  }

  /* ── Platform settings ──────────────────────────────────────────────── */

  @Get('settings')
  @UseGuards(SuperAdminAuthGuard)
  settings() {
    return this.superAdmin.getSettings();
  }

  @Patch('settings')
  @UseGuards(SuperAdminAuthGuard)
  updateSettings(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.superAdmin.updateSettings(admin.id, dto);
  }
/* ── CMS content ────────────────────────────────────────────────────── */

  @Get('cms')
  @UseGuards(SuperAdminAuthGuard)
  cms() {
    return this.superAdmin.getCms();
  }

  @Patch('cms')
  @UseGuards(SuperAdminAuthGuard)
  updateCms(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Body() dto: UpdateCmsDto) {
    return this.superAdmin.updateCms(admin.id, dto);
  }

 /* ── Service directory ──────────────────────────────────────────────── */

  @Get('services')
  @UseGuards(SuperAdminAuthGuard)
  services() {
    return this.superAdmin.listServices();
  }

  @Get('services/:key/bookings')
  @UseGuards(SuperAdminAuthGuard)
  serviceBookings(
    @Param('key') key: string,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return this.superAdmin.listServiceBookings(key, safeLimit, safeOffset);
  }

  /* ── Fraud signals ──────────────────────────────────────────────────── */

  @Get('fraud')
  @UseGuards(SuperAdminAuthGuard)
  fraud() {
    return this.superAdmin.fraudSignals();
  }

  @Patch('users/:id/kyc')@Patch('users/:id/kyc')
  @UseGuards(SuperAdminAuthGuard)
  decideKyc(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('id') userId: string,
    @Body() dto: KycDecisionDto,
  ) {
    return this.superAdmin.decideKyc(admin.id, userId, dto.kycStatus);
  }
}

/**
 * Public, unauthenticated CMS read — what the customer marketplace will
 * consume (active banners + which services are switched on). Mounted at
 * /cms so it never shares the privileged /super-admin path.
 */
@Controller('cms')
export class PublicCmsController {
  constructor(private readonly superAdmin: SuperAdminService) {}

  @Get()
  publicCms() {
    return this.superAdmin.getPublicCms();
  }
}

