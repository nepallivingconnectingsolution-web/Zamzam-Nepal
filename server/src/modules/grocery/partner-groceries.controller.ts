import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { GroceryService } from './grocery.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateStoreDto,
  UpdateCategoryDto,
  UpdateOrderStatusDto,
  UpdateProductDto,
  UpdateStoreDto,
} from './dto/grocery.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('grocery/stores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('grocery')
export class PartnerGroceriesController {
  constructor(private readonly grocery: GroceryService) {}

  @Get()
  myStores(@CurrentUser() user: AuthenticatedUser) {
    return this.grocery.partnerStores(user.id);
  }

  @Post()
  createStore(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStoreDto) {
    return this.grocery.createStore(user.id, dto);
  }

  /* ── Orders (declared before ':id' routes) ── */

  @Get('orders/all')
  orders(@CurrentUser() user: AuthenticatedUser) {
    return this.grocery.partnerOrders(user.id);
  }

  @Get('orders/:orderId')
  orderDetail(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.grocery.partnerOrderDetail(user.id, orderId);
  }

  @Post('orders/:orderId/status')
  updateOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.grocery.updateOrderStatus(user.id, orderId, dto.status);
  }

  /* ── Reviews ── */

  @Get('reviews/all')
  reviews(@CurrentUser() user: AuthenticatedUser) {
    return this.grocery.partnerReviews(user.id);
  }

  @Get('reviews/summary')
  reviewSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.grocery.partnerReviewSummary(user.id);
  }

  /* ── Store CRUD ── */

  @Patch(':id')
  updateStore(@CurrentUser() user: AuthenticatedUser, @Param('id') storeId: string, @Body() dto: UpdateStoreDto) {
    return this.grocery.updateStore(user.id, storeId, dto);
  }

  @Delete(':id')
  deleteStore(@CurrentUser() user: AuthenticatedUser, @Param('id') storeId: string) {
    return this.grocery.deleteStore(user.id, storeId);
  }

  /* ── Categories ── */

  @Get(':id/categories')
  categories(@CurrentUser() user: AuthenticatedUser, @Param('id') storeId: string) {
    return this.grocery.storeCategories(user.id, storeId);
  }

  @Post(':id/categories')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.grocery.createCategory(user.id, storeId, dto);
  }

  @Patch(':id/categories/:categoryId')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.grocery.updateCategory(user.id, storeId, categoryId, dto);
  }

  @Delete(':id/categories/:categoryId')
  deleteCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.grocery.deleteCategory(user.id, storeId, categoryId);
  }

  /* ── Products ── */

  @Get(':id/products')
  products(@CurrentUser() user: AuthenticatedUser, @Param('id') storeId: string) {
    return this.grocery.storeProducts(user.id, storeId);
  }

  @Post(':id/products')
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.grocery.createProduct(user.id, storeId, dto);
  }

  @Patch(':id/products/:productId')
  updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.grocery.updateProduct(user.id, storeId, productId, dto);
  }

  @Post(':id/products/:productId/restock')
  restockProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Param('productId') productId: string,
    @Body() body: { quantity: number },
  ) {
    return this.grocery.restockProduct(user.id, storeId, productId, Number(body.quantity) || 0);
  }

  @Delete(':id/products/:productId')
  deleteProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Param('productId') productId: string,
  ) {
    return this.grocery.deleteProduct(user.id, storeId, productId);
  }
}

@Controller('grocery')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('grocery')
export class PartnerGroceryMetricsController {
  constructor(private readonly grocery: GroceryService) {}

  @Get('metrics')
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.grocery.metrics(user.id);
  }

  @Get('revenue')
  revenue(@CurrentUser() user: AuthenticatedUser) {
    return this.grocery.partnerRevenue(user.id);
  }
}