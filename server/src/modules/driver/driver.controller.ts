import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { DriverService } from './driver.service';
import { NearbyDriversQueryDto, SetDriverStatusDto, UpdateLocationDto } from './dto/driver.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Note on /driver/requests: this path is called from two very different
 * places — the driver dashboard (incoming ride requests for that driver)
 * AND ServiceBookingPage.tsx for customers browsing a service (intended to
 * mean "nearby drivers"). The original mock never actually distinguished
 * these — it just resolved `driverStatus[callingUser.id]`, which is always
 * false/empty for a customer, so both call sites "worked" by coincidence.
 * Real-time ride matching isn't implemented yet either way, so this route
 * stays open to any authenticated user and returns the calling user's own
 * online-status-gated request list — empty for customers, exactly
 * preserving the old behavior. ServiceBookingPage's real endpoint is now
 * GET /drivers/nearby (DriversController below), exactly as this comment
 * always said it should be.
 */
@Controller('driver')
@UseGuards(JwtAuthGuard)
export class DriverController {
  constructor(private readonly driver: DriverService) {}

  @Get('earnings')
  @UseGuards(RolesGuard)
  @Roles('driver')
  earnings(@CurrentUser() user: AuthenticatedUser) {
    return this.driver.earnings(user.id);
  }

  @Get('reviews')
  @UseGuards(RolesGuard)
  @Roles('driver')
  reviews(@CurrentUser() user: AuthenticatedUser) {
    return this.driver.reviews(user.id);
  }

  @Get('reviews/summary')
  @UseGuards(RolesGuard)
  @Roles('driver')
  reviewSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.driver.reviewSummary(user.id);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthenticatedUser) {
    return this.driver.requests(user.id);
  }

  @Post('status')
  @UseGuards(RolesGuard)
  @Roles('driver')
  setStatus(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetDriverStatusDto) {
    return this.driver.setStatus(user.id, dto.online);
  }

  @Post('location')
  @UseGuards(RolesGuard)
  @Roles('driver')
  updateLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateLocationDto) {
    return this.driver.updateLocation(user.id, dto.lat, dto.lng);
  }
}

/**
 * Customer-facing discovery: "which vehicles could serve me right now?"
 * Open to any authenticated user (a customer browsing the Taxi/Bike/Parcel
 * screens), read-only, and only ever exposes what a rider legitimately
 * needs to see about a driver.
 */
@Controller('drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(private readonly driver: DriverService) {}

  @Get('nearby')
  nearby(@Query() query: NearbyDriversQueryDto) {
    return this.driver.nearby(query.service, query.lat, query.lng, query.weightKg);
  }
}