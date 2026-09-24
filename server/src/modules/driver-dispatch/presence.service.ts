import { HttpException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { driverLocationLog, driverStatus, rideOffers } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import type { DriverOfflineHook } from '../driver-onboarding/hooks';
import { DriverEventsBus } from './driver-events.bus';
import { EligibilityService } from './eligibility.service';
import { LOCATION_STORE, type LocationStore, type PositionInput } from './location.store';

/** Postgres keeps only a coarse position for older readers; live pings live in the location store. */
const DB_POSITION_REFRESH_MS = 60_000;

export interface GoOnlineOptions {
  /** Legacy POST /driver/status has no coordinates; allow it and wait for the first ping. */
  allowNoLocation?: boolean;
}

/** Online/offline state and location pings for a driver. */
@Injectable()
export class PresenceService implements DriverOfflineHook {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly eligibility: EligibilityService,
    @Inject(LOCATION_STORE) private readonly locations: LocationStore,
    private readonly bus: DriverEventsBus,
  ) {}

  async goOnline(
    driverId: string,
    loc?: { lat: number; lng: number; accuracy?: number },
    opts: GoOnlineOptions = {},
  ): Promise<{ online: true }> {
    const last = loc ? null : await this.locations.get(driverId);
    if (!loc && !last && !opts.allowNoLocation) {
      apiError(400, 'Turn on location to go online.', 'LOCATION_REQUIRED');
    }

    const check = await this.eligibility.check(driverId, { requireOnline: false, requireLocation: false });
    if (!check.eligible) {
      const [first] = check.reasons;
      throw new HttpException({ message: first.message, code: first.code, details: check.reasons }, 403);
    }

    const now = new Date();
    const known = loc ?? last;
    await this.db
      .insert(driverStatus)
      .values({
        userId: driverId,
        online: true,
        ...(loc ? { lat: loc.lat.toFixed(7), lng: loc.lng.toFixed(7), lastLocationAt: now } : {}),
      })
      .onConflictDoUpdate({
        target: driverStatus.userId,
        set: {
          online: true,
          updatedAt: now,
          ...(loc ? { lat: loc.lat.toFixed(7), lng: loc.lng.toFixed(7), lastLocationAt: now } : {}),
        },
      });

    // A supplied location is a fresh fix; a remembered one keeps its own (old) timestamp.
    if (loc) await this.locations.update(driverId, loc);
    if (known) await this.logEvent(driverId, 'ONLINE', known.lat, known.lng);
    return { online: true };
  }

  async goOffline(driverId: string): Promise<{ online: false }> {
    const last = await this.locations.get(driverId);
    await this.takeOffline(driverId);
    if (last) await this.logEvent(driverId, 'OFFLINE', last.lat, last.lng);
    return { online: false };
  }

  async ping(driverId: string, p: PositionInput): Promise<{ ok: true }> {
    if (!(p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180)) {
      apiError(400, 'That location is not valid.', 'BAD_LOCATION');
    }
    const [st] = await this.db
      .select({ online: driverStatus.online, lastLocationAt: driverStatus.lastLocationAt })
      .from(driverStatus)
      .where(eq(driverStatus.userId, driverId))
      .limit(1);
    if (!st?.online) apiError(400, 'Go online before broadcasting your location.', 'DRIVER_OFFLINE');

    await this.locations.update(driverId, p);

    const stale = !st.lastLocationAt || Date.now() - st.lastLocationAt.getTime() >= DB_POSITION_REFRESH_MS;
    if (stale) {
      const now = new Date();
      await this.db
        .update(driverStatus)
        .set({ lat: p.lat.toFixed(7), lng: p.lng.toFixed(7), lastLocationAt: now, updatedAt: now })
        .where(eq(driverStatus.userId, driverId));
    }
    return { ok: true };
  }

  /** Last position we know for the driver (live store first). */
  lastKnown(driverId: string) {
    return this.locations.get(driverId);
  }

  /** Called by admin suspension and the expiry job. Also tells the driver's open app. */
  async onDriverForcedOffline(driverId: string, reason: string): Promise<void> {
    await this.takeOffline(driverId);
    this.bus.publish(driverId, { type: 'status', data: { online: false, reason } });
  }

  private async takeOffline(driverId: string) {
    const now = new Date();
    await this.db.update(driverStatus).set({ online: false, updatedAt: now }).where(eq(driverStatus.userId, driverId));
    await this.locations.remove(driverId);
    await this.db
      .update(rideOffers)
      .set({ status: 'CANCELLED', respondedAt: now })
      .where(and(eq(rideOffers.driverId, driverId), eq(rideOffers.status, 'PENDING')));
  }

  private async logEvent(driverId: string, event: 'ONLINE' | 'OFFLINE', lat: number, lng: number) {
    await this.db.insert(driverLocationLog).values({
      id: id('dll'),
      driverId,
      event,
      lat: lat.toFixed(7),
      lng: lng.toFixed(7),
    });
  }
}
