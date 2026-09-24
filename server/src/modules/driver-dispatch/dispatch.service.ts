import { HttpException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gt, inArray, isNull, lt, ne, notInArray } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { driverLocationLog, driverStatus, rideOffers, rides, vehicles } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { etaMinutes } from '../../common/geo';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import type { DbExecutor } from '../driver-onboarding/db-types';
import { DriverEventsBus } from './driver-events.bus';
import { EligibilityService } from './eligibility.service';
import { LOCATION_STORE, type LocationStore } from './location.store';

type RideRow = typeof rides.$inferSelect;
type OfferRow = typeof rideOffers.$inferSelect;
type Service = 'taxi' | 'bike' | 'parcel';

const SERVICES: Service[] = ['taxi', 'bike', 'parcel'];
/** How long a request keeps being retried when nobody was around to offer it to. */
const RETRY_WINDOW_MS = 10 * 60_000;

export interface OfferView {
  offerId: string;
  rideId: string;
  service: string;
  pickup: { label: string; lat: number | null; lng: number | null };
  destination: { label: string; lat: number | null; lng: number | null };
  distanceKm: number | null;
  fare: number;
  pickupDistanceKm: number;
  pickupEtaMin: number;
  expiresAt: string;
}

const num = (v: string | null) => (v == null ? null : Number(v));

function offerView(offer: OfferRow, ride: RideRow): OfferView {
  return {
    offerId: offer.id,
    rideId: ride.id,
    service: ride.service,
    pickup: { label: ride.fromLabel, lat: num(ride.pickupLat), lng: num(ride.pickupLng) },
    destination: { label: ride.toLabel, lat: num(ride.dropLat), lng: num(ride.dropLng) },
    distanceKm: num(ride.distanceKm),
    fare: Number(ride.fare),
    pickupDistanceKm: Number((offer.pickupDistanceM / 1000).toFixed(2)),
    pickupEtaMin: offer.etaMin,
    expiresAt: offer.expiresAt.toISOString(),
  };
}

