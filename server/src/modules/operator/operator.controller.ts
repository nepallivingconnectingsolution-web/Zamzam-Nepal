import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BusesService } from '../buses/buses.service';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Bus operators' real metrics live entirely in BusesService (tickets,
 * schedules, fleet are all bus-domain data) — this controller just exposes
 * them at the path the frontend's route table actually requests:
 * GET /operator/metrics (see routes/index.tsx, metricsPath="/operator/metrics").
 */
@Controller('operator')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('bus_operator')
export class OperatorController {
  constructor(private readonly buses: BusesService) {}

  @Get('metrics')
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorMetrics(user.id);
  }
}
