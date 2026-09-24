import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Matches } from 'class-validator';
import { OtpService } from './otp.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

export class VerifyOtpDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' })
  code!: string;
}

@Controller('driver/otp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('send')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  send(@CurrentUser() user: AuthenticatedUser) {
    return this.otp.send(user.id);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyOtpDto) {
    return this.otp.verify(user.id, dto.code);
  }
}
