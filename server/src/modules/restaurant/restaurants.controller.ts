import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CreateFoodReviewDto, PlaceOrderDto } from './dto/restaurant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RestaurantService } from './restaurant.service';

/**
 * Customer-facing restaurant browsing/ordering, mirroring HotelsController's
 * shape: search and detail are public so visitors can browse a menu before
 * signing in; placing an order requires a logged-in customer. Note the
 * literal 'orders/mine' route is declared before ':id', same reason as
 * hotels' 'bookings/mine' — Nest matches in declaration order.
 */
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get()
  search(@Query('city') city?: string, @Query('cuisine') cuisine?: string) {
    return this.restaurant.search(city, cuisine);
  }

  @Get('orders/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurant.myOrders(user.id);
  }

  @Post('orders/:orderId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.restaurant.cancelOrder(user.id, orderId);
  }

  @Post('orders/:orderId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  submitReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateFoodReviewDto,
  ) {
    return this.restaurant.submitReview(user.id, orderId, dto);
  }

  @Get('orders/:orderId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myReview(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.restaurant.myReview(user.id, orderId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.restaurant.detail(id);
  }

  @Post(':id/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PlaceOrderDto,
  ) {
    return this.restaurant.placeOrder(user.id, id, dto);
  }
}