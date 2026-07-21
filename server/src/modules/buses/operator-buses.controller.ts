import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { BusesService } from './buses.service';
import { CreateScheduleDto, RegisterBusDto, UpdateTripStatusDto } from './dto/buses.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Operator-facing fleet/schedule/trip/booking management, exactly mirroring
 * the endpoints.buses.op.* registry in client/src/api/client.ts. The
 * operator's KPI dashboard lives at GET /operator/metrics instead (see
 * OperatorModule) — that path is intentionally outside this controller's
 * "buses" prefix because that's where the frontend route table sends it.
 */
@Controller('operator/buses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('bus_operator')
export class OperatorBusesController {
  constructor(private readonly buses: BusesService) {}

  @Get()
  fleet(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorFleet(user.id);
  }

  @Post()
  registerBus(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterBusDto) {
    return this.buses.registerBus(user.id, dto);
  }

  @Delete(':id')
  deleteBus(@CurrentUser() user: AuthenticatedUser, @Param('id') busId: string) {
    return this.buses.deleteBus(user.id, busId);
  }

  @Get('schedules')
  schedules(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorSchedules(user.id);
  }

  @Post('schedules')
  createSchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateScheduleDto) {
    return this.buses.createSchedule(user.id, dto);
  }

  @Delete('schedules/:id')
  deleteSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') scheduleId: string) {
    return this.buses.deleteSchedule(user.id, scheduleId);
  }

  @Get('schedules/:id/trips')
  scheduleTrips(@CurrentUser() user: AuthenticatedUser, @Param('id') scheduleId: string) {
    return this.buses.scheduleTrips(user.id, scheduleId);
  }

  @Patch('trips/:id')
  updateTripStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') tripId: string,
    @Body() dto: UpdateTripStatusDto,
  ) {
    return this.buses.updateTripStatus(user.id, tripId, dto.status);
  }

  @Get('bookings')
  bookings(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorBookings(user.id);
  }

  @Get('reviews')
  reviews(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorReviews(user.id);
  }

  @Get('reviews/summary')
  reviewSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorReviewSummary(user.id);
  }

  @Get('revenue')
  revenue(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorRevenue(user.id);
  }

  @Get('routes')
  routes(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.operatorRoutes(user.id);
  }
}