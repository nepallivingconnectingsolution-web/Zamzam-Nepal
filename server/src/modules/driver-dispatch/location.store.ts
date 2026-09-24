import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { haversineKm } from '../../common/geo';

export const LOCATION_STORE = Symbol('LOCATION_STORE');

export interface DriverPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  /** epoch ms of the fix */
  ts: number;
}

export type PositionInput = Omit<DriverPosition, 'ts'> & { ts?: number };

export interface NearbyDriver {
  driverId: string;
  distanceKm: number;
  lat: number;
  lng: number;
}

/**
 * Where live driver positions live. GPS pings arrive every few seconds per
 * driver, so they never touch Postgres: Redis GEO in production, memory in dev.
 */
export interface LocationStore {
  update(driverId: string, p: PositionInput): Promise<void>;
  get(driverId: string): Promise<DriverPosition | null>;
  remove(driverId: string): Promise<void>;
  /** Nearest first, within radiusKm. Freshness is the caller's job (see eligibility). */
  nearby(lat: number, lng: number, radiusKm: number, limit: number): Promise<NearbyDriver[]>;
}

const stamp = (p: PositionInput): DriverPosition => ({
  ...p,
  // Trust the device clock only when it is not in the future.
  ts: p.ts && p.ts <= Date.now() ? p.ts : Date.now(),
});

export class MemoryLocationStore implements LocationStore {
  private readonly positions = new Map<string, DriverPosition>();

  constructor(private readonly maxAgeMs = 10 * 60_000) {}

  async update(driverId: string, p: PositionInput) {
    this.positions.set(driverId, stamp(p));
  }

  async get(driverId: string) {
    return this.positions.get(driverId) ?? null;
  }

  async remove(driverId: string) {
    this.positions.delete(driverId);
  }

  async nearby(lat: number, lng: number, radiusKm: number, limit: number) {
    const cutoff = Date.now() - this.maxAgeMs;
    const out: NearbyDriver[] = [];
    for (const [driverId, p] of this.positions) {
      if (p.ts < cutoff) {
        this.positions.delete(driverId);
        continue;
      }
      const distanceKm = haversineKm(lat, lng, p.lat, p.lng);
      if (distanceKm <= radiusKm) out.push({ driverId, distanceKm, lat: p.lat, lng: p.lng });
    }
    return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
  }
}

const GEO_KEY = 'zz:drivers:geo';
const hashKey = (driverId: string) => `zz:driver:loc:${driverId}`;
const TTL_SECONDS = 300;

/**
 * Redis GEO + a short-lived hash per driver (the hash expiring is what removes
 * a driver whose app died). If Redis fails, the request is served from memory
 * for that instance instead of failing: a Redis blip must not stop drivers
 * going online. That fallback is per-instance, so run Redis in production.
 */
export class RedisLocationStore implements LocationStore {
  private readonly logger = new Logger(RedisLocationStore.name);
  private readonly fallback = new MemoryLocationStore();
  private lastWarn = 0;

  constructor(private readonly redis: Redis) {}

  private warn(err: unknown) {
    if (Date.now() - this.lastWarn > 30_000) {
      this.lastWarn = Date.now();
      this.logger.error(`Redis location store unavailable, using memory fallback: ${(err as Error).message}`);
    }
  }

  async update(driverId: string, p: PositionInput) {
    const pos = stamp(p);
    try {
      const fields: Record<string, string> = { lat: String(pos.lat), lng: String(pos.lng), ts: String(pos.ts) };
      if (pos.accuracy !== undefined) fields.accuracy = String(pos.accuracy);
      if (pos.heading !== undefined) fields.heading = String(pos.heading);
      if (pos.speed !== undefined) fields.speed = String(pos.speed);
      await this.redis
        .multi()
        .geoadd(GEO_KEY, pos.lng, pos.lat, driverId)
        .hset(hashKey(driverId), fields)
        .expire(hashKey(driverId), TTL_SECONDS)
        .exec();
    } catch (err) {
      this.warn(err);
      await this.fallback.update(driverId, pos);
    }
  }

  async get(driverId: string) {
    try {
      const h = await this.redis.hgetall(hashKey(driverId));
      if (!h || !h.ts) return this.fallback.get(driverId);
      const num = (v?: string) => (v === undefined ? undefined : Number(v));
      return {
        lat: Number(h.lat),
        lng: Number(h.lng),
        accuracy: num(h.accuracy),
        heading: num(h.heading),
        speed: num(h.speed),
        ts: Number(h.ts),
      };
    } catch (err) {
      this.warn(err);
      return this.fallback.get(driverId);
    }
  }

  async remove(driverId: string) {
    await this.fallback.remove(driverId);
    try {
      await this.redis.multi().zrem(GEO_KEY, driverId).del(hashKey(driverId)).exec();
    } catch (err) {
      this.warn(err);
    }
  }

  async nearby(lat: number, lng: number, radiusKm: number, limit: number) {
    try {
      const rows = (await this.redis.geosearch(
        GEO_KEY, 'FROMLONLAT', lng, lat, 'BYRADIUS', radiusKm, 'km', 'ASC', 'COUNT', limit, 'WITHCOORD', 'WITHDIST',
      )) as [string, string, [string, string]][];
      const out: NearbyDriver[] = [];
      for (const [driverId, dist, [gLng, gLat]] of rows) {
        // The hash expires when a driver stops pinging; drop them from the GEO set too.
        if ((await this.redis.hget(hashKey(driverId), 'ts')) === null) {
          void this.redis.zrem(GEO_KEY, driverId).catch(() => undefined);
          continue;
        }
        out.push({ driverId, distanceKm: Number(dist), lat: Number(gLat), lng: Number(gLng) });
      }
      return out;
    } catch (err) {
      this.warn(err);
      return this.fallback.nearby(lat, lng, radiusKm, limit);
    }
  }
}
