import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VerifyVehicleDto } from './dto/vehicles.dto';
import { SuperAdminAuthGuard } from '../super-admin/super-admin-auth.guard';
import { CurrentSuperAdmin } from '../super-admin/current-super-admin.decorator';
import type { AuthenticatedSuperAdmin } from '../super-admin/super-admin-jwt.strategy';

/**
 * Vehicle verification — the admin half of the trust gate. Lives under the
 * same /super-admin URL space and auth strategy as the rest of the
 * super-admin API, but stays in the vehicles module so the whole vehicle
 * domain is in one folder.
 */
@Controller('super-admin/vehicles')
@UseGuards(SuperAdminAuthGuard)
export class AdminVehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  list(@Query('status') status?: 'PENDING' | 'APPROVED' | 'SUSPENDED') {
    return this.vehicles.adminList(status);
  }

  @Patch(':id/verify')
  verify(
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Param('id') vehicleId: string,
    @Body() dto: VerifyVehicleDto,
  ) {
    return this.vehicles.adminVerify(admin.id, vehicleId, dto.status);
  }
}