import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ProfileService } from './profile.service';
import { ChangePasswordDto, SetBusinessProfileDto, SetCustomerProfileDto } from './dto/profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Post('customer')
  setCustomer(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetCustomerProfileDto) {
    return this.profile.setCustomerProfile(user.id, dto);
  }

  @Post('business')
  setBusiness(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetBusinessProfileDto) {
    return this.profile.setBusinessProfile(user.id, dto);
  }

  // Rate-limited: password guessing through this endpoint must be slow.
  @Patch('password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.profile.changePassword(user.id, dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.me(user.id);
  }
}