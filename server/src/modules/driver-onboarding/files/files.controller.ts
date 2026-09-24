import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SuperAdminAuthGuard } from '../../super-admin/super-admin-auth.guard';
import { CurrentSuperAdmin } from '../../super-admin/current-super-admin.decorator';
import type { AuthenticatedSuperAdmin } from '../../super-admin/super-admin-jwt.strategy';

function send(res: Response, f: { buffer: Buffer; mimeType: string; originalName: string }) {
  res
    .set({
      'Content-Type': f.mimeType,
      'Content-Length': String(f.buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
    })
    .send(f.buffer);
}

/** A driver can only ever read files they uploaded. */
@Controller('driver/files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DriverFilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    send(res, await this.storage.readForUser(id, { kind: 'user', id: user.id }));
  }
}

/** Super admins can read any onboarding file (review). */
@Controller('super-admin/files')
@UseGuards(SuperAdminAuthGuard)
export class AdminFilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':id')
  async get(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Param('id') id: string, @Res() res: Response) {
    send(res, await this.storage.readForUser(id, { kind: 'admin', id: admin.id }));
  }
}
