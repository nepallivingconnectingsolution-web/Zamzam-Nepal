import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import {
  groceryStores,
  productCategories,
  products,
  groceryOrders,
  groceryOrderItems,
  groceryReviews,
  transactions,
  users,
} from '../../database/schema';
import { id, bookingRef } from '../../common/id';
import { creditWallet, debitWalletOrFail, refundsToWallet } from '../../common/wallet.util';
import { apiError } from '../../common/exceptions';
import type {
  CreateCategoryDto,
  CreateGroceryReviewDto,
  CreateProductDto,
  CreateStoreDto,
  GroceryOrderStatus,
  PlaceOrderDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateStoreDto,
} from './dto/grocery.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';


const SERVICE_FEE_RATE = 0.02; // Same platform commission as every other vertical.

type OrderLineItem = {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

/**
 * Legal status transitions. A store moves an order forward one hop at a
 * time; anything not listed is rejected with a 400, same discipline as
 * RestaurantService.STATUS_FLOW.
 */
const STATUS_FLOW: Record<GroceryOrderStatus, GroceryOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKING', 'CANCELLED'],
  PACKING: ['PACKED'],
  PACKED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
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
export class GroceryService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,
) {}

  /* ───────────────────────────── Customer-facing ─────────────────────── */

  async search(city?: string) {
    const conditions = [eq(groceryStores.isActive, true)];
    if (city) conditions.push(ilike(groceryStores.city, `%${city}%`));

    const rows = await this.db
      .select({
        id: groceryStores.id,
        name: groceryStores.name,
        city: groceryStores.city,
        address: groceryStores.address,
        description: groceryStores.description,
        storeType: groceryStores.storeType,
        photos: groceryStores.photos,
        openTime: groceryStores.openTime,
        closeTime: groceryStores.closeTime,
        deliveryFee: groceryStores.deliveryFee,
        minOrder: groceryStores.minOrder,
        freeDeliveryAbove: groceryStores.freeDeliveryAbove,
        deliveryEtaMinutes: groceryStores.deliveryEtaMinutes,
        partnerName: users.name,
        businessName: users.businessName,
      })
      .from(groceryStores)
      .innerJoin(users, eq(users.id, groceryStores.partnerId))
      .where(and(...conditions))
      .orderBy(asc(groceryStores.name));

    // "From price" per store — cheapest in-stock product, one grouped
    // query instead of N+1, same trick as HotelService/RestaurantService.
    const fromPrices = await this.db
      .select({
        storeId: products.storeId,
        minPrice: sql<string>`min(${products.price})`,
      })
      .from(products)
      .where(and(eq(products.isAvailable, true), sql`${products.stock} > 0`))
      .groupBy(products.storeId);
    const priceByStore = new Map(fromPrices.map((p) => [p.storeId, Number(p.minPrice)]));

    const ratings = await this.db
      .select({
        storeId: groceryReviews.storeId,
        avg: sql<string>`avg(${groceryReviews.rating})`,
        count: sql<number>`count(*)::int`,
      })
      .from(groceryReviews)
      .groupBy(groceryReviews.storeId);
    const ratingByStore = new Map(
      ratings.map((r) => [r.storeId, { average: Math.round(Number(r.avg) * 10) / 10, count: r.count }]),
    );

    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      address: s.address,
      description: s.description,
      storeType: s.storeType,
      photos: s.photos,
      openTime: s.openTime,
      closeTime: s.closeTime,
      deliveryFee: Number(s.deliveryFee),
      minOrder: Number(s.minOrder),
      freeDeliveryAbove: s.freeDeliveryAbove != null ? Number(s.freeDeliveryAbove) : null,
      deliveryEtaMinutes: s.deliveryEtaMinutes,
      fromPrice: priceByStore.get(s.id) ?? null,
      rating: ratingByStore.get(s.id) ?? null,
      operator: s.businessName ?? s.partnerName ?? 'Grocery partner',
    }));
  }

  async detail(storeId: string) {
    const [store] = await this.db.select().from(groceryStores).where(eq(groceryStores.id, storeId)).limit(1);
    if (!store || !store.isActive) apiError(404, 'This store is no longer available.');

    const categories = await this.db
      .select()
      .from(productCategories)
      .where(and(eq(productCategories.storeId, storeId), eq(productCategories.isActive, true)))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

    const rows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.isAvailable, true)))
      .orderBy(asc(products.name));

    const toProduct = (p: typeof products.$inferSelect) => ({
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      description: p.description,
      unit: p.unit,
      price: Number(p.price),
      mrp: p.mrp != null ? Number(p.mrp) : null,
      stock: p.stock,
      inStock: p.stock > 0,
      photo: p.photo,
      tags: p.tags,
    });

    const grouped = categories.map((c) => ({
      id: c.id,
      name: c.name,
      products: rows.filter((p) => p.categoryId === c.id).map(toProduct),
    }));
    const uncategorized = rows.filter((p) => !p.categoryId || !categories.some((c) => c.id === p.categoryId));
    if (uncategorized.length > 0) {
      grouped.push({ id: 'uncategorized', name: 'Other items', products: uncategorized.map(toProduct) });
    }

    return {
      id: store.id,
      name: store.name,
      city: store.city,
      address: store.address,
      description: store.description,
      storeType: store.storeType,
      photos: store.photos,
      openTime: store.openTime,
      closeTime: store.closeTime,
      deliveryFee: Number(store.deliveryFee),
      minOrder: Number(store.minOrder),
      freeDeliveryAbove: store.freeDeliveryAbove != null ? Number(store.freeDeliveryAbove) : null,
      deliveryEtaMinutes: store.deliveryEtaMinutes,
      categories: grouped.filter((g) => g.products.length > 0),
    };
  }

  async placeOrder(customerId: string, storeId: string, dto: PlaceOrderDto) {
    if (dto.fulfillment === 'delivery' && !dto.deliveryAddress?.trim()) {
      apiError(400, 'A delivery address is required for delivery orders.');
    }

    return this.db.transaction(async (tx) => {
      const [store] = await tx.select().from(groceryStores).where(eq(groceryStores.id, storeId)).limit(1);
      if (!store || !store.isActive) apiError(404, 'This store is no longer available.');

      const qtyById = new Map<string, number>();
      for (const line of dto.items) {
        qtyById.set(line.productId, (qtyById.get(line.productId) ?? 0) + line.quantity);
      }
      const productIds = [...qtyById.keys()];

      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.storeId, storeId), inArray(products.id, productIds)));

      if (rows.length !== productIds.length) {
        apiError(400, 'One or more items in your cart are no longer listed by this store.');
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

      if (itemsTotal < Number(store.minOrder)) {
        apiError(400, `Minimum order for this store is रू ${Number(store.minOrder).toLocaleString()}.`);
      }

      for (const line of lines) {
        const result = await tx.execute(
          sql`UPDATE products
              SET stock = stock - ${line.quantity}
              WHERE id = ${line.row.id} AND stock >= ${line.quantity}
              RETURNING id`,
        );
        if ((result as unknown as { rows: unknown[] }).rows.length === 0) {
          apiError(409, `"${line.row.name}" only has limited stock left — please lower the quantity.`);
        }
      }

      const freeDelivery =
        store.freeDeliveryAbove != null && itemsTotal >= Number(store.freeDeliveryAbove);
      const deliveryFee = dto.fulfillment === 'delivery' && !freeDelivery ? Number(store.deliveryFee) : 0;
      const serviceFee = Math.round(itemsTotal * SERVICE_FEE_RATE);
      const grandTotal = itemsTotal + deliveryFee + serviceFee;
      const ref = bookingRef();
      const orderId = id('go');

      if (dto.method === 'wallet') {
        await debitWalletOrFail(tx, customerId, grandTotal.toFixed(2));
      }

      await tx.insert(groceryOrders).values({
        id: orderId,
        orderRef: ref,
        customerId,
        storeId,
        status: 'PENDING',
        fulfillment: dto.fulfillment,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        deliveryAddress: dto.fulfillment === 'delivery' ? dto.deliveryAddress!.trim() : null,
        note: dto.note?.trim() || null,
        storeSnapshot: { storeName: store.name, city: store.city },
        itemsTotal: itemsTotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        serviceFee: serviceFee.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        method: dto.method,
      });

      await tx.insert(groceryOrderItems).values(
        lines.map((l) => ({
          id: id('goi'),
          orderId,
          productId: l.row.id,
          name: l.row.name,
          unit: l.row.unit,
          unitPrice: l.row.price,
          quantity: l.quantity,
          lineTotal: l.lineTotal.toFixed(2),
        })),
      );

      await tx.insert(transactions).values({
        id: id('t'),
        userId: customerId,
        type: 'GROCERY',
        status: 'SUCCESS',
        amount: grandTotal.toFixed(2),
        currency: 'NPR',
        description: `Grocery order · ${store.name}`,
        inbound: false,
      });

      return { orderRef: ref, orderId };
    });
  }

  async myOrders(customerId: string) {
    const rows = await this.db
      .select()
      .from(groceryOrders)
      .where(eq(groceryOrders.customerId, customerId))
      .orderBy(desc(groceryOrders.placedAt));
    const items = await this.itemsForOrders(rows.map((o) => o.id));
    return rows.map((o) => this.toOrderDto(o, null, items.get(o.id) ?? []));
  }

  async cancelOrder(customerId: string, orderId: string) {
    const [order] = await this.db.select().from(groceryOrders).where(eq(groceryOrders.id, orderId)).limit(1);
    if (!order) apiError(404, 'Order not found.');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('You can only cancel your own orders.');
    }
    if (order.status === 'CANCELLED') return { ok: true };
    if (order.status !== 'PENDING') {
      apiError(409, 'The store has already confirmed this order — contact the store to cancel.');
    }

    await this.refundCancelAndRestock(order);
    return { ok: true };
  }

  async submitReview(customerId: string, orderId: string, dto: CreateGroceryReviewDto) {
    const [order] = await this.db.select().from(groceryOrders).where(eq(groceryOrders.id, orderId)).limit(1);
    if (!order) apiError(404, 'Order not found.');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own orders.');
    }
    if (order.status !== 'DELIVERED') apiError(400, 'You can review an order once it has been delivered.');

    const [existing] = await this.db
      .select()
      .from(groceryReviews)
      .where(eq(groceryReviews.orderId, orderId))
      .limit(1);
    if (existing) apiError(409, 'You already reviewed this order.');

    const [review] = await this.db
      .insert(groceryReviews)
      .values({
        id: id('grv'),
        orderId,
        storeId: order.storeId,
        customerId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      })
      .returning();
    return this.toReviewDto(review);
  }

  async myReview(customerId: string, orderId: string) {
    const [review] = await this.db
      .select()
      .from(groceryReviews)
      .where(eq(groceryReviews.orderId, orderId))
      .limit(1);
    if (!review || review.customerId !== customerId) return null;
    return this.toReviewDto(review);
  }

  /* ───────────────────────────── Partner-facing ───────────────────────── */

  async partnerStores(partnerId: string) {
    const rows = await this.db
      .select()
      .from(groceryStores)
      .where(eq(groceryStores.partnerId, partnerId))
      .orderBy(desc(groceryStores.createdAt));
    return rows.map((s) => ({
      ...s,
      deliveryFee: Number(s.deliveryFee),
      minOrder: Number(s.minOrder),
      freeDeliveryAbove: s.freeDeliveryAbove != null ? Number(s.freeDeliveryAbove) : null,
    }));
  }

  async createStore(partnerId: string, dto: CreateStoreDto) {
    await this.partnerDocuments.assertRequiredDocsUploaded(partnerId, 'grocery');
    const [store] = await this.db
      .insert(groceryStores)
      .values({
        id: id('gst'),
        partnerId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
        description: dto.description ?? null,
        storeType: dto.storeType ?? 'Supermarket',
        photos: dto.photos ?? [],
        openTime: dto.openTime ?? '07:00',
        closeTime: dto.closeTime ?? '22:00',
        deliveryFee: (dto.deliveryFee ?? 0).toFixed(2),
        minOrder: (dto.minOrder ?? 0).toFixed(2),
        freeDeliveryAbove: dto.freeDeliveryAbove != null ? dto.freeDeliveryAbove.toFixed(2) : null,
        deliveryEtaMinutes: dto.deliveryEtaMinutes ?? 30,
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
      title: 'New grocery store added',
      message: `${partner?.businessName ?? partner?.name ?? 'A partner'} added a new grocery store: "${store.name}".`,
      entityType: 'partner',
      entityId: partnerId,
    });

    return {
      ...store,
      deliveryFee: Number(store.deliveryFee),
      minOrder: Number(store.minOrder),
      freeDeliveryAbove: store.freeDeliveryAbove != null ? Number(store.freeDeliveryAbove) : null,
    };
  }

  async updateStore(partnerId: string, storeId: string, dto: UpdateStoreDto) {
    const existing = await this.assertOwnedStore(partnerId, storeId);
    const [updated] = await this.db
      .update(groceryStores)
      .set({
        name: dto.name,
        city: dto.city,
        address: dto.address,
        description: dto.description ?? null,
        storeType: dto.storeType ?? existing.storeType,
        photos: dto.photos ?? existing.photos,
        openTime: dto.openTime ?? existing.openTime,
        closeTime: dto.closeTime ?? existing.closeTime,
        deliveryFee: dto.deliveryFee != null ? dto.deliveryFee.toFixed(2) : existing.deliveryFee,
        minOrder: dto.minOrder != null ? dto.minOrder.toFixed(2) : existing.minOrder,
        freeDeliveryAbove:
          dto.freeDeliveryAbove !== undefined
            ? dto.freeDeliveryAbove != null
              ? dto.freeDeliveryAbove.toFixed(2)
              : null
            : existing.freeDeliveryAbove,
        deliveryEtaMinutes: dto.deliveryEtaMinutes ?? existing.deliveryEtaMinutes,
      })
      .where(eq(groceryStores.id, storeId))
      .returning();
    return {
      ...updated,
      deliveryFee: Number(updated.deliveryFee),
      minOrder: Number(updated.minOrder),
      freeDeliveryAbove: updated.freeDeliveryAbove != null ? Number(updated.freeDeliveryAbove) : null,
    };
  }

  async deleteStore(partnerId: string, storeId: string) {
    await this.assertOwnedStore(partnerId, storeId);
    await this.db.delete(groceryStores).where(eq(groceryStores.id, storeId));
    return { ok: true };
  }

  /* ── Categories ── */

  async storeCategories(partnerId: string, storeId: string) {
    await this.assertOwnedStore(partnerId, storeId);
    return this.db
      .select()
      .from(productCategories)
      .where(eq(productCategories.storeId, storeId))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
  }

  async createCategory(partnerId: string, storeId: string, dto: CreateCategoryDto) {
    await this.assertOwnedStore(partnerId, storeId);
    const [category] = await this.db
      .insert(productCategories)
      .values({ id: id('pc'), storeId, name: dto.name, sortOrder: dto.sortOrder ?? 0, isActive: true })
      .returning();
    return category;
  }

  async updateCategory(partnerId: string, storeId: string, categoryId: string, dto: UpdateCategoryDto) {
    await this.assertOwnedCategory(partnerId, storeId, categoryId);
    const [updated] = await this.db
      .update(productCategories)
      .set({ name: dto.name, sortOrder: dto.sortOrder ?? 0 })
      .where(eq(productCategories.id, categoryId))
      .returning();
    return updated;
  }

  async deleteCategory(partnerId: string, storeId: string, categoryId: string) {
    await this.assertOwnedCategory(partnerId, storeId, categoryId);
    await this.db.delete(productCategories).where(eq(productCategories.id, categoryId));
    return { ok: true };
  }

  /* ── Products ── */

  async storeProducts(partnerId: string, storeId: string) {
    await this.assertOwnedStore(partnerId, storeId);
    const rows = await this.db
      .select()
      .from(products)
      .where(eq(products.storeId, storeId))
      .orderBy(asc(products.name));
    return rows.map((p) => ({ ...p, price: Number(p.price), mrp: p.mrp != null ? Number(p.mrp) : null }));
  }

  async createProduct(partnerId: string, storeId: string, dto: CreateProductDto) {
    await this.partnerDocuments.assertRequiredDocsUploaded(partnerId, 'grocery');
    await this.assertOwnedStore(partnerId, storeId);
    if (dto.categoryId) await this.assertOwnedCategory(partnerId, storeId, dto.categoryId);
    const [product] = await this.db
      .insert(products)
      .values({
        id: id('prd'),
        storeId,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        unit: dto.unit ?? '1 pc',
        price: dto.price.toFixed(2),
        mrp: dto.mrp != null ? dto.mrp.toFixed(2) : null,
        stock: dto.stock ?? 0,
        photo: dto.photo ?? null,
        tags: dto.tags ?? [],
        isAvailable: dto.isAvailable ?? true,
      })
      .returning();
    return { ...product, price: Number(product.price), mrp: product.mrp != null ? Number(product.mrp) : null };
  }

  async updateProduct(partnerId: string, storeId: string, productId: string, dto: UpdateProductDto) {
    await this.assertOwnedProduct(partnerId, storeId, productId);
    if (dto.categoryId) await this.assertOwnedCategory(partnerId, storeId, dto.categoryId);
    const [updated] = await this.db
      .update(products)
      .set({
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        unit: dto.unit ?? '1 pc',
        price: dto.price.toFixed(2),
        mrp: dto.mrp != null ? dto.mrp.toFixed(2) : null,
        stock: dto.stock ?? 0,
        photo: dto.photo ?? null,
        tags: dto.tags ?? [],
        isAvailable: dto.isAvailable ?? true,
      })
      .where(eq(products.id, productId))
      .returning();
    return { ...updated, price: Number(updated.price), mrp: updated.mrp != null ? Number(updated.mrp) : null };
  }

  async restockProduct(partnerId: string, storeId: string, productId: string, addQuantity: number) {
    const product = await this.assertOwnedProduct(partnerId, storeId, productId);
    const [updated] = await this.db
      .update(products)
      .set({ stock: product.stock + addQuantity })
      .where(eq(products.id, productId))
      .returning();
    return { ...updated, price: Number(updated.price), mrp: updated.mrp != null ? Number(updated.mrp) : null };
  }

  async deleteProduct(partnerId: string, storeId: string, productId: string) {
    await this.assertOwnedProduct(partnerId, storeId, productId);
    await this.db.delete(products).where(eq(products.id, productId));
    return { ok: true };
  }

  /* ── Orders ── */

  async partnerOrders(partnerId: string) {
    const storeIds = await this.partnerStoreIds(partnerId);
    if (storeIds.length === 0) return [];

    const rows = await this.db
      .select({
        order: groceryOrders,
        account: { name: users.name, email: users.email, mobile: users.mobile, kycStatus: users.kycStatus },
      })
      .from(groceryOrders)
      .innerJoin(users, eq(users.id, groceryOrders.customerId))
      .where(inArray(groceryOrders.storeId, storeIds))
      .orderBy(desc(groceryOrders.placedAt));

    const items = await this.itemsForOrders(rows.map((r) => r.order.id));
    return rows.map((r) => this.toOrderDto(r.order, r.account, items.get(r.order.id) ?? []));
  }

  async partnerOrderDetail(partnerId: string, orderId: string) {
    const [row] = await this.db
      .select({
        order: groceryOrders,
        account: { name: users.name, email: users.email, mobile: users.mobile, kycStatus: users.kycStatus },
      })
      .from(groceryOrders)
      .innerJoin(users, eq(users.id, groceryOrders.customerId))
      .where(eq(groceryOrders.id, orderId))
      .limit(1);

    if (!row) apiError(404, 'Order not found.');
    await this.assertOwnedStore(partnerId, row.order.storeId);

    const items = await this.itemsForOrders([row.order.id]);
    return this.toOrderDto(row.order, row.account, items.get(row.order.id) ?? []);
  }

  async updateOrderStatus(partnerId: string, orderId: string, next: GroceryOrderStatus) {
    const [order] = await this.db.select().from(groceryOrders).where(eq(groceryOrders.id, orderId)).limit(1);
    if (!order) apiError(404, 'Order not found.');
    await this.assertOwnedStore(partnerId, order.storeId);

    if (order.status === next) return { ok: true, status: next };
    if (!STATUS_FLOW[order.status].includes(next)) {
      apiError(400, `An order that is ${order.status.toLowerCase().replace(/_/g, ' ')} can't move to ${next.toLowerCase().replace(/_/g, ' ')}.`);
    }
    if (next === 'OUT_FOR_DELIVERY' && order.fulfillment !== 'delivery') {
      apiError(400, 'Pickup orders go straight from packed to delivered.');
    }

    if (next === 'CANCELLED') {
      await this.refundCancelAndRestock(order);
      return { ok: true, status: 'CANCELLED' as const };
    }

    await this.db
      .update(groceryOrders)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(groceryOrders.id, orderId));
    return { ok: true, status: next };
  }

  /* ── Reviews ── */

  async partnerReviews(partnerId: string) {
    const storeIds = await this.partnerStoreIds(partnerId);
    if (storeIds.length === 0) return [];

    const rows = await this.db
      .select({
        review: groceryReviews,
        customerName: users.name,
        orderRef: groceryOrders.orderRef,
        storeSnapshot: groceryOrders.storeSnapshot,
        placedAt: groceryOrders.placedAt,
      })
      .from(groceryReviews)
      .innerJoin(users, eq(users.id, groceryReviews.customerId))
      .innerJoin(groceryOrders, eq(groceryOrders.id, groceryReviews.orderId))
      .where(inArray(groceryReviews.storeId, storeIds))
      .orderBy(desc(groceryReviews.createdAt));

    return rows.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      comment: r.review.comment,
      createdAt: r.review.createdAt.toISOString(),
      customerName: r.customerName,
      orderRef: r.orderRef,
      storeName: r.storeSnapshot.storeName,
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
    const lowStockCount = await this.lowStockCount(partnerId);

    return {
      ordersToday,
      pendingOrders,
      rating: average,
      revenueMonth,
      lowStockCount,
      series: [] as { label: string; value: number }[],
    };
  }

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
      orders: 0, grossRevenue: 0, platformFee: 0, netProfit: 0, cancelled: 0, refunded: 0,
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

  private async refundCancelAndRestock(order: typeof groceryOrders.$inferSelect) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(groceryOrders)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(groceryOrders.id, order.id));

      const lines = await tx
        .select()
        .from(groceryOrderItems)
        .where(eq(groceryOrderItems.orderId, order.id));
      for (const line of lines) {
        if (!line.productId) continue;
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${line.quantity}` })
          .where(eq(products.id, line.productId));
      }

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
          ? `Refund · cancelled grocery order ${order.orderRef}`
          : `Refund · cancelled grocery order ${order.orderRef} — will be returned to your original payment method`,
        inbound: true,
      });
    });
  }

  private async itemsForOrders(orderIds: string[]): Promise<Map<string, OrderLineItem[]>> {
    const map = new Map<string, OrderLineItem[]>();
    if (orderIds.length === 0) return map;
    const rows = await this.db.select().from(groceryOrderItems).where(inArray(groceryOrderItems.orderId, orderIds));
    for (const r of rows) {
      const list = map.get(r.orderId) ?? [];
      list.push({
        id: r.id,
        name: r.name,
        unit: r.unit,
        unitPrice: Number(r.unitPrice),
        quantity: r.quantity,
        lineTotal: Number(r.lineTotal),
      });
      map.set(r.orderId, list);
    }
    return map;
  }

  private toOrderDto(
    o: typeof groceryOrders.$inferSelect,
    account: { name: string; email: string; mobile: string; kycStatus: string } | null,
    items: OrderLineItem[],
  ) {
    return {
      id: o.id,
      orderRef: o.orderRef,
      status: o.status,
      fulfillment: o.fulfillment,
      store: o.storeSnapshot,
      storeId: o.storeId,
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

  private toReviewDto(r: typeof groceryReviews.$inferSelect) {
    return {
      id: r.id,
      orderId: r.orderId,
      storeId: r.storeId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async partnerStoreIds(partnerId: string) {
    const rows = await this.db
      .select({ id: groceryStores.id })
      .from(groceryStores)
      .where(eq(groceryStores.partnerId, partnerId));
    return rows.map((r) => r.id);
  }

  private async lowStockCount(partnerId: string) {
    const storeIds = await this.partnerStoreIds(partnerId);
    if (storeIds.length === 0) return 0;
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(and(inArray(products.storeId, storeIds), sql`${products.stock} <= 5`, eq(products.isAvailable, true)));
    return row?.count ?? 0;
  }

  private async assertOwnedStore(partnerId: string, storeId: string) {
    const [store] = await this.db.select().from(groceryStores).where(eq(groceryStores.id, storeId)).limit(1);
    if (!store) apiError(404, 'Store not found.');
    if (store.partnerId !== partnerId) throw new ForbiddenException('Not your store.');
    return store;
  }

  private async assertOwnedCategory(partnerId: string, storeId: string, categoryId: string) {
    await this.assertOwnedStore(partnerId, storeId);
    const [category] = await this.db
      .select()
      .from(productCategories)
      .where(eq(productCategories.id, categoryId))
      .limit(1);
    if (!category || category.storeId !== storeId) apiError(404, 'Category not found.');
    return category;
  }

  private async assertOwnedProduct(partnerId: string, storeId: string, productId: string) {
    await this.assertOwnedStore(partnerId, storeId);
    const [product] = await this.db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product || product.storeId !== storeId) apiError(404, 'Product not found.');
    return product;
  }
}