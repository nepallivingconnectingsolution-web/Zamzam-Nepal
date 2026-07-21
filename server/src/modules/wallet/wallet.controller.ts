import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/wallet.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('balance')
  balance(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.balance(user.id);
  }

  @Get('transactions')
  transactions(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.transactions(user.id);
  }

  // Rate-limited: a card/gateway top-up is not something a real person
  // does 10x a minute — this blunts scripted abuse of the sandbox flow.
  @Post('topup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  topup(@CurrentUser() user: AuthenticatedUser, @Body() dto: TopupDto) {
    return this.wallet.topup(user.id, dto.amount, dto.method);
  }
}