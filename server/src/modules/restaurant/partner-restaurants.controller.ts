import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  CreateRestaurantDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
  UpdateOrderStatusDto,
  UpdateRestaurantDto,
} from './dto/restaurant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('restaurant/restaurants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant')
export class PartnerRestaurantsController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get()
  myRestaurants(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurant.partnerRestaurants(user.id);
  }

  @Post()
  createRestaurant(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRestaurantDto) {
    return this.restaurant.createRestaurant(user.id, dto);
  }

  /* ── Orders (declared before ':id' routes, same pattern as hotels) ── */

  @Get('orders/all')
  orders(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurant.partnerOrders(user.id);
  }

  @Get('orders/:orderId')
  orderDetail(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.restaurant.partnerOrderDetail(user.id, orderId);
  }

  @Post('orders/:orderId/status')
  updateOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.restaurant.updateOrderStatus(user.id, orderId, dto.status);
  }

  /* ── Reviews ── */

  @Get('reviews/all')
  reviews(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurant.partnerReviews(user.id);
  }

  @Get('reviews/summary')
  reviewSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurant.partnerReviewSummary(user.id);
  }

  /* ── Restaurant CRUD ── */

  @Patch(':id')
  updateRestaurant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.restaurant.updateRestaurant(user.id, restaurantId, dto);
  }

  @Delete(':id')
  deleteRestaurant(@CurrentUser() user: AuthenticatedUser, @Param('id') restaurantId: string) {
    return this.restaurant.deleteRestaurant(user.id, restaurantId);
  }

  /* ── Categories ── */

  @Get(':id/categories')
  categories(@CurrentUser() user: AuthenticatedUser, @Param('id') restaurantId: string) {
    return this.restaurant.restaurantCategories(user.id, restaurantId);
  }

  @Post(':id/categories')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.restaurant.createCategory(user.id, restaurantId, dto);
  }

  @Patch(':id/categories/:categoryId')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.restaurant.updateCategory(user.id, restaurantId, categoryId, dto);
  }

  @Delete(':id/categories/:categoryId')
  deleteCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.restaurant.deleteCategory(user.id, restaurantId, categoryId);
  }

  /* ── Menu items ── */

  @Get(':id/items')
  menuItems(@CurrentUser() user: AuthenticatedUser, @Param('id') restaurantId: string) {
    return this.restaurant.restaurantMenuItems(user.id, restaurantId);
  }

  @Post(':id/items')
  createMenuItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.restaurant.createMenuItem(user.id, restaurantId, dto);
  }

  @Patch(':id/items/:itemId')
  updateMenuItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.restaurant.updateMenuItem(user.id, restaurantId, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  deleteMenuItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.restaurant.deleteMenuItem(user.id, restaurantId, itemId);
  }
}

@Controller('restaurant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant')
export class PartnerRestaurantMetricsController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get('metrics')
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurant.metrics(user.id);
  }

  @Get('revenue')
  revenue(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurant.partnerRevenue(user.id);
  }
}