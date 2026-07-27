import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { driverStatus, foodOrders, groceryOrders, loads, rideReviews, rides, roomBookings, tickets, transactions, users, vehicles } from '../../database/schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import { creditWallet, debitWalletOrFail } from '../../common/wallet.util';
import { etaMinutes, fareFor, haversineKm } from '../../common/geo';
import { CreateRideDto, CreateRideReviewDto, PayRideDto } from './dto/rides.dto';
import { CATEGORY_SERVICES } from '../vehicles/vehicles.service';

/**
 * A ride in one of these states occupies its customer / driver.
 * PAYMENT_PENDING is deliberately in here: like Uber/Pathao, neither side can
 * start a new booking until the previous fare is settled — this is what makes
 * the post-trip screens unavoidable instead of skippable.
 */
const ACTIVE_STATUSES = ['REQUESTED', 'ACCEPTED', 'ONGOING', 'PAYMENT_PENDING'] as const;

/** How far away a driver can see open requests — mirrors nearby matching. */
const REQUEST_RADIUS_KM = 10;

@Injectable()
export class RidesService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  /* ───────────────────────────── Customer side ───────────────────────────── */

  /**
   * The "Booking created" step of the architecture: a REQUESTED row that
   * nearby drivers can see and accept. Fare and distance are computed
   * server-side so the client preview can never be tampered with.
   */
  async create(customerId: string, dto: CreateRideDto) {
    const [existing] = await this.db
      .select({ id: rides.id })
      .from(rides)
      .where(and(eq(rides.customerId, customerId), inArray(rides.status, [...ACTIVE_STATUSES])))
      .limit(1);
    if (existing) {
      apiError(409, 'You already have an active booking. Complete or cancel it first.', 'RIDE_IN_PROGRESS');
    }

    const distanceKm = haversineKm(dto.pickupLat, dto.pickupLng, dto.dropLat, dto.dropLng);
    const fare = fareFor(dto.service, distanceKm);

    const [row] = await this.db
      .insert(rides)
      .values({
        id: id('ride'),
        customerId,
        service: dto.service,
        fromLabel: dto.fromLabel,
        toLabel: dto.toLabel,
        pickupLat: dto.pickupLat.toFixed(7),
        pickupLng: dto.pickupLng.toFixed(7),
        dropLat: dto.dropLat.toFixed(7),
        dropLng: dto.dropLng.toFixed(7),
        distanceKm: distanceKm.toFixed(2),
        parcelWeightKg: dto.service === 'parcel' ? (dto.parcelWeightKg ?? 5) : null,
        fare: String(fare),
        status: 'REQUESTED',
      })
      .returning();

    return this.toDto(row);
  }

  /**
   * The customer's current non-terminal booking (or null), with driver info
   * once accepted. Also joins driverStatus so the assigned driver's live
   * lat/lng comes back once they've been matched — this is what lets the
   * customer's live map show the driver's dot moving toward them instead of
   * just a static pickup/drop pin pair.
   */
  async active(customerId: string) {
    const [row] = await this.db
      .select({
        ride: rides,
        driverName: users.name,
        driverMobile: users.mobile,
        vehicleMakeModel: vehicles.makeModel,
        vehiclePlate: vehicles.plateNumber,
        driverLat: driverStatus.lat,
        driverLng: driverStatus.lng,
      })
      .from(rides)
      .leftJoin(users, eq(rides.driverId, users.id))
      .leftJoin(vehicles, eq(rides.vehicleId, vehicles.id))
      .leftJoin(driverStatus, eq(rides.driverId, driverStatus.userId))
      .where(and(eq(rides.customerId, customerId), inArray(rides.status, [...ACTIVE_STATUSES])))
      .orderBy(desc(rides.createdAt))
      .limit(1);

    if (!row) return null;
    return {
      ...this.toDto(row.ride),
      driverName: row.driverName,
      driverMobile: row.driverMobile,
      vehicleMakeModel: row.vehicleMakeModel,
      vehiclePlate: row.vehiclePlate,
      driverLat: row.driverLat != null ? Number(row.driverLat) : null,
      driverLng: row.driverLng != null ? Number(row.driverLng) : null,
    };
  }

  async cancel(customerId: string, rideId: string) {
    const result = await this.db
      .update(rides)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.customerId, customerId),
          inArray(rides.status, ['REQUESTED', 'ACCEPTED']),
        ),
      )
      .returning({ id: rides.id });
    if (result.length === 0) {
      apiError(400, "This booking can't be cancelled anymore.", 'NOT_CANCELLABLE');
    }
    return { ok: true };
  }

  async history(userId: string) {
    const rows = await this.db
      .select()
      .from(rides)
      .where(eq(rides.customerId, userId))
      .orderBy(desc(rides.createdAt));
    return rows.map((r) => this.toDto(r));
  }

  /* ───────────────────────────── Reviews ──────────────────────────────────
   * One review per ride (taxi/bike/parcel share the same rides table, so
   * this single review flow covers all three), exactly mirroring the
   * one-review-per-record pattern used by hotel/food/grocery reviews.
   */

  async submitReview(customerId: string, rideId: string, dto: CreateRideReviewDto) {
    const [ride] = await this.db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) apiError(404, 'Ride not found.');
    if (ride.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own rides.');
    }
    if (ride.status !== 'COMPLETED') {
      apiError(400, 'You can review a trip once it has been completed.');
    }
    if (!ride.driverId) apiError(400, 'This ride has no driver to review.');

    const [existing] = await this.db
      .select()
      .from(rideReviews)
      .where(eq(rideReviews.rideId, rideId))
      .limit(1);
    if (existing) apiError(409, 'You already reviewed this trip.');

    const [review] = await this.db
      .insert(rideReviews)
      .values({
        id: id('rrv'),
        rideId,
        driverId: ride.driverId,
        customerId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      })
      .returning();
    return this.toReviewDto(review);
  }

  /** null (not 404) when no review yet — frontend shows the form. */
  async myReview(customerId: string, rideId: string) {
    const [review] = await this.db
      .select()
      .from(rideReviews)
      .where(eq(rideReviews.rideId, rideId))
      .limit(1);
    if (!review || review.customerId !== customerId) return null;
    return this.toReviewDto(review);
  }

  /* ───────────────────────────── Driver side ─────────────────────────────── */

  /**
   * Open REQUESTED rides this driver's active vehicle can serve, within
   * radius of their live position — the driver-facing face of matching.
   */
  async incoming(driverId: string) {
    const [me] = await this.db
      .select({ status: driverStatus, vehicle: vehicles })
      .from(driverStatus)
      .innerJoin(vehicles, eq(driverStatus.activeVehicleId, vehicles.id))
      .where(eq(driverStatus.userId, driverId))
      .limit(1);

    if (!me || !me.status.online || me.status.lat == null || me.status.lng == null) return [];
    if (me.vehicle.verificationStatus !== 'APPROVED' || !me.vehicle.isActive) return [];

    const services = CATEGORY_SERVICES[me.vehicle.category] ?? [];
    const serveable = services.filter((s) => s === 'taxi' || s === 'bike' || s === 'parcel');
    if (serveable.length === 0) return [];

    const rows = await this.db
      .select()
      .from(rides)
      .where(and(eq(rides.status, 'REQUESTED'), isNull(rides.driverId), inArray(rides.service, serveable)))
      .orderBy(desc(rides.createdAt))
      .limit(50);

    const myLat = Number(me.status.lat);
    const myLng = Number(me.status.lng);
    const maxKg = me.vehicle.maxWeightKg;

    return rows
      .filter((r) => r.parcelWeightKg == null || r.parcelWeightKg <= maxKg)
      .map((r) => {
        const pickupKm =
          r.pickupLat != null && r.pickupLng != null
            ? haversineKm(myLat, myLng, Number(r.pickupLat), Number(r.pickupLng))
            : null;
        return { ...this.toDto(r), pickupKm: pickupKm != null ? Number(pickupKm.toFixed(2)) : null, etaMin: pickupKm != null ? etaMinutes(pickupKm) : null };
      })
      .filter((r) => r.pickupKm != null && r.pickupKm <= REQUEST_RADIUS_KM)
      .sort((a, b) => (a.pickupKm ?? 0) - (b.pickupKm ?? 0))
      .slice(0, 10);
  }

  /** The driver's own current job (ACCEPTED or ONGOING), or null. */
  async currentJob(driverId: string) {
    const [row] = await this.db
      .select({ ride: rides, customerName: users.name, customerMobile: users.mobile })
      .from(rides)
      .leftJoin(users, eq(rides.customerId, users.id))
      .where(and(eq(rides.driverId, driverId), inArray(rides.status, ['ACCEPTED', 'ONGOING', 'PAYMENT_PENDING'])))
      .orderBy(desc(rides.createdAt))
      .limit(1);
    if (!row) return null;
    return { ...this.toDto(row.ride), customerName: row.customerName, customerMobile: row.customerMobile };
  }

  /**
   * Accepting is a conditional single-statement UPDATE — if two drivers tap
   * Accept at once, exactly one succeeds and the other gets a clean
   * "already taken", never a double assignment (same race-condition pattern
   * as the double-booking fix in Nepal Living).
   */
  async accept(driverId: string, rideId: string) {
    const [me] = await this.db
      .select({ status: driverStatus, vehicle: vehicles })
      .from(driverStatus)
      .innerJoin(vehicles, eq(driverStatus.activeVehicleId, vehicles.id))
      .where(eq(driverStatus.userId, driverId))
      .limit(1);
    if (!me || !me.status.online) apiError(400, 'Go online before accepting requests.', 'DRIVER_OFFLINE');
    if (me.vehicle.verificationStatus !== 'APPROVED') apiError(400, 'Your active vehicle is not verified.', 'VEHICLE_NOT_VERIFIED');

    const [job] = await this.db
      .select({ id: rides.id })
      .from(rides)
     .where(and(eq(rides.driverId, driverId), inArray(rides.status, ['ACCEPTED', 'ONGOING', 'PAYMENT_PENDING'])))
      .limit(1);
    if (job) apiError(409, 'Finish and settle your current trip before accepting another.', 'DRIVER_BUSY');

    const result = await this.db
      .update(rides)
      .set({ driverId, vehicleId: me.vehicle.id, status: 'ACCEPTED', updatedAt: new Date() })
      .where(and(eq(rides.id, rideId), eq(rides.status, 'REQUESTED'), isNull(rides.driverId)))
      .returning();
    if (result.length === 0) {
      apiError(409, 'This request was just taken by another driver.', 'ALREADY_TAKEN');
    }
    return this.toDto(result[0]);
  }

  async start(driverId: string, rideId: string) {
    const result = await this.db
      .update(rides)
      .set({ status: 'ONGOING', updatedAt: new Date() })
      .where(and(eq(rides.id, rideId), eq(rides.driverId, driverId), eq(rides.status, 'ACCEPTED')))
      .returning();
    if (result.length === 0) apiError(400, "This trip can't be started.", 'NOT_STARTABLE');
    return this.toDto(result[0]);
  }

 /**
   * Driver ends the trip. This no longer completes the ride outright — it
   * moves it to PAYMENT_PENDING (the Uber/Pathao model: the trip has ended
   * but the fare hasn't settled). The customer sees a "pay Rs X" panel; the
   * driver sees a "collect cash" summary. Actual completion — and the
   * driver's wallet credit — happens in settle() below, reached from either
   * confirmCash() (driver collected cash) or pay() (customer paid in-app).
   */
  async complete(driverId: string, rideId: string) {
    const result = await this.db
      .update(rides)
      .set({ status: 'PAYMENT_PENDING', completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(rides.id, rideId), eq(rides.driverId, driverId), eq(rides.status, 'ONGOING')))
      .returning();
    if (result.length === 0) apiError(400, "This trip can't be completed.", 'NOT_COMPLETABLE');
    return this.toDto(result[0]);
  }

  /** Driver confirms they collected the fare in cash at drop-off. */
  async confirmCash(driverId: string, rideId: string) {
    const [ride] = await this.db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride || ride.driverId !== driverId) apiError(404, 'Trip not found.');
    return this.settle(rideId, 'cash');
  }

  /** Customer settles a PAYMENT_PENDING fare in-app (wallet for now). */
  async pay(customerId: string, rideId: string, dto: PayRideDto) {
    const [ride] = await this.db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride || ride.customerId !== customerId) apiError(404, 'Trip not found.');
    return this.settle(rideId, dto.method, customerId);
  }

  /**
   * The single place a ride crosses PAYMENT_PENDING → COMPLETED. The status
   * flip is a conditional UPDATE, so if the customer taps "Pay with wallet"
   * at the same moment the driver taps "Cash collected", exactly one wins
   * and the other gets a clean "already settled" — the same race-safe
   * pattern accept() uses. Everything settles or nothing does: for wallet,
   * the customer debit, driver credit, ledger rows and status flip share one
   * transaction, so a 402 (insufficient balance) rolls the flip back too.
   */
  private async settle(rideId: string, method: 'cash' | 'wallet', payerId?: string) {
    const dto = await this.db.transaction(async (tx) => {
      const result = await tx
        .update(rides)
        .set({ status: 'COMPLETED', paymentMethod: method, paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(rides.id, rideId), eq(rides.status, 'PAYMENT_PENDING')))
        .returning();
      if (result.length === 0) {
        apiError(409, 'This trip has already been settled.', 'ALREADY_SETTLED');
      }
      const ride = result[0];
      const route = `${ride.fromLabel} → ${ride.toLabel}`;

      // Wallet payment moves real money: debit the customer first (throws
      // 402 and rolls everything back if the balance is short), then record
      // the outbound charge on their ledger.
      if (method === 'wallet' && payerId) {
        await debitWalletOrFail(tx, payerId, ride.fare);
        await tx.insert(transactions).values({
          id: id('t'),
          userId: payerId,
          type: 'RIDE',
          status: 'SUCCESS',
          amount: ride.fare,
          currency: 'NPR',
          description: `Trip fare · ${route}`,
          inbound: false,
        });
      }

      // Driver side is unchanged from before this refactor: fare credited to
      // the driver wallet + inbound ledger row, so the Wallet and Earnings
      // pages keep agreeing. It just happens at settlement now, not at
      // "Complete trip" — earnings only count money that actually arrived.
      if (ride.driverId) {
        await creditWallet(tx, ride.driverId, ride.fare);
        await tx.insert(transactions).values({
          id: id('t'),
          userId: ride.driverId,
          type: 'RIDE',
          status: 'SUCCESS',
          amount: ride.fare,
          currency: 'NPR',
          description: `Trip fare (${method}) · ${route}`,
          inbound: true,
        });
      }

      return ride;
    });
    return this.toDto(dto);
  }

  /* ───────────────────────────── Helpers ─────────────────────────────────── */

  private toDto(r: typeof rides.$inferSelect) {
    return {
      id: r.id,
      customerId: r.customerId,
      driverId: r.driverId,
      vehicleId: r.vehicleId,
      service: r.service,
      from: r.fromLabel,
      to: r.toLabel,
      pickupLat: r.pickupLat != null ? Number(r.pickupLat) : null,
      pickupLng: r.pickupLng != null ? Number(r.pickupLng) : null,
      dropLat: r.dropLat != null ? Number(r.dropLat) : null,
      dropLng: r.dropLng != null ? Number(r.dropLng) : null,
      distanceKm: r.distanceKm != null ? Number(r.distanceKm) : null,
      parcelWeightKg: r.parcelWeightKg,
     fare: Number(r.fare),
      status: r.status,
      paymentMethod: r.paymentMethod,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toReviewDto(r: typeof rideReviews.$inferSelect) {
    return {
      id: r.id,
      rideId: r.rideId,
      driverId: r.driverId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

@Controller('rides')
@UseGuards(JwtAuthGuard)
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.rides.history(user.id);
  }

  @Get('active')
  active(@CurrentUser() user: AuthenticatedUser) {
    return this.rides.active(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRideDto) {
    return this.rides.create(user.id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') rideId: string) {
    return this.rides.cancel(user.id, rideId);
  }

  @Post(':id/review')
  submitReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') rideId: string,
    @Body() dto: CreateRideReviewDto,
  ) {
    return this.rides.submitReview(user.id, rideId, dto);
  }

  @Get(':id/review')
  myReview(@CurrentUser() user: AuthenticatedUser, @Param('id') rideId: string) {
    return this.rides.myReview(user.id, rideId);
  }

  @Get('incoming')
  @UseGuards(RolesGuard)
  @Roles('driver')
  incoming(@CurrentUser() user: AuthenticatedUser) {
    return this.rides.incoming(user.id);
  }

  @Get('current')
  @UseGuards(RolesGuard)
  @Roles('driver')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.rides.currentJob(user.id);
  }

  @Post(':id/accept')
  @UseGuards(RolesGuard)
  @Roles('driver')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') rideId: string) {
    return this.rides.accept(user.id, rideId);
  }

  @Post(':id/start')
  @UseGuards(RolesGuard)
  @Roles('driver')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') rideId: string) {
    return this.rides.start(user.id, rideId);
  }

  @Post(':id/complete')
  @UseGuards(RolesGuard)
  @Roles('driver')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') rideId: string) {
    return this.rides.complete(user.id, rideId);
  }

  @Post(':id/confirm-cash')
  @UseGuards(RolesGuard)
  @Roles('driver')
  confirmCash(@CurrentUser() user: AuthenticatedUser, @Param('id') rideId: string) {
    return this.rides.confirmCash(user.id, rideId);
  }

  @Post(':id/pay')
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id') rideId: string, @Body() dto: PayRideDto) {
    return this.rides.pay(user.id, rideId, dto);
  }
}