/**
 * Turns a passenger request into time-limited offers to the nearest eligible
 * drivers, and turns exactly one acceptance into exactly one assignment.
 *
 * The database is the source of truth: acceptRide runs in one transaction that
 * locks the ride and the driver, re-checks eligibility on the locked rows, and
 * is backstopped by a unique index (one active ride per driver).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  private readonly ttlMs: number;
  private readonly batchSize: number;
  private readonly maxRounds: number;
  private readonly radiusKm: number;

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly eligibility: EligibilityService,
    @Inject(LOCATION_STORE) private readonly locations: LocationStore,
    private readonly bus: DriverEventsBus,
    private readonly notifications: NotificationsService,
    @Optional() config?: ConfigService,
  ) {
    const read = (key: string, fallback: number) => {
      const v = Number(config?.get(key));
      return v > 0 ? v : fallback;
    };
    this.ttlMs = read('OFFER_TTL_SECONDS', 15) * 1000;
    this.batchSize = Math.floor(read('OFFER_BATCH_SIZE', 3));
    this.maxRounds = Math.floor(read('OFFER_MAX_ROUNDS', 3));
    this.radiusKm = read('DISPATCH_RADIUS_KM', 8);
  }

  /* ───────────────────────────── Offering ──────────────────────────────── */

  /** Offer an open ride to the next batch of eligible drivers, nearest first. */
  async start(rideId: string): Promise<{ offered: number }> {
    const [ride] = await this.db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride || ride.status !== 'REQUESTED' || ride.driverId) return { offered: 0 };
    if (ride.pickupLat == null || ride.pickupLng == null) return { offered: 0 };
    if (!SERVICES.includes(ride.service as Service)) return { offered: 0 };

    const prior = await this.db
      .select({ driverId: rideOffers.driverId, round: rideOffers.round })
      .from(rideOffers)
      .where(eq(rideOffers.rideId, rideId));
    const round = Math.max(0, ...prior.map((p) => p.round)) + 1;
    if (round > this.maxRounds) return { offered: 0 };
    const alreadyOffered = new Set(prior.map((p) => p.driverId));

    // A driver deciding on one request is not offered another until they answer.
    const deciding = await this.db
      .select({ driverId: rideOffers.driverId })
      .from(rideOffers)
      .where(and(eq(rideOffers.status, 'PENDING'), gt(rideOffers.expiresAt, new Date())));
    const busy = new Set(deciding.map((d) => d.driverId));

    const nearby = await this.locations.nearby(Number(ride.pickupLat), Number(ride.pickupLng), this.radiusKm, 30);
    const chosen: typeof nearby = [];
    for (const c of nearby) {
      if (alreadyOffered.has(c.driverId) || busy.has(c.driverId)) continue;
      const check = await this.eligibility.check(c.driverId, {
        serviceType: ride.service as Service,
        requireOnline: true,
        requireLocation: true,
      });
      if (!check.eligible) continue;
      if (ride.parcelWeightKg != null && !(await this.canCarry(c.driverId, ride.parcelWeightKg))) continue;
      chosen.push(c);
      if (chosen.length >= this.batchSize) break;
    }
    if (chosen.length === 0) return { offered: 0 };

    const expiresAt = new Date(Date.now() + this.ttlMs);
    const inserted = await this.db
      .insert(rideOffers)
      .values(
        chosen.map((c) => ({
          id: id('ofr'),
          rideId,
          driverId: c.driverId,
          round,
          pickupDistanceM: Math.round(c.distanceKm * 1000),
          etaMin: etaMinutes(c.distanceKm),
          expiresAt,
        })),
      )
      .onConflictDoNothing()
      .returning();

    for (const offer of inserted) {
      this.bus.publish(offer.driverId, { type: 'offer', data: offerView(offer, ride) });
      await this.notifications.notifyUser(offer.driverId, {
        type: 'ride_offer',
        title: 'New ride request',
        message: `${ride.fromLabel} to ${ride.toLabel} · NPR ${Number(ride.fare)}`,
        entityType: 'ride',
        entityId: ride.id,
      });
    }
    return { offered: inserted.length };
  }

  /** The driver's live offers (the polling fallback for the realtime stream). */
  async pending(driverId: string): Promise<OfferView[]> {
    const rows = await this.db
      .select({ offer: rideOffers, ride: rides })
      .from(rideOffers)
      .innerJoin(rides, eq(rides.id, rideOffers.rideId))
      .where(
        and(
          eq(rideOffers.driverId, driverId),
          eq(rideOffers.status, 'PENDING'),
          gt(rideOffers.expiresAt, new Date()),
          eq(rides.status, 'REQUESTED'),
        ),
      )
      .orderBy(asc(rideOffers.expiresAt));
    return rows.map((r) => offerView(r.offer, r.ride));
  }

  /* ───────────────────────────── Responding ────────────────────────────── */

  async acceptOffer(driverId: string, offerId: string) {
    const [offer] = await this.db
      .select()
      .from(rideOffers)
      .where(and(eq(rideOffers.id, offerId), eq(rideOffers.driverId, driverId)))
      .limit(1);
    if (!offer) apiError(404, 'Offer not found.', 'NOT_FOUND');
    if (offer.status !== 'PENDING') apiError(409, 'This offer is no longer available.', 'OFFER_GONE');
    if (offer.expiresAt.getTime() < Date.now()) apiError(409, 'This offer has expired.', 'OFFER_EXPIRED');
    return this.acceptRide(driverId, offer.rideId);
  }

  async decline(driverId: string, offerId: string): Promise<{ ok: true }> {
    const declined = await this.db
      .update(rideOffers)
      .set({ status: 'DECLINED', respondedAt: new Date() })
      .where(and(eq(rideOffers.id, offerId), eq(rideOffers.driverId, driverId), eq(rideOffers.status, 'PENDING')))
      .returning({ rideId: rideOffers.rideId });
    if (declined.length === 0) apiError(409, 'This offer is no longer available.', 'OFFER_GONE');
    await this.offerNextIfIdle(declined[0].rideId);
    return { ok: true };
  }

  /**
   * The one place a driver becomes assigned to a ride. Both the offer flow and
   * the legacy POST /rides/:id/accept end here, so there is a single rule.
   */
  async acceptRide(driverId: string, rideId: string): Promise<RideRow> {
    let result: { ride: RideRow; withdrawn: { driverId: string }[] };
    try {
      result = await this.db.transaction(async (tx) => {
        // Lock order is always ride, then driver: no two accepts can deadlock.
        const [ride] = await tx.select().from(rides).where(eq(rides.id, rideId)).for('update');
        if (!ride) apiError(404, 'Trip not found.', 'NOT_FOUND');
        if (ride.status === 'CANCELLED') apiError(409, 'This ride was cancelled.', 'RIDE_CANCELLED');
        if (ride.status !== 'REQUESTED' || ride.driverId) {
          apiError(409, 'This request was just taken by another driver.', 'ALREADY_TAKEN');
        }

        await tx.insert(driverStatus).values({ userId: driverId }).onConflictDoNothing();
        const [ds] = await tx.select().from(driverStatus).where(eq(driverStatus.userId, driverId)).for('update');

        // Evaluated on the locked rows, so a concurrent accept or admin action is seen.
        const check = await this.eligibility.check(
          driverId,
          { serviceType: SERVICES.includes(ride.service as Service) ? (ride.service as Service) : undefined, requireOnline: true, requireLocation: false },
          tx,
        );
        if (!check.eligible) {
          const [first] = check.reasons;
          if (first.code === 'ACTIVE_RIDE') {
            apiError(409, 'Finish and settle your current trip before accepting another.', 'DRIVER_BUSY');
          }
          throw new HttpException({ message: first.message, code: first.code, details: check.reasons }, 403);
        }
        if (ride.parcelWeightKg != null && !(await this.canCarry(driverId, ride.parcelWeightKg, tx))) {
          apiError(400, 'This parcel is too heavy for your vehicle.', 'TOO_HEAVY');
        }

        const [updated] = await tx
          .update(rides)
          .set({ driverId, vehicleId: ds.activeVehicleId, status: 'ACCEPTED', updatedAt: new Date() })
          .where(and(eq(rides.id, rideId), eq(rides.status, 'REQUESTED'), isNull(rides.driverId)))
          .returning();
        if (!updated) apiError(409, 'This request was just taken by another driver.', 'ALREADY_TAKEN');

        const now = new Date();
        await tx
          .update(rideOffers)
          .set({ status: 'ACCEPTED', respondedAt: now })
          .where(and(eq(rideOffers.rideId, rideId), eq(rideOffers.driverId, driverId)));
        const withdrawn = await tx
          .update(rideOffers)
          .set({ status: 'CANCELLED', respondedAt: now })
          .where(and(eq(rideOffers.rideId, rideId), eq(rideOffers.status, 'PENDING'), ne(rideOffers.driverId, driverId)))
          .returning({ driverId: rideOffers.driverId });
        // Whatever else was waiting on this driver is moot now.
        await tx
          .update(rideOffers)
          .set({ status: 'CANCELLED', respondedAt: now })
          .where(and(eq(rideOffers.driverId, driverId), eq(rideOffers.status, 'PENDING'), ne(rideOffers.rideId, rideId)));

        return { ride: updated, withdrawn };
      });
    } catch (err) {
      // The unique index (one active ride per driver) is the backstop for any race the locks miss.
      const e = err as { code?: string; message?: string; constraint?: string };
      if (e.code === '23505' && `${e.constraint ?? ''}${e.message ?? ''}`.includes('rides_one_active_per_driver')) {
        apiError(409, 'Finish and settle your current trip before accepting another.', 'DRIVER_BUSY');
      }
      throw err;
    }

    for (const w of result.withdrawn) {
      this.bus.publish(w.driverId, { type: 'offer_cancelled', data: { rideId, reason: 'taken' } });
    }
    await this.logRideEvent(driverId, rideId, 'ACCEPTED');
    return result.ride;
  }

  /* ───────────────────────────── Housekeeping ──────────────────────────── */

  /** Expire unanswered offers, withdraw offers on rides that are no longer open, and offer the next batch. */
  async expireStale(): Promise<number> {
    const now = new Date();
    const expired = await this.db
      .update(rideOffers)
      .set({ status: 'EXPIRED', respondedAt: now })
      .where(and(eq(rideOffers.status, 'PENDING'), lt(rideOffers.expiresAt, now)))
      .returning({ rideId: rideOffers.rideId, driverId: rideOffers.driverId });
    for (const e of expired) {
      this.bus.publish(e.driverId, { type: 'offer_cancelled', data: { rideId: e.rideId, reason: 'expired' } });
    }

    const orphaned = await this.db
      .update(rideOffers)
      .set({ status: 'CANCELLED', respondedAt: now })
      .where(
        and(
          eq(rideOffers.status, 'PENDING'),
          inArray(rideOffers.rideId, this.db.select({ id: rides.id }).from(rides).where(ne(rides.status, 'REQUESTED'))),
        ),
      )
      .returning({ rideId: rideOffers.rideId, driverId: rideOffers.driverId });
    for (const o of orphaned) {
      this.bus.publish(o.driverId, { type: 'offer_cancelled', data: { rideId: o.rideId, reason: 'unavailable' } });
    }

    for (const rideId of new Set(expired.map((e) => e.rideId))) {
      await this.offerNextIfIdle(rideId);
    }
    return expired.length;
  }

  /** Requests that found nobody nearby are tried again as drivers come online. */
  async retryOpenRides(limit = 20): Promise<number> {
    const open = await this.db
      .select({ id: rides.id })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'REQUESTED'),
          isNull(rides.driverId),
          gt(rides.createdAt, new Date(Date.now() - RETRY_WINDOW_MS)),
          notInArray(rides.id, this.db.select({ id: rideOffers.rideId }).from(rideOffers).where(eq(rideOffers.status, 'PENDING'))),
        ),
      )
      .orderBy(asc(rides.createdAt))
      .limit(limit);
    let offered = 0;
    for (const r of open) offered += (await this.start(r.id)).offered;
    return offered;
  }

  /** The customer cancelled: withdraw waiting offers and tell an already-assigned driver. */
  async onRideCancelled(rideId: string, assignedDriverId: string | null): Promise<void> {
    const withdrawn = await this.db
      .update(rideOffers)
      .set({ status: 'CANCELLED', respondedAt: new Date() })
      .where(and(eq(rideOffers.rideId, rideId), eq(rideOffers.status, 'PENDING')))
      .returning({ driverId: rideOffers.driverId });
    for (const w of withdrawn) {
      this.bus.publish(w.driverId, { type: 'offer_cancelled', data: { rideId, reason: 'cancelled' } });
    }
    if (assignedDriverId) {
      this.bus.publish(assignedDriverId, { type: 'ride_cancelled', data: { rideId } });
      await this.notifications.notifyUser(assignedDriverId, {
        type: 'ride_update',
        title: 'Ride cancelled',
        message: 'The rider cancelled this trip.',
        entityType: 'ride',
        entityId: rideId,
      });
    }
  }

  /** A trip milestone with the driver's position at that moment (never per GPS ping). */
  async logRideEvent(driverId: string, rideId: string, event: 'ACCEPTED' | 'STARTED' | 'COMPLETED'): Promise<void> {
    try {
      const p = await this.locations.get(driverId);
      if (!p) return;
      await this.db.insert(driverLocationLog).values({
        id: id('dll'),
        driverId,
        rideId,
        event,
        lat: p.lat.toFixed(7),
        lng: p.lng.toFixed(7),
      });
    } catch (err) {
      this.logger.warn(`Could not log ${event} for ride ${rideId}: ${(err as Error).message}`);
    }
  }

  /* ───────────────────────────── Helpers ───────────────────────────────── */

  private async offerNextIfIdle(rideId: string) {
    const [waiting] = await this.db
      .select({ id: rideOffers.id })
      .from(rideOffers)
      .where(and(eq(rideOffers.rideId, rideId), eq(rideOffers.status, 'PENDING'), gt(rideOffers.expiresAt, new Date())))
      .limit(1);
    if (waiting) return;
    try {
      await this.start(rideId);
    } catch (err) {
      this.logger.error(`Could not offer ride ${rideId} to the next drivers: ${(err as Error).message}`);
    }
  }

  private async canCarry(driverId: string, weightKg: number, db: DbExecutor = this.db): Promise<boolean> {
    const [row] = await db
      .select({ maxWeightKg: vehicles.maxWeightKg })
      .from(driverStatus)
      .innerJoin(vehicles, eq(vehicles.id, driverStatus.activeVehicleId))
      .where(eq(driverStatus.userId, driverId))
      .limit(1);
    return !!row && row.maxWeightKg >= weightKg;
  }
}
