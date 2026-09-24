import { Controller, Get, Header, HttpCode, Param, Post, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import { from, interval, map, merge, mergeMap, type Observable } from 'rxjs';
import { DispatchService } from './dispatch.service';
import { DriverEventsBus } from './driver-events.bus';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/** A driver's ride offers. Every route is scoped to the calling driver. */
@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class OffersController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly bus: DriverEventsBus,
  ) {}

  @Get('offers/pending')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.dispatch.pending(user.id);
  }

  @Post('offers/:id/accept')
  @HttpCode(200)
  async accept(@CurrentUser() user: AuthenticatedUser, @Param('id') offerId: string) {
    const ride = await this.dispatch.acceptOffer(user.id, offerId);
    return { rideId: ride.id, status: ride.status };
  }

  @Post('offers/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') offerId: string) {
    return this.dispatch.decline(user.id, offerId);
  }

  /**
   * Server-sent events: live offers, withdrawals and status changes. Starts by
   * replaying any offer still open, so a reconnect never loses one. The
   * heartbeat keeps proxies from closing an idle connection.
   */
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    const open = from(this.dispatch.pending(user.id)).pipe(
      mergeMap((offers) => offers.map((data) => ({ type: 'offer', data }))),
    );
    const beat = interval(25_000).pipe(map(() => ({ type: 'ping', data: {} })));
    return merge(open, this.bus.stream(user.id), beat).pipe(
      map((e) => ({ type: e.type, data: e.data as object }) as MessageEvent),
    );
  }
}