/**
 * One normalized row per booking, whatever vertical it came from. The
 * frontend renders these generically — vertical only drives the badge,
 * icon and "view details" link.
 */
export interface UnifiedBooking {
  id: string;
  vertical: 'bus' | 'hotel' | 'food' | 'grocery' | 'freight';
  title: string;
  subtitle: string;
  ref: string | null;
  status: string;
  amount: number | null;
  date: string;
  href: string;
}

@Injectable()
export class BookingsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  /**
   * Cross-vertical unified bookings list. Each vertical is capped at its
   * 100 most recent rows so one hyperactive account can't make this
   * endpoint unbounded; the merged list is sorted newest-first.
   */
  async listForCustomer(customerId: string): Promise<UnifiedBooking[]> {
    const [busRows, hotelRows, foodRows, groceryRows, loadRows] = await Promise.all([
      this.db.select().from(tickets).where(eq(tickets.customerId, customerId)).orderBy(desc(tickets.bookedAt)).limit(100),
      this.db.select().from(roomBookings).where(eq(roomBookings.customerId, customerId)).orderBy(desc(roomBookings.bookedAt)).limit(100),
      this.db.select().from(foodOrders).where(eq(foodOrders.customerId, customerId)).orderBy(desc(foodOrders.placedAt)).limit(100),
      this.db.select().from(groceryOrders).where(eq(groceryOrders.customerId, customerId)).orderBy(desc(groceryOrders.placedAt)).limit(100),
      this.db.select().from(loads).where(eq(loads.customerId, customerId)).orderBy(desc(loads.createdAt)).limit(100),
    ]);

    const items: UnifiedBooking[] = [
      ...busRows.map((t): UnifiedBooking => ({
        id: t.id,
        vertical: 'bus',
        title: `${t.busSnapshot.from} → ${t.busSnapshot.to}`,
        subtitle: `${t.busSnapshot.operator} · ${t.busSnapshot.date} · ${t.busSnapshot.departure} · ${t.seats.length} seat${t.seats.length === 1 ? '' : 's'}`,
        ref: t.bookingRef,
        status: t.status,
        amount: Number(t.grandTotal),
        date: t.bookedAt.toISOString(),
        href: '/app/buses/tickets',
      })),
      ...hotelRows.map((b): UnifiedBooking => ({
        id: b.id,
        vertical: 'hotel',
        title: `${b.hotelSnapshot.hotelName} — ${b.hotelSnapshot.roomTypeName}`,
        subtitle: `${b.hotelSnapshot.city} · ${b.checkIn} → ${b.checkOut} · ${b.nights} night${b.nights === 1 ? '' : 's'}`,
        ref: b.bookingRef,
        status: b.status,
        amount: Number(b.grandTotal),
        date: b.bookedAt.toISOString(),
        href: '/app/hotels/bookings',
      })),
      ...foodRows.map((o): UnifiedBooking => ({
        id: o.id,
        vertical: 'food',
        title: o.restaurantSnapshot.restaurantName,
        subtitle: `${o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · ${o.restaurantSnapshot.city}`,
        ref: null,
        status: o.status,
        amount: Number(o.grandTotal),
        date: o.placedAt.toISOString(),
        href: '/app/restaurants/orders',
      })),
      ...groceryRows.map((o): UnifiedBooking => ({
        id: o.id,
        vertical: 'grocery',
        title: o.storeSnapshot.storeName,
        subtitle: `${o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · ${o.storeSnapshot.city}`,
        ref: null,
        status: o.status,
        amount: Number(o.grandTotal),
        date: o.placedAt.toISOString(),
        href: '/app/grocery/orders',
      })),
      ...loadRows.map((l): UnifiedBooking => ({
        id: l.id,
        vertical: 'freight',
        title: `${l.fromLabel} → ${l.toLabel}`,
        subtitle: `${l.cargoDescription} · ${l.weightKg} kg`,
        ref: null,
        status: l.status,
        amount: l.budget != null ? Number(l.budget) : null,
        date: l.createdAt.toISOString(),
        href: '/app/book/freight',
      })),
    ];

    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
}

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.bookings.listForCustomer(user.id);
  }
}