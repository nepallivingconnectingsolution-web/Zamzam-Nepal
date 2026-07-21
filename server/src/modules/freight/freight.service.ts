import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, ne } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { bids, loadReviews, loads, users, vehicles } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateLoadDto, CreateLoadReviewDto, PlaceBidDto } from './dto/freight.dto';

@Injectable()
export class FreightService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /* ───────────────────────── Transporter dashboard ───────────────────────── */

  async metrics(transporterId: string) {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [[open], [active], [transit], deliveredRows] = await Promise.all([
      this.db.select({ n: count() }).from(loads).where(eq(loads.status, 'OPEN')),
      this.db
        .select({ n: count() })
        .from(bids)
        .where(and(eq(bids.transporterId, transporterId), eq(bids.status, 'PENDING'))),
      this.db
        .select({ n: count() })
        .from(loads)
        .innerJoin(bids, eq(loads.acceptedBidId, bids.id))
        .where(and(eq(bids.transporterId, transporterId), eq(loads.status, 'IN_TRANSIT'))),
      this.db
        .select({ amount: bids.amount, createdAt: loads.updatedAt })
        .from(loads)
        .innerJoin(bids, eq(loads.acceptedBidId, bids.id))
        .where(
          and(
            eq(bids.transporterId, transporterId),
            eq(loads.status, 'DELIVERED'),
            gte(loads.updatedAt, monthAgo),
          ),
        ),
    ]);

    const revenueMonth = deliveredRows.reduce((sum, r) => sum + Number(r.amount), 0);
    const { average: rating } = await this.partnerReviewSummary(transporterId);

  return {
      openLoads: open?.n ?? 0,
      activeBids: active?.n ?? 0,
      inTransit: transit?.n ?? 0,
      revenueMonth,
      rating,
      series: [] as { label: string; value: number }[],
    };
  }

  /**
   * Transporter revenue dashboard — mirrors the shape used by
   * BusesService.operatorRevenue / HotelService / RestaurantService /
   * GroceryService so the frontend can reuse the same stat-card + chart
   * layout everywhere. Two fields are deliberately always zero here rather
   * than omitted: `totalPlatformFee` and `totalRefunded`. Freight has no
   * commission or wallet-refund flow today (payment is settled outside the
   * app once a bid is accepted), so keeping the fields — rather than
   * inventing numbers or dropping them — keeps the response shape
   * consistent while staying honest about what's actually true.
   */
  async partnerRevenue(transporterId: string) {
    const rows = await this.db
      .select({
        status: loads.status,
        updatedAt: loads.updatedAt,
        amount: bids.amount,
      })
      .from(loads)
      .innerJoin(bids, eq(loads.acceptedBidId, bids.id))
      .where(eq(bids.transporterId, transporterId));

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);
    const monthPrefix = todayKey.slice(0, 7); // "YYYY-MM"

    type Bucket = { shipments: number; grossRevenue: number; cancelled: number };
    const emptyBucket = (): Bucket => ({ shipments: 0, grossRevenue: 0, cancelled: 0 });

    const byDate = new Map<string, Bucket>();
    for (const r of rows) {
      const date = r.updatedAt.toISOString().slice(0, 10);
      const bucket = byDate.get(date) ?? emptyBucket();
      if (r.status === 'DELIVERED') {
        bucket.shipments += 1;
        bucket.grossRevenue += Number(r.amount);
      } else if (r.status === 'CANCELLED') {
        bucket.cancelled += 1;
      }
      byDate.set(date, bucket);
    }

    // Last 30 days, oldest first, zero-filled so the chart never has gaps.
    const daily: (Bucket & { date: string })[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily.push({ date: key, ...(byDate.get(key) ?? emptyBucket()) });
    }

    const delivered = rows.filter((r) => r.status === 'DELIVERED');
    const cancelled = rows.filter((r) => r.status === 'CANCELLED');
    const totalRevenue = delivered.reduce((sum, r) => sum + Number(r.amount), 0);

    return {
      summary: {
        todayRevenue: byDate.get(todayKey)?.grossRevenue ?? 0,
        monthRevenue: delivered
          .filter((r) => r.updatedAt.toISOString().slice(0, 7) === monthPrefix)
          .reduce((sum, r) => sum + Number(r.amount), 0),
        totalRevenue,
        totalPlatformFee: 0,
        totalRefunded: 0,
        netProfit: totalRevenue,
        totalBookings: delivered.length,
        totalCancelled: cancelled.length,
        avgBookingValue: delivered.length ? totalRevenue / delivered.length : 0,
      },
      daily,
    };
  }

  /* ───────────────────────────── Customer side ───────────────────────────── */

  async createLoad(customerId: string, dto: CreateLoadDto) {
    const [row] = await this.db
      .insert(loads)
      .values({
        id: id('load'),
        customerId,
        fromLabel: dto.fromLabel,
        toLabel: dto.toLabel,
        cargoDescription: dto.cargoDescription,
        weightKg: dto.weightKg,
        preferredCategory: dto.preferredCategory ?? null,
        budget: dto.budget != null ? String(dto.budget) : null,
        pickupDate: dto.pickupDate ?? null,
        pickupLat: dto.pickupLat != null ? dto.pickupLat.toFixed(7) : null,
        pickupLng: dto.pickupLng != null ? dto.pickupLng.toFixed(7) : null,
        dropLat: dto.dropLat != null ? dto.dropLat.toFixed(7) : null,
        dropLng: dto.dropLng != null ? dto.dropLng.toFixed(7) : null,
        status: 'OPEN',
      })
      .returning();

    await this.notifications.notify({
      type: 'system',
      title: 'New freight load posted',
      message: `${dto.cargoDescription} (${dto.weightKg} kg) — ${dto.fromLabel} → ${dto.toLabel}.`,
      entityType: 'load',
      entityId: row.id,
    });

    return this.loadDto(row);
  }

  /** The customer's own loads, each with its bid count and accepted bid. */
  async myLoads(customerId: string) {
    const rows = await this.db
      .select()
      .from(loads)
      .where(eq(loads.customerId, customerId))
      .orderBy(desc(loads.createdAt));

    return Promise.all(rows.map((r) => this.loadWithBids(r)));
  }

  /** Full bid list for one load the customer owns. */
  async loadBids(customerId: string, loadId: string) {
    const load = await this.ownedLoadOrFail(customerId, loadId);
    const rows = await this.db
      .select({
        bid: bids,
        transporterName: users.name,
        transporterMobile: users.mobile,
        vehicleMakeModel: vehicles.makeModel,
        vehiclePlate: vehicles.plateNumber,
      })
      .from(bids)
      .innerJoin(users, eq(bids.transporterId, users.id))
      .leftJoin(vehicles, eq(bids.vehicleId, vehicles.id))
      .where(eq(bids.loadId, loadId))
      .orderBy(bids.amount);

    return {
      load: this.loadDto(load),
      bids: rows.map((r) => ({
        ...this.bidDto(r.bid),
        transporterName: r.transporterName,
        transporterMobile: r.transporterMobile,
        vehicleMakeModel: r.vehicleMakeModel,
        vehiclePlate: r.vehiclePlate,
      })),
    };
  }

  /** Accept one bid: assigns the load, rejects the rest. */
  async acceptBid(customerId: string, loadId: string, bidId: string) {
    const load = await this.ownedLoadOrFail(customerId, loadId);
    if (load.status !== 'OPEN') apiError(400, 'This load is no longer open for bids.', 'LOAD_NOT_OPEN');

    const [bid] = await this.db
      .select()
      .from(bids)
      .where(and(eq(bids.id, bidId), eq(bids.loadId, loadId), eq(bids.status, 'PENDING')))
      .limit(1);
    if (!bid) apiError(404, 'Bid not found or already resolved.');

    await this.db
      .update(loads)
      .set({ status: 'ASSIGNED', acceptedBidId: bidId, updatedAt: new Date() })
      .where(eq(loads.id, loadId));
    await this.db.update(bids).set({ status: 'ACCEPTED' }).where(eq(bids.id, bidId));
    await this.db
      .update(bids)
      .set({ status: 'REJECTED' })
      .where(and(eq(bids.loadId, loadId), ne(bids.id, bidId), eq(bids.status, 'PENDING')));

    return { ok: true };
  }

  async cancelLoad(customerId: string, loadId: string) {
    const load = await this.ownedLoadOrFail(customerId, loadId);
    if (load.status === 'DELIVERED' || load.status === 'IN_TRANSIT') {
      apiError(400, "A load that's in transit or delivered can't be cancelled.", 'NOT_CANCELLABLE');
    }
    await this.db
      .update(loads)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(loads.id, loadId));
    await this.db
      .update(bids)
      .set({ status: 'REJECTED' })
      .where(and(eq(bids.loadId, loadId), eq(bids.status, 'PENDING')));
    return { ok: true };
  }

  /* ───────────────────────────── Reviews ──────────────────────────────────
   * One review per load (unique on load_id), exactly mirroring the
   * one-review-per-record pattern used by hotel/food/grocery/ride reviews.
   */

  async submitReview(customerId: string, loadId: string, dto: CreateLoadReviewDto) {
    const load = await this.ownedLoadOrFail(customerId, loadId);
    if (load.status !== 'DELIVERED') {
      apiError(400, 'You can review a shipment once it has been delivered.');
    }
    if (!load.acceptedBidId) apiError(400, 'This load has no assigned transporter to review.');

    const [bid] = await this.db.select().from(bids).where(eq(bids.id, load.acceptedBidId)).limit(1);
    if (!bid) apiError(404, 'Assigned transporter not found.');

    const [existing] = await this.db
      .select()
      .from(loadReviews)
      .where(eq(loadReviews.loadId, loadId))
      .limit(1);
    if (existing) apiError(409, 'You already reviewed this shipment.');

    const [review] = await this.db
      .insert(loadReviews)
      .values({
        id: id('lrv'),
        loadId,
        transporterId: bid.transporterId,
        customerId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      })
      .returning();
    return this.toReviewDto(review);
  }

  /** null (not 404) when no review yet — frontend shows the form. */
  async myReview(customerId: string, loadId: string) {
    const [review] = await this.db
      .select()
      .from(loadReviews)
      .where(eq(loadReviews.loadId, loadId))
      .limit(1);
    if (!review || review.customerId !== customerId) return null;
    return this.toReviewDto(review);
  }

  /* ───────────────────────── Transporter (freight) side ──────────────────── */

  /** Open loads a transporter can bid on, flagged with their own bid if any. */
  async openLoads(transporterId: string) {
    const rows = await this.db
      .select()
      .from(loads)
      .where(eq(loads.status, 'OPEN'))
      .orderBy(desc(loads.createdAt))
      .limit(50);

    const myBids = await this.db
      .select()
      .from(bids)
      .where(and(eq(bids.transporterId, transporterId), eq(bids.status, 'PENDING')));
    const byLoad = new Map(myBids.map((b) => [b.loadId, b]));

    return Promise.all(
      rows.map(async (r) => {
        const [{ n }] = await this.db.select({ n: count() }).from(bids).where(eq(bids.loadId, r.id));
        const mine = byLoad.get(r.id);
        return {
          ...this.loadDto(r),
          bidCount: n,
          myBid: mine ? this.bidDto(mine) : null,
        };
      }),
    );
  }

  /** Place or update this transporter's bid on a load (one bid per load). */
  async placeBid(transporterId: string, loadId: string, dto: PlaceBidDto) {
    const [load] = await this.db.select().from(loads).where(eq(loads.id, loadId)).limit(1);
    if (!load) apiError(404, 'Load not found.');
    if (load.status !== 'OPEN') apiError(400, 'This load is no longer accepting bids.', 'LOAD_NOT_OPEN');
    if (load.customerId === transporterId) apiError(400, "You can't bid on your own load.");

    if (dto.vehicleId) {
      const [veh] = await this.db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, dto.vehicleId), eq(vehicles.driverId, transporterId)))
        .limit(1);
      if (!veh) apiError(400, "That vehicle isn't one of yours.");
      if (veh.maxWeightKg < load.weightKg) {
        apiError(400, `That vehicle carries up to ${veh.maxWeightKg} kg — this load is ${load.weightKg} kg.`, 'CAPACITY_TOO_LOW');
      }
    }

    // One live bid per transporter per load: update if it exists, else insert.
    const [existing] = await this.db
      .select()
      .from(bids)
      .where(and(eq(bids.loadId, loadId), eq(bids.transporterId, transporterId)))
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(bids)
        .set({
          amount: String(dto.amount),
          message: dto.message ?? null,
          vehicleId: dto.vehicleId ?? null,
          status: 'PENDING',
        })
        .where(eq(bids.id, existing.id))
        .returning();
      return this.bidDto(row);
    }

    const [row] = await this.db
      .insert(bids)
      .values({
        id: id('bid'),
        loadId,
        transporterId,
        vehicleId: dto.vehicleId ?? null,
        amount: String(dto.amount),
        message: dto.message ?? null,
        status: 'PENDING',
      })
      .returning();

    return this.bidDto(row);
  }

  async withdrawBid(transporterId: string, bidId: string) {
    const result = await this.db
      .update(bids)
      .set({ status: 'WITHDRAWN' })
      .where(and(eq(bids.id, bidId), eq(bids.transporterId, transporterId), eq(bids.status, 'PENDING')))
      .returning({ id: bids.id });
    if (result.length === 0) apiError(400, "This bid can't be withdrawn.", 'NOT_WITHDRAWABLE');
    return { ok: true };
  }

  /** Loads this transporter won (accepted bid), for the Shipments page. */
  async myShipments(transporterId: string) {
    const rows = await this.db
      .select({ load: loads, amount: bids.amount, customerName: users.name, customerMobile: users.mobile })
      .from(bids)
      .innerJoin(loads, eq(bids.loadId, loads.id))
      .innerJoin(users, eq(loads.customerId, users.id))
      .where(and(eq(bids.transporterId, transporterId), eq(bids.status, 'ACCEPTED')))
      .orderBy(desc(loads.updatedAt));

    return rows.map((r) => ({
      ...this.loadDto(r.load),
      wonAmount: Number(r.amount),
      customerName: r.customerName,
      customerMobile: r.customerMobile,
    }));
  }

  /** Transporter advances their won shipment: ASSIGNED → IN_TRANSIT → DELIVERED. */
  async advanceShipment(transporterId: string, loadId: string, to: 'IN_TRANSIT' | 'DELIVERED') {
    const [row] = await this.db
      .select({ load: loads, bid: bids })
      .from(loads)
      .innerJoin(bids, eq(loads.acceptedBidId, bids.id))
      .where(and(eq(loads.id, loadId), eq(bids.transporterId, transporterId)))
      .limit(1);
    if (!row) apiError(404, 'Shipment not found.');

    const from = to === 'IN_TRANSIT' ? 'ASSIGNED' : 'IN_TRANSIT';
    if (row.load.status !== from) {
      apiError(400, `This shipment can't move to ${to.toLowerCase().replace('_', ' ')} right now.`, 'BAD_TRANSITION');
    }

    await this.db.update(loads).set({ status: to, updatedAt: new Date() }).where(eq(loads.id, loadId));

    return { ok: true };
  }

  /** Every review this transporter has received — the "freight admin" reviews list. */
  async partnerReviews(transporterId: string) {
    const rows = await this.db
      .select({
        review: loadReviews,
        customerName: users.name,
        fromLabel: loads.fromLabel,
        toLabel: loads.toLabel,
        cargoDescription: loads.cargoDescription,
      })
      .from(loadReviews)
      .innerJoin(users, eq(users.id, loadReviews.customerId))
      .innerJoin(loads, eq(loads.id, loadReviews.loadId))
      .where(eq(loadReviews.transporterId, transporterId))
      .orderBy(desc(loadReviews.createdAt));

    return rows.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      comment: r.review.comment,
      createdAt: r.review.createdAt.toISOString(),
      customerName: r.customerName,
      from: r.fromLabel,
      to: r.toLabel,
      cargoDescription: r.cargoDescription,
    }));
  }

  async partnerReviewSummary(transporterId: string) {
    const reviews = await this.partnerReviews(transporterId);
    const count = reviews.length;
    const average = count === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    return { average: Math.round(average * 10) / 10, count, distribution };
  }

  /* ───────────────────────────── Helpers ─────────────────────────────────── */

  private async ownedLoadOrFail(customerId: string, loadId: string) {
    const [load] = await this.db
      .select()
      .from(loads)
      .where(and(eq(loads.id, loadId), eq(loads.customerId, customerId)))
      .limit(1);
    if (!load) apiError(404, 'Load not found.');
    return load;
  }

  private async loadWithBids(load: typeof loads.$inferSelect) {
    const [{ n }] = await this.db.select({ n: count() }).from(bids).where(and(eq(bids.loadId, load.id), inArray(bids.status, ['PENDING', 'ACCEPTED'])));
    let acceptedAmount: number | null = null;
    if (load.acceptedBidId) {
      const [b] = await this.db.select({ amount: bids.amount }).from(bids).where(eq(bids.id, load.acceptedBidId)).limit(1);
      acceptedAmount = b ? Number(b.amount) : null;
    }
    return { ...this.loadDto(load), bidCount: n, acceptedAmount };
  }

  private loadDto(r: typeof loads.$inferSelect) {
    return {
      id: r.id,
      customerId: r.customerId,
      from: r.fromLabel,
      to: r.toLabel,
      cargoDescription: r.cargoDescription,
      weightKg: r.weightKg,
      preferredCategory: r.preferredCategory,
      budget: r.budget != null ? Number(r.budget) : null,
      pickupDate: r.pickupDate,
      status: r.status,
      acceptedBidId: r.acceptedBidId,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private bidDto(r: typeof bids.$inferSelect) {
    return {
      id: r.id,
      loadId: r.loadId,
      transporterId: r.transporterId,
      vehicleId: r.vehicleId,
      amount: Number(r.amount),
      message: r.message,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toReviewDto(r: typeof loadReviews.$inferSelect) {
    return {
      id: r.id,
      loadId: r.loadId,
      transporterId: r.transporterId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    };
  }
}