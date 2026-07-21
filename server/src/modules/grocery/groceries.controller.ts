import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CreateGroceryReviewDto, PlaceOrderDto } from './dto/grocery.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { GroceryService } from './grocery.service';

/**
 * Customer-facing store browsing/ordering, mirroring RestaurantsController's
 * shape: search and detail are public; placing an order requires a
 * logged-in customer. 'orders/mine' is declared before ':id' — Nest
 * matches routes in declaration order.
 */
@Controller('grocery-stores')
export class GroceriesController {
  constructor(private readonly grocery: GroceryService) {}

  @Get()
  search(@Query('city') city?: string) {
    return this.grocery.search(city);
  }

  @Get('orders/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.grocery.myOrders(user.id);
  }

  @Post('orders/:orderId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.grocery.cancelOrder(user.id, orderId);
  }

  @Post('orders/:orderId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  submitReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateGroceryReviewDto,
  ) {
    return this.grocery.submitReview(user.id, orderId, dto);
  }

  @Get('orders/:orderId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myReview(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.grocery.myReview(user.id, orderId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.grocery.detail(id);
  }

  @Post(':id/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  placeOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PlaceOrderDto) {
    return this.grocery.placeOrder(user.id, id, dto);
  }
}