import { MemoryLocationStore, RedisLocationStore } from './location.store';

// Kathmandu (Ratna Park) and points at increasing distance from it.
const ORIGIN = { lat: 27.7059, lng: 85.3145 };
const NEAR = { lat: 27.7065, lng: 85.3150 }; // ~80 m
const MID = { lat: 27.7200, lng: 85.3300 }; // ~2 km
const FAR = { lat: 27.9000, lng: 85.5000 }; // ~27 km

describe('MemoryLocationStore', () => {
  it('returns drivers within the radius, nearest first, with distances', async () => {
    const s = new MemoryLocationStore();
    await s.update('far', FAR);
    await s.update('mid', MID);
    await s.update('near', NEAR);
    const r = await s.nearby(ORIGIN.lat, ORIGIN.lng, 5, 10);
    expect(r.map((x) => x.driverId)).toEqual(['near', 'mid']);
    expect(r[0].distanceKm).toBeLessThan(0.2);
    expect(r[1].distanceKm).toBeGreaterThan(1.5);
    expect(r[1].distanceKm).toBeLessThan(3);
  });

  it('honours the limit', async () => {
    const s = new MemoryLocationStore();
    await s.update('a', NEAR);
    await s.update('b', MID);
    expect(await s.nearby(ORIGIN.lat, ORIGIN.lng, 5, 1)).toHaveLength(1);
  });

  it('stores heading, speed and accuracy and stamps a time', async () => {
    const s = new MemoryLocationStore();
    const before = Date.now();
    await s.update('d1', { ...NEAR, accuracy: 8, heading: 90, speed: 4.2 });
    const p = (await s.get('d1'))!;
    expect(p).toMatchObject({ lat: NEAR.lat, lng: NEAR.lng, accuracy: 8, heading: 90, speed: 4.2 });
    expect(p.ts).toBeGreaterThanOrEqual(before);
  });

  it('keeps a supplied timestamp but never one from the future', async () => {
    const s = new MemoryLocationStore();
    await s.update('d1', { ...NEAR, ts: Date.now() + 10 * 60_000 });
    expect((await s.get('d1'))!.ts).toBeLessThanOrEqual(Date.now());
  });

  it('forgets a driver on remove and never returns them from nearby', async () => {
    const s = new MemoryLocationStore();
    await s.update('d1', NEAR);
    await s.remove('d1');
    expect(await s.get('d1')).toBeNull();
    expect(await s.nearby(ORIGIN.lat, ORIGIN.lng, 5, 10)).toEqual([]);
  });

  it('drops entries that have not been refreshed for ages', async () => {
    const s = new MemoryLocationStore(60_000);
    await s.update('old', { ...NEAR, ts: Date.now() - 120_000 });
    expect(await s.nearby(ORIGIN.lat, ORIGIN.lng, 5, 10)).toEqual([]);
  });
});

describe('RedisLocationStore', () => {
  const makeRedis = () => {
    const calls: unknown[][] = [];
    const chain: any = {};
    const record = (name: string) => (...a: unknown[]) => {
      calls.push([name, ...a]);
      return chain;
    };
    for (const n of ['geoadd', 'hset', 'expire', 'zrem', 'del']) chain[n] = record(n);
    chain.exec = async () => [];
    const redis: any = {
      calls,
      multi: () => chain,
      hgetall: async (k: string) => {
        calls.push(['hgetall', k]);
        return { lat: '27.7065', lng: '85.315', accuracy: '8', heading: '90', speed: '4.2', ts: String(Date.now()) };
      },
      hget: async (_k: string, f: string) => (f === 'ts' ? String(Date.now()) : null),
      geosearch: async (...a: unknown[]) => {
        calls.push(['geosearch', ...a]);
        return [
          ['near', '0.0812', ['85.3150', '27.7065']],
          ['mid', '2.1', ['85.3300', '27.7200']],
        ];
      },
    };
    return redis;
  };

  it('writes the position into a GEO set and a short-lived hash', async () => {
    const redis = makeRedis();
    await new RedisLocationStore(redis).update('d1', { ...NEAR, accuracy: 8 });
    const names = redis.calls.map((c: unknown[]) => c[0]);
    expect(names).toEqual(expect.arrayContaining(['geoadd', 'hset', 'expire']));
    const geoadd = redis.calls.find((c: unknown[]) => c[0] === 'geoadd');
    expect(geoadd.slice(2)).toEqual([NEAR.lng, NEAR.lat, 'd1']); // GEOADD takes lng before lat
  });

  it('asks Redis for the nearest drivers and maps the reply', async () => {
    const redis = makeRedis();
    const r = await new RedisLocationStore(redis).nearby(ORIGIN.lat, ORIGIN.lng, 5, 10);
    const q = redis.calls.find((c: unknown[]) => c[0] === 'geosearch');
    expect(q.slice(2)).toEqual(['FROMLONLAT', ORIGIN.lng, ORIGIN.lat, 'BYRADIUS', 5, 'km', 'ASC', 'COUNT', 10, 'WITHCOORD', 'WITHDIST']);
    expect(r).toEqual([
      { driverId: 'near', distanceKm: 0.0812, lat: 27.7065, lng: 85.315 },
      { driverId: 'mid', distanceKm: 2.1, lat: 27.72, lng: 85.33 },
    ]);
  });

  it('falls back to memory instead of failing when Redis errors', async () => {
    const broken: any = {
      multi: () => {
        throw new Error('ECONNREFUSED');
      },
      hgetall: async () => {
        throw new Error('ECONNREFUSED');
      },
      hget: async () => {
        throw new Error('ECONNREFUSED');
      },
      geosearch: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    const s = new RedisLocationStore(broken);
    await expect(s.update('d1', NEAR)).resolves.toBeUndefined();
    expect((await s.get('d1'))!.lat).toBe(NEAR.lat);
    expect((await s.nearby(ORIGIN.lat, ORIGIN.lng, 5, 10)).map((x) => x.driverId)).toEqual(['d1']);
  });
});
