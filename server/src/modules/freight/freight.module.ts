import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { FreightService } from './freight.service';
import { CreateLoadDto, CreateLoadReviewDto, PlaceBidDto } from './dto/freight.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Transporter-facing freight portal (role 'freight'): dashboard metrics,
 * the open-load market, bidding, and won shipments. This is the post-and-bid
 * counterpart to the on-demand rides engine — no live GPS matching, since
 * freight is scheduled/negotiated rather than instant.
 */
@Controller('freight')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('freight')
export class FreightController {
  constructor(private readonly freight: FreightService) {}

  @Get('metrics')
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.freight.metrics(user.id);
  }

  @Get('loads')
  openLoads(@CurrentUser() user: AuthenticatedUser) {
    return this.freight.openLoads(user.id);
  }

  @Post('loads/:id/bid')
  placeBid(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string, @Body() dto: PlaceBidDto) {
    return this.freight.placeBid(user.id, loadId, dto);
  }

  @Patch('bids/:id/withdraw')
  withdrawBid(@CurrentUser() user: AuthenticatedUser, @Param('id') bidId: string) {
    return this.freight.withdrawBid(user.id, bidId);
  }

  @Get('shipments')
  shipments(@CurrentUser() user: AuthenticatedUser) {
    return this.freight.myShipments(user.id);
  }

  @Patch('shipments/:id/in-transit')
  startShipment(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string) {
    return this.freight.advanceShipment(user.id, loadId, 'IN_TRANSIT');
  }

  @Patch('shipments/:id/delivered')
  deliverShipment(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string) {
    return this.freight.advanceShipment(user.id, loadId, 'DELIVERED');
  }

  @Get('reviews')
  reviews(@CurrentUser() user: AuthenticatedUser) {
    return this.freight.partnerReviews(user.id);
  }

 @Get('reviews/summary')
  reviewSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.freight.partnerReviewSummary(user.id);
  }

  @Get('revenue')
  revenue(@CurrentUser() user: AuthenticatedUser) {
    return this.freight.partnerRevenue(user.id);
  }
}

/**
 * Customer-facing freight: post a load, view bids, accept one. Open to any
 * authenticated customer (the Freight card in the marketplace).
 */
@Controller('loads')
@UseGuards(JwtAuthGuard)
export class LoadsController {
  constructor(private readonly freight: FreightService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLoadDto) {
    return this.freight.createLoad(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.freight.myLoads(user.id);
  }

  @Get(':id/bids')
  bids(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string) {
    return this.freight.loadBids(user.id, loadId);
  }

  @Post(':id/bids/:bidId/accept')
  acceptBid(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string, @Param('bidId') bidId: string) {
    return this.freight.acceptBid(user.id, loadId, bidId);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string) {
    return this.freight.cancelLoad(user.id, loadId);
  }

  @Post(':id/review')
  submitReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') loadId: string,
    @Body() dto: CreateLoadReviewDto,
  ) {
    return this.freight.submitReview(user.id, loadId, dto);
  }

  @Get(':id/review')
  myReview(@CurrentUser() user: AuthenticatedUser, @Param('id') loadId: string) {
    return this.freight.myReview(user.id, loadId);
  }
}

@Module({
  controllers: [FreightController, LoadsController],
  providers: [FreightService],
})
export class FreightModule {}