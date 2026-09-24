import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { EligibilityService } from './eligibility.service';
import { PresenceService } from './presence.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

export class GoOnlineDto {
  @IsNumber({}, { message: 'Turn on location to go online.' }) @IsLatitude()
  lat!: number;

  @IsNumber({}, { message: 'Turn on location to go online.' }) @IsLongitude()
  lng!: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100000)
  accuracy?: number;
}

/** Go online / offline and ask "why can't I?". Every route is the calling driver's own. */
@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class PresenceController {
  constructor(
    private readonly presence: PresenceService,
    private readonly eligibility: EligibilityService,
  ) {}

  @Post('go-online')
  @HttpCode(200)
  goOnline(@CurrentUser() user: AuthenticatedUser, @Body() dto: GoOnlineDto) {
    return this.presence.goOnline(user.id, { lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy });
  }

  @Post('go-offline')
  @HttpCode(200)
  goOffline(@CurrentUser() user: AuthenticatedUser) {
    return this.presence.goOffline(user.id);
  }

  /** The exact reasons, in plain language, the driver cannot go online right now. */
  @Get('eligibility')
  eligible(@CurrentUser() user: AuthenticatedUser) {
    return this.eligibility.check(user.id, { requireOnline: false, requireLocation: false });
  }
}
