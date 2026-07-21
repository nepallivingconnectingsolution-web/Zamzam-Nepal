import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import {
  restaurants,
  menuCategories,
  menuItems,
  foodOrders,
  foodOrderItems,
  foodReviews,
  transactions,
  users,
} from '../../database/schema';
import { id, bookingRef } from '../../common/id';
import { creditWallet, debitWalletOrFail, refundsToWallet } from '../../common/wallet.util';
import { apiError } from '../../common/exceptions';
import type {
  CreateCategoryDto,
  CreateFoodReviewDto,
  CreateMenuItemDto,
  CreateRestaurantDto,
  OrderStatus,
  PlaceOrderDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
  UpdateRestaurantDto,
} from './dto/restaurant.dto';
import { NotificationsService } from '../notifications/notifications.service';


const SERVICE_FEE_RATE = 0.02; // Zamzam's platform commission, same rate as hotels.

/** One snapshot line item of an order, as returned to both customer and partner views. */
type OrderLineItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isVeg: boolean;
};

/**
 * Legal order-status transitions. Kitchen/partner moves an order forward
 * one hop at a time; anything not listed here is rejected with a 400, so
 * a DELIVERED order can never quietly become PREPARING again.
 */
const STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

function todayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class RestaurantService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database,
  private readonly notifications: NotificationsService,
) {}

  /* ───────────────────────────── Customer-facing ─────────────────────── */

  async search(city?: string, cuisine?: string) {
    const conditions = [eq(restaurants.isActive, true)];
    if (city) conditions.push(ilike(restaurants.city, `%${city}%`));
    if (cuisine) conditions.push(ilike(restaurants.cuisine, `%${cuisine}%`));

    const rows = await this.db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        city: restaurants.city,
        address: restaurants.address,
        description: restaurants.description,
        cuisine: restaurants.cuisine,
        photos: restaurants.photos,
        openTime: restaurants.openTime,
        closeTime: restaurants.closeTime,
        deliveryFee: restaurants.deliveryFee,
        minOrder: restaurants.minOrder,
        partnerName: users.name,
        businessName: users.businessName,
      })
      .from(restaurants)
      .innerJoin(users, eq(users.id, restaurants.partnerId))
      .where(and(...conditions))
      .orderBy(asc(restaurants.name));

    // "From price" per restaurant — cheapest available dish, one grouped
    // query instead of N+1, same trick as HotelService.search().
    const fromPrices = await this.db
      .select({
        restaurantId: menuItems.restaurantId,
        minPrice: sql<string>`min(${menuItems.price})`,
      })
      .from(menuItems)
      .where(eq(menuItems.isAvailable, true))
      .groupBy(menuItems.restaurantId);
    const priceByRestaurant = new Map(fromPrices.map((p) => [p.restaurantId, Number(p.minPrice)]));

    // Average rating per restaurant, also one grouped query.
    const ratings = await this.db
      .select({
        restaurantId: foodReviews.restaurantId,
        avg: sql<string>`avg(${foodReviews.rating})`,
        count: sql<number>`count(*)::int`,
      })
      .from(foodReviews)
      .groupBy(foodReviews.restaurantId);
    const ratingByRestaurant = new Map(
      ratings.map((r) => [r.restaurantId, { average: Math.round(Number(r.avg) * 10) / 10, count: r.count }]),
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      address: r.address,
      description: r.description,
      cuisine: r.cuisine,
      photos: r.photos,
      openTime: r.openTime,
      closeTime: r.closeTime,
      deliveryFee: Number(r.deliveryFee),
      minOrder: Number(r.minOrder),
      fromPrice: priceByRestaurant.get(r.id) ?? null,
      rating: ratingByRestaurant.get(r.id) ?? null,
      operator: r.businessName ?? r.partnerName ?? 'Restaurant partner',
    }));
  }

  async detail(restaurantId: string) {
    const [restaurant] = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    if (!restaurant || !restaurant.isActive) apiError(404, 'This restaurant is no longer available.');

    const categories = await this.db
      .select()
      .from(menuCategories)
      .where(and(eq(menuCategories.restaurantId, restaurantId), eq(menuCategories.isActive, true)))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));

    const items = await this.db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.isAvailable, true)))
      .orderBy(asc(menuItems.name));

    const toItem = (i: typeof menuItems.$inferSelect) => ({
      id: i.id,
      categoryId: i.categoryId,
      name: i.name,
      description: i.description,
      price: Number(i.price),
      isVeg: i.isVeg,
      spiceLevel: i.spiceLevel,
      prepTimeMin: i.prepTimeMin,
      photo: i.photo,
      tags: i.tags,
    });

    const grouped = categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: items.filter((i) => i.categoryId === c.id).map(toItem),
    }));
    const uncategorized = items.filter((i) => !i.categoryId || !categories.some((c) => c.id === i.categoryId));
    if (uncategorized.length > 0) {
      grouped.push({ id: 'uncategorized', name: 'Menu', items: uncategorized.map(toItem) });
    }

    return {
      id: restaurant.id,
      name: restaurant.name,
      city: restaurant.city,
      address: restaurant.address,
      description: restaurant.description,
      cuisine: restaurant.cuisine,
      photos: restaurant.photos,
      openTime: restaurant.openTime,
      closeTime: restaurant.closeTime,
      deliveryFee: Number(restaurant.deliveryFee),
      minOrder: Number(restaurant.minOrder),
      categories: grouped.filter((g) => g.items.length > 0),
    };
  }

  /**
   * Places an order. All prices are computed server-side from the current
   * menu rows — the client only ever sends { menuItemId, quantity }, so a
   * tampered cart can't set its own prices. The read-and-insert happens in
   * one transaction, and the order + its line items + the payment
   * transaction commit or roll back together.
   */
  async placeOrder(customerId: string, restaurantId: string, dto: PlaceOrderDto) {
    if (dto.fulfillment === 'delivery' && !dto.deliveryAddress?.trim()) {
      apiError(400, 'A delivery address is required for delivery orders.');
    }

    return this.db.transaction(async (tx) => {
      const [restaurant] = await tx
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);
      if (!restaurant || !restaurant.isActive) apiError(404, 'This restaurant is no longer available.');

      // Collapse duplicate menuItemIds into one line with summed quantity.
      const qtyById = new Map<string, number>();
      for (const line of dto.items) {
        qtyById.set(line.menuItemId, (qtyById.get(line.menuItemId) ?? 0) + line.quantity);
      }
      const itemIds = [...qtyById.keys()];

      const rows = await tx
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.restaurantId, restaurantId), inArray(menuItems.id, itemIds)));

      if (rows.length !== itemIds.length) {
        apiError(400, 'One or more items in your cart are no longer on the menu.');
      }
      const unavailable = rows.find((r) => !r.isAvailable);
      if (unavailable) apiError(409, `"${unavailable.name}" is currently unavailable.`);

      let itemsTotal = 0;
      const lines = rows.map((r) => {
        const quantity = qtyById.get(r.id)!;
        const lineTotal = Number(r.price) * quantity;
        itemsTotal += lineTotal;
        return { row: r, quantity, lineTotal };
      });

      if (itemsTotal < Number(restaurant.minOrder)) {
        apiError(400, `Minimum order for this restaurant is रू ${Number(restaurant.minOrder).toLocaleString()}.`);
      }

      const deliveryFee = dto.fulfillment === 'delivery' ? Number(restaurant.deliveryFee) : 0;
      const serviceFee = Math.round(itemsTotal * SERVICE_FEE_RATE);
      const grandTotal = itemsTotal + deliveryFee + serviceFee;
      const ref = bookingRef();
      const orderId = id('fo');

      // Wallet payments must actually move money: atomic conditional debit,
      // 402 on insufficient balance. External methods never touch the wallet.
      if (dto.method === 'wallet') {
        await debitWalletOrFail(tx, customerId, grandTotal.toFixed(2));
      }

      await tx.insert(foodOrders).values({
        id: orderId,
        orderRef: ref,
        customerId,
        restaurantId,
        status: 'PENDING',
        fulfillment: dto.fulfillment,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        deliveryAddress: dto.fulfillment === 'delivery' ? dto.deliveryAddress!.trim() : null,
        note: dto.note?.trim() || null,
        restaurantSnapshot: { restaurantName: restaurant.name, city: restaurant.city },
        itemsTotal: itemsTotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        serviceFee: serviceFee.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        method: dto.method,
      });

      await tx.insert(foodOrderItems).values(
        lines.map((l) => ({
          id: id('foi'),
          orderId,
          menuItemId: l.row.id,
          name: l.row.name,
          unitPrice: l.row.price,
          quantity: l.quantity,
          lineTotal: l.lineTotal.toFixed(2),
          isVeg: l.row.isVeg,
        })),
      );

      // Food orders get their own transaction type, mirroring 'HOTEL'.
      await tx.insert(transactions).values({
        id: id('t'),
        userId: customerId,
        type: 'FOOD',
        status: 'SUCCESS',
        amount: grandTotal.toFixed(2),
        currency: 'NPR',
        description: `Food order · ${restaurant.name}`,
        inbound: false,
      });

      return { orderRef: ref, orderId };
    });
  }

  async myOrders(customerId: string) {
    const rows = await this.db
      .select()
      .from(foodOrders)
      .where(eq(foodOrders.customerId, customerId))
      .orderBy(desc(foodOrders.placedAt));
    const items = await this.itemsForOrders(rows.map((o) => o.id));
    return rows.map((o) => this.toOrderDto(o, null, items.get(o.id) ?? []));
  }

  /** Customers may only cancel while the kitchen hasn't accepted yet. */
  async cancelOrder(customerId: string, orderId: string) {
    const [order] = await this.db.select().from(foodOrders).where(eq(foodOrders.id, orderId)).limit(1);
    if (!order) apiError(404, 'Order not found.');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('You can only cancel your own orders.');
    }
    if (order.status === 'CANCELLED') return { ok: true };
    if (order.status !== 'PENDING') {
      apiError(409, 'The kitchen has already accepted this order — contact the restaurant to cancel.');
    }

    await this.refundAndCancel(order);
    return { ok: true };
  }

  async submitReview(customerId: string, orderId: string, dto: CreateFoodReviewDto) {
    const [order] = await this.db.select().from(foodOrders).where(eq(foodOrders.id, orderId)).limit(1);
    if (!order) apiError(404, 'Order not found.');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own orders.');
    }
    if (order.status !== 'DELIVERED') apiError(400, 'You can review an order once it has been delivered.');

    const [existing] = await this.db
      .select()
      .from(foodReviews)
      .where(eq(foodReviews.orderId, orderId))
      .limit(1);
    if (existing) apiError(409, 'You already reviewed this order.');

    const [review] = await this.db
      .insert(foodReviews)
      .values({
        id: id('frv'),
        orderId,
        restaurantId: order.restaurantId,
        customerId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      })
      .returning();
    return this.toReviewDto(review);
  }

  /** null (not 404) when no review yet — frontend shows the form. */
  async myReview(customerId: string, orderId: string) {
    const [review] = await this.db
      .select()
      .from(foodReviews)
      .where(eq(foodReviews.orderId, orderId))
      .limit(1);
    if (!review || review.customerId !== customerId) return null;
    return this.toReviewDto(review);
  }

  /* ───────────────────────────── Partner-facing ───────────────────────── */

  async partnerRestaurants(partnerId: string) {
    const rows = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.partnerId, partnerId))
      .orderBy(desc(restaurants.createdAt));
    return rows.map((r) => ({ ...r, deliveryFee: Number(r.deliveryFee), minOrder: Number(r.minOrder) }));
  }

  async createRestaurant(partnerId: string, dto: CreateRestaurantDto) {
    const [restaurant] = await this.db
      .insert(restaurants)
      .values({
        id: id('rst'),
        partnerId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
        description: dto.description ?? null,
        cuisine: dto.cuisine ?? 'Nepali',
        photos: dto.photos ?? [],
        openTime: dto.openTime ?? '09:00',
        closeTime: dto.closeTime ?? '21:00',
        deliveryFee: (dto.deliveryFee ?? 0).toFixed(2),
        minOrder: (dto.minOrder ?? 0).toFixed(2),
        isActive: true,
      })
      .returning();

    const [partner] = await this.db
      .select({ name: users.name, businessName: users.businessName })
      .from(users)
      .where(eq(users.id, partnerId))
      .limit(1);
    await this.notifications.notify({
      type: 'business_created',
      title: 'New restaurant added',
      message: `${partner?.businessName ?? partner?.name ?? 'A partner'} added a new restaurant: "${restaurant.name}".`,
      entityType: 'partner',
      entityId: partnerId,
    });
    return { ...restaurant, deliveryFee: Number(restaurant.deliveryFee), minOrder: Number(restaurant.minOrder) };
  }

  async updateRestaurant(partnerId: string, restaurantId: string, dto: UpdateRestaurantDto) {
    const existing = await this.assertOwnedRestaurant(partnerId, restaurantId);
    const [updated] = await this.db
      .update(restaurants)
      .set({
        name: dto.name,
        city: dto.city,
        address: dto.address,
        description: dto.description ?? null,
        cuisine: dto.cuisine ?? existing.cuisine,
        photos: dto.photos ?? existing.photos,
        openTime: dto.openTime ?? existing.openTime,
        closeTime: dto.closeTime ?? existing.closeTime,
        deliveryFee: dto.deliveryFee != null ? dto.deliveryFee.toFixed(2) : existing.deliveryFee,
        minOrder: dto.minOrder != null ? dto.minOrder.toFixed(2) : existing.minOrder,
      })
      .where(eq(restaurants.id, restaurantId))
      .returning();
    return { ...updated, deliveryFee: Number(updated.deliveryFee), minOrder: Number(updated.minOrder) };
  }

  async deleteRestaurant(partnerId: string, restaurantId: string) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    await this.db.delete(restaurants).where(eq(restaurants.id, restaurantId));
    return { ok: true };
  }

  /* ── Categories ── */

  async restaurantCategories(partnerId: string, restaurantId: string) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    return this.db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.restaurantId, restaurantId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  }

  async createCategory(partnerId: string, restaurantId: string, dto: CreateCategoryDto) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    const [category] = await this.db
      .insert(menuCategories)
      .values({
        id: id('mc'),
        restaurantId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      })
      .returning();
    return category;
  }

  async updateCategory(partnerId: string, restaurantId: string, categoryId: string, dto: UpdateCategoryDto) {
    await this.assertOwnedCategory(partnerId, restaurantId, categoryId);
    const [updated] = await this.db
      .update(menuCategories)
      .set({ name: dto.name, sortOrder: dto.sortOrder ?? 0 })
      .where(eq(menuCategories.id, categoryId))
      .returning();
    return updated;
  }

  async deleteCategory(partnerId: string, restaurantId: string, categoryId: string) {
    await this.assertOwnedCategory(partnerId, restaurantId, categoryId);
    // menu_items.category_id is ON DELETE SET NULL — dishes survive and
    // fall back to the generic "Menu" group.
    await this.db.delete(menuCategories).where(eq(menuCategories.id, categoryId));
    return { ok: true };
  }

  /* ── Menu items ── */

  async restaurantMenuItems(partnerId: string, restaurantId: string) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    const rows = await this.db
      .select()
      .from(menuItems)
      .where(eq(menuItems.restaurantId, restaurantId))
      .orderBy(asc(menuItems.name));
    return rows.map((i) => ({ ...i, price: Number(i.price) }));
  }

  async createMenuItem(partnerId: string, restaurantId: string, dto: CreateMenuItemDto) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    if (dto.categoryId) await this.assertOwnedCategory(partnerId, restaurantId, dto.categoryId);
    const [item] = await this.db
      .insert(menuItems)
      .values({
        id: id('mi'),
        restaurantId,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price.toFixed(2),
        isVeg: dto.isVeg ?? false,
        spiceLevel: dto.spiceLevel ?? 0,
        prepTimeMin: dto.prepTimeMin ?? 20,
        photo: dto.photo ?? null,
        tags: dto.tags ?? [],
        isAvailable: dto.isAvailable ?? true,
      })
      .returning();
    return { ...item, price: Number(item.price) };
  }

  async updateMenuItem(partnerId: string, restaurantId: string, itemId: string, dto: UpdateMenuItemDto) {
    await this.assertOwnedMenuItem(partnerId, restaurantId, itemId);
    if (dto.categoryId) await this.assertOwnedCategory(partnerId, restaurantId, dto.categoryId);
    const [updated] = await this.db
      .update(menuItems)
      .set({
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price.toFixed(2),
        isVeg: dto.isVeg ?? false,
        spiceLevel: dto.spiceLevel ?? 0,
        prepTimeMin: dto.prepTimeMin ?? 20,
        photo: dto.photo ?? null,
        tags: dto.tags ?? [],
        isAvailable: dto.isAvailable ?? true,
      })
      .where(eq(menuItems.id, itemId))
      .returning();
    return { ...updated, price: Number(updated.price) };
  }

  async deleteMenuItem(partnerId: string, restaurantId: string, itemId: string) {
    await this.assertOwnedMenuItem(partnerId, restaurantId, itemId);
    await this.db.delete(menuItems).where(eq(menuItems.id, itemId));
    return { ok: true };
  }

  /* ── Orders ── */

  async partnerOrders(partnerId: string) {
    const restaurantIds = await this.partnerRestaurantIds(partnerId);
    if (restaurantIds.length === 0) return [];

    const rows = await this.db
      .select({
        order: foodOrders,
        account: {
          name: users.name,
          email: users.email,
          mobile: users.mobile,
          kycStatus: users.kycStatus,
        },
      })
      .from(foodOrders)
      .innerJoin(users, eq(users.id, foodOrders.customerId))
      .where(inArray(foodOrders.restaurantId, restaurantIds))
      .orderBy(desc(foodOrders.placedAt));

    const items = await this.itemsForOrders(rows.map((r) => r.order.id));
    return rows.map((r) => this.toOrderDto(r.order, r.account, items.get(r.order.id) ?? []));
  }

  async partnerOrderDetail(partnerId: string, orderId: string) {
    const [row] = await this.db
      .select({
        order: foodOrders,
        account: {
          name: users.name,
          email: users.email,
          mobile: users.mobile,
          kycStatus: users.kycStatus,
        },
      })
      .from(foodOrders)
      .innerJoin(users, eq(users.id, foodOrders.customerId))
      .where(eq(foodOrders.id, orderId))
      .limit(1);

    if (!row) apiError(404, 'Order not found.');
    await this.assertOwnedRestaurant(partnerId, row.order.restaurantId);

    const items = await this.itemsForOrders([row.order.id]);
    return this.toOrderDto(row.order, row.account, items.get(row.order.id) ?? []);
  }

  /**
   * Advances an order one legal hop along STATUS_FLOW. Cancelling from
   * PENDING/ACCEPTED refunds the customer's wallet — the same
   * refund-on-cancel behaviour as hotel bookings.
   */
  async updateOrderStatus(partnerId: string, orderId: string, next: OrderStatus) {
    const [order] = await this.db.select().from(foodOrders).where(eq(foodOrders.id, orderId)).limit(1);
    if (!order) apiError(404, 'Order not found.');
    await this.assertOwnedRestaurant(partnerId, order.restaurantId);

    if (order.status === next) return { ok: true, status: next };
    if (!STATUS_FLOW[order.status].includes(next)) {
      apiError(400, `An order that is ${order.status.toLowerCase().replace(/_/g, ' ')} can't move to ${next.toLowerCase().replace(/_/g, ' ')}.`);
    }
    if (next === 'OUT_FOR_DELIVERY' && order.fulfillment !== 'delivery') {
      apiError(400, 'Pickup orders go straight from ready to delivered.');
    }

    if (next === 'CANCELLED') {
      await this.refundAndCancel(order);
      return { ok: true, status: 'CANCELLED' as const };
    }

    await this.db
      .update(foodOrders)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(foodOrders.id, orderId));
    return { ok: true, status: next };
  }

  /* ── Reviews ── */

  async partnerReviews(partnerId: string) {
    const restaurantIds = await this.partnerRestaurantIds(partnerId);
    if (restaurantIds.length === 0) return [];

    const rows = await this.db
      .select({
        review: foodReviews,
        guestName: users.name,
        orderRef: foodOrders.orderRef,
        restaurantSnapshot: foodOrders.restaurantSnapshot,
        placedAt: foodOrders.placedAt,
      })
      .from(foodReviews)
      .innerJoin(users, eq(users.id, foodReviews.customerId))
      .innerJoin(foodOrders, eq(foodOrders.id, foodReviews.orderId))
      .where(inArray(foodReviews.restaurantId, restaurantIds))
      .orderBy(desc(foodReviews.createdAt));

    return rows.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      comment: r.review.comment,
      createdAt: r.review.createdAt.toISOString(),
      guestName: r.guestName,
      orderRef: r.orderRef,
      restaurantName: r.restaurantSnapshot.restaurantName,
      orderedAt: r.placedAt.toISOString(),
    }));
  }

  async partnerReviewSummary(partnerId: string) {
    const reviews = await this.partnerReviews(partnerId);
    const count = reviews.length;
    const average = count === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    return { average: Math.round(average * 10) / 10, count, distribution };
  }

  /* ── Metrics & revenue ── */

  async metrics(partnerId: string) {
    const orders = await this.partnerOrders(partnerId);
    const today = todayIso();
    const monthPrefix = today.slice(0, 7);

    const ordersToday = orders.filter((o) => o.placedAt.slice(0, 10) === today).length;
    const pendingOrders = orders.filter((o) => o.status === 'PENDING').length;
    const revenueMonth = orders
      .filter((o) => o.status !== 'CANCELLED' && o.placedAt.slice(0, 7) === monthPrefix)
      .reduce((sum, o) => sum + o.itemsTotal + o.deliveryFee, 0);

    const { average } = await this.partnerReviewSummary(partnerId);

    return {
      ordersToday,
      pendingOrders,
      rating: average,
      revenueMonth,
      series: [] as { label: string; value: number }[],
    };
  }

  /**
   * Same accounting model as HotelService.partnerRevenue(): the 2% service
   * fee is Zamzam's commission and is never counted as the restaurant's
   * revenue; delivery fee is the restaurant's; cancelled orders are
   * reported separately as refunds.
   */
  async partnerRevenue(partnerId: string) {
    const orders = await this.partnerOrders(partnerId);
    const today = todayIso();
    const monthPrefix = today.slice(0, 7);

    type Bucket = {
      orders: number;
      grossRevenue: number;
      platformFee: number;
      netProfit: number;
      cancelled: number;
      refunded: number;
    };
    const emptyBucket = (): Bucket => ({
      orders: 0,
      grossRevenue: 0,
      platformFee: 0,
      netProfit: 0,
      cancelled: 0,
      refunded: 0,
    });

    const byDate = new Map<string, Bucket>();
    for (const o of orders) {
      const date = o.placedAt.slice(0, 10);
      const bucket = byDate.get(date) ?? emptyBucket();
      if (o.status !== 'CANCELLED') {
        const take = o.itemsTotal + o.deliveryFee;
        bucket.orders += 1;
        bucket.grossRevenue += take;
        bucket.platformFee += o.serviceFee;
        bucket.netProfit += take;
      } else {
        bucket.cancelled += 1;
        bucket.refunded += o.grandTotal;
      }
      byDate.set(date, bucket);
    }

    const daily: (Bucket & { date: string })[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily.push({ date: key, ...(byDate.get(key) ?? emptyBucket()) });
    }

    const active = orders.filter((o) => o.status !== 'CANCELLED');
    const cancelled = orders.filter((o) => o.status === 'CANCELLED');
    const totalRevenue = active.reduce((sum, o) => sum + o.itemsTotal + o.deliveryFee, 0);
    const totalPlatformFee = active.reduce((sum, o) => sum + o.serviceFee, 0);
    const totalRefunded = cancelled.reduce((sum, o) => sum + o.grandTotal, 0);

    return {
      summary: {
        todayRevenue: byDate.get(today)?.netProfit ?? 0,
        monthRevenue: active
          .filter((o) => o.placedAt.slice(0, 7) === monthPrefix)
          .reduce((sum, o) => sum + o.itemsTotal + o.deliveryFee, 0),
        totalRevenue,
        totalPlatformFee,
        totalRefunded,
        netProfit: totalRevenue,
        totalOrders: active.length,
        totalCancelled: cancelled.length,
        avgOrderValue: active.length ? totalRevenue / active.length : 0,
      },
      daily,
    };
  }

  /* ───────────────────────────── Internals ────────────────────────────── */

  /** Shared by customer- and partner-initiated cancellation: flip status, refund wallet, log the refund. */
  private async refundAndCancel(order: typeof foodOrders.$inferSelect) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(foodOrders)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(foodOrders.id, order.id));

      // Wallet is only credited when the order was paid from the wallet —
      // crediting external-method orders minted free balance on cancel.
      const walletRefund = refundsToWallet(order.method);
      if (walletRefund) {
        await creditWallet(tx, order.customerId, order.grandTotal);
      }

      await tx.insert(transactions).values({
        id: id('t'),
        userId: order.customerId,
        type: 'REFUND',
        status: walletRefund ? 'SUCCESS' : 'PENDING',
        amount: order.grandTotal,
        currency: 'NPR',
        description: walletRefund
          ? `Refund · cancelled food order ${order.orderRef}`
          : `Refund · cancelled food order ${order.orderRef} — will be returned to your original payment method`,
        inbound: true,
      });
    });
  }

  /** Fetches line items for many orders in one query, grouped by orderId. */
  private async itemsForOrders(orderIds: string[]): Promise<Map<string, OrderLineItem[]>> {
    const map = new Map<string, OrderLineItem[]>();
    if (orderIds.length === 0) return map;
    const rows = await this.db.select().from(foodOrderItems).where(inArray(foodOrderItems.orderId, orderIds));
    for (const r of rows) {
      const list = map.get(r.orderId) ?? [];
      list.push({
        id: r.id,
        name: r.name,
        unitPrice: Number(r.unitPrice),
        quantity: r.quantity,
        lineTotal: Number(r.lineTotal),
        isVeg: r.isVeg,
      });
      map.set(r.orderId, list);
    }
    return map;
  }

  private toOrderDto(
    o: typeof foodOrders.$inferSelect,
    account: { name: string; email: string; mobile: string; kycStatus: string } | null,
    items: OrderLineItem[],
  ) {
    return {
      id: o.id,
      orderRef: o.orderRef,
      status: o.status,
      fulfillment: o.fulfillment,
      restaurant: o.restaurantSnapshot,
      restaurantId: o.restaurantId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      deliveryAddress: o.deliveryAddress,
      note: o.note,
      items,
      itemsTotal: Number(o.itemsTotal),
      deliveryFee: Number(o.deliveryFee),
      serviceFee: Number(o.serviceFee),
      grandTotal: Number(o.grandTotal),
      method: o.method,
      placedAt: o.placedAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      account: account
        ? { name: account.name, email: account.email, mobile: account.mobile, kycStatus: account.kycStatus }
        : null,
    };
  }

  private toReviewDto(r: typeof foodReviews.$inferSelect) {
    return {
      id: r.id,
      orderId: r.orderId,
      restaurantId: r.restaurantId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async partnerRestaurantIds(partnerId: string) {
    const rows = await this.db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.partnerId, partnerId));
    return rows.map((r) => r.id);
  }

  private async assertOwnedRestaurant(partnerId: string, restaurantId: string) {
    const [restaurant] = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    if (!restaurant) apiError(404, 'Restaurant not found.');
    if (restaurant.partnerId !== partnerId) throw new ForbiddenException('Not your restaurant.');
    return restaurant;
  }

  private async assertOwnedCategory(partnerId: string, restaurantId: string, categoryId: string) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    const [category] = await this.db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.id, categoryId))
      .limit(1);
    if (!category || category.restaurantId !== restaurantId) apiError(404, 'Category not found.');
    return category;
  }

  private async assertOwnedMenuItem(partnerId: string, restaurantId: string, itemId: string) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    const [item] = await this.db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
    if (!item || item.restaurantId !== restaurantId) apiError(404, 'Menu item not found.');
    return item;
  }
}