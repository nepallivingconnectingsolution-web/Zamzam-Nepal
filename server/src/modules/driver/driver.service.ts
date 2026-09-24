import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { driverStatus, rideReviews, rides, users, vehicles } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { SERVICE_CATEGORIES } from '../vehicles/vehicles.service';
import { etaMinutes, haversineKm } from '../../common/geo';
import { PresenceService } from '../driver-dispatch/presence.service';

/**
 * How recent a driver's last GPS ping must be for them to count as
 * "here right now". Pings arrive every ~10s from an active driver app, so
 * 5 minutes is generous — it mostly exists to expel drivers whose app was
 * killed without ever toggling offline.
 */
const LOCATION_FRESH_MS = 5 * 60 * 1000;

/** Search radius for nearby matching. */
const NEARBY_RADIUS_KM = 10;

@Injectable()
export class DriverService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly presence: PresenceService,
  ) {}

  private async isOnline(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(driverStatus)
      .where(eq(driverStatus.userId, userId))
      .limit(1);
    return row?.online ?? false;
  }

  /**
   * Real earnings from completed rides (Batch 4) — today's total, the last
   * 7 days, and a per-day series for the dashboard chart. Empty when the
   * driver hasn't completed any trips, so the chart's honest empty state
   * still renders for new drivers.
   */
  async earnings(userId: string) {
    const online = await this.isOnline(userId);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

    const rows = await this.db
      .select({ fare: rides.fare, createdAt: rides.createdAt })
      .from(rides)
      .where(and(eq(rides.driverId, userId), eq(rides.status, 'COMPLETED'), gte(rides.createdAt, weekAgo)))
      .orderBy(desc(rides.createdAt));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const dayKey = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' });
    const series: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      series.push({ label: dayKey(d), value: 0 });
    }
    let today = 0;
    let week = 0;
    let tripsToday = 0;
    for (const r of rows) {
      const fare = Number(r.fare);
      week += fare;
      const idx = 6 - Math.floor((startOfToday.getTime() + 86_400_000 - r.createdAt.getTime()) / 86_400_000);
      if (idx >= 0 && idx <= 6) series[idx].value += fare;
      if (r.createdAt >= startOfToday) {
        today += fare;
        tripsToday += 1;
      }
    }

    return {
      today,
      week,
      tripsToday,
      currency: 'NPR',
      series: week > 0 ? series : ([] as { label: string; value: number }[]),
      online,
    };
  }

  /**
   * Every review a rider has left for this driver, most recent first —
   * feeds the driver-side Ratings page. This is the "driver admin" view of
   * the rideReviews riders submit from GET /rides/:id/review on completed
   * taxi/bike/parcel trips.
   */
  async reviews(driverId: string) {
    const rows = await this.db
      .select({
        review: rideReviews,
        customerName: users.name,
        service: rides.service,
        fromLabel: rides.fromLabel,
        toLabel: rides.toLabel,
        rideDate: rides.createdAt,
      })
      .from(rideReviews)
      .innerJoin(users, eq(users.id, rideReviews.customerId))
      .innerJoin(rides, eq(rides.id, rideReviews.rideId))
      .where(eq(rideReviews.driverId, driverId))
      .orderBy(desc(rideReviews.createdAt));

    return rows.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      comment: r.review.comment,
      createdAt: r.review.createdAt.toISOString(),
      customerName: r.customerName,
      service: r.service,
      from: r.fromLabel,
      to: r.toLabel,
      rideDate: r.rideDate.toISOString(),
    }));
  }

  async reviewSummary(driverId: string) {
    const reviews = await this.reviews(driverId);
    const count = reviews.length;
    const average = count === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    return { average: Math.round(average * 10) / 10, count, distribution };
  }

  /**
   * Legacy path kept for compatibility — the driver dashboard now reads
   * incoming requests from GET /rides/incoming (RidesService.incoming),
   * which does the real matching.
   */
  async requests(userId: string) {
    const online = await this.isOnline(userId);
    if (!online) return [];
    return [];
  }

  /**
   * Legacy online/offline toggle (POST /driver/status). Going online now runs the
   * full eligibility check (approved driver, approved vehicle, valid licence and
   * documents, not suspended, no active trip). It has no coordinates, so it
   * reuses the last known position and otherwise waits for the first ping;
   * new clients use POST /driver/go-online, which requires a location.
   */
  async setStatus(userId: string, online: boolean) {
    if (online) {
      await this.presence.goOnline(userId, undefined, { allowNoLocation: true });
      return { online: true };
    }
    await this.presence.goOffline(userId);
    return { online: false };
  }

  /**
   * Live GPS ping. Positions go to the location store (Redis GEO in
   * production); Postgres only gets a coarse copy about once a minute.
   */
  async updateLocation(
    userId: string,
    lat: number,
    lng: number,
    extra: { accuracy?: number; heading?: number; speed?: number; ts?: number } = {},
  ) {
    return this.presence.ping(userId, { lat, lng, ...extra });
  }

  /**
   * The matching step where both sides of the architecture meet: which
   * verified, online, recently-located vehicles near this point can serve
   * this service (and, for parcels, carry this weight)?
   *
   * SQL narrows the pool (online + fresh + approved + right category +
   * enough capacity); the precise distance sort happens in JS with
   * Haversine, which is fine because the SQL filters keep the candidate
   * set small at launch scale.
   */
  async nearby(service: 'taxi' | 'bike' | 'parcel', lat: number, lng: number, weightKg?: number) {
    const categories = SERVICE_CATEGORIES[service] ?? [];
    if (categories.length === 0) return [];

    const freshAfter = new Date(Date.now() - LOCATION_FRESH_MS);

    const rows = await this.db
      .select({
        driverId: driverStatus.userId,
        driverName: users.name,
        lat: driverStatus.lat,
        lng: driverStatus.lng,
        vehicleId: vehicles.id,
        category: vehicles.category,
        makeModel: vehicles.makeModel,
        plateNumber: vehicles.plateNumber,
        maxWeightKg: vehicles.maxWeightKg,
        seats: vehicles.seats,
      })
      .from(driverStatus)
      .innerJoin(vehicles, eq(driverStatus.activeVehicleId, vehicles.id))
      .innerJoin(users, eq(driverStatus.userId, users.id))
      .where(
        and(
          eq(driverStatus.online, true),
          isNotNull(driverStatus.lat),
          isNotNull(driverStatus.lng),
          gte(driverStatus.lastLocationAt, freshAfter),
          eq(vehicles.verificationStatus, 'APPROVED'),
          eq(vehicles.isActive, true),
          inArray(vehicles.category, categories),
          ...(weightKg ? [gte(vehicles.maxWeightKg, weightKg)] : []),
        ),
      );

    return rows
      .map((r) => {
        const dLat = Number(r.lat);
        const dLng = Number(r.lng);
        const distanceKm = haversineKm(lat, lng, dLat, dLng);
        return {
          driverId: r.driverId,
          driverName: r.driverName,
          vehicleId: r.vehicleId,
          category: r.category,
          makeModel: r.makeModel,
          plateNumber: r.plateNumber,
          maxWeightKg: r.maxWeightKg,
          seats: r.seats,
          lat: dLat,
          lng: dLng,
          distanceKm: Number(distanceKm.toFixed(2)),
          etaMin: etaMinutes(distanceKm),
        };
      })
      .filter((r) => r.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 10);
  }
}