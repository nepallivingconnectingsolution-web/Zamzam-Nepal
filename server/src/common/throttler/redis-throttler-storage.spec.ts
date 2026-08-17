import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { buildThrottlerStorage } from './redis-throttler-storage';

describe('buildThrottlerStorage', () => {
  it('returns undefined when no REDIS_URL is configured (falls back to in-memory)', () => {
    expect(buildThrottlerStorage(undefined)).toBeUndefined();
    expect(buildThrottlerStorage('')).toBeUndefined();
  });

  it('returns a Redis-backed storage instance when REDIS_URL is set', () => {
    const storage = buildThrottlerStorage('redis://localhost:6379');
    expect(storage).toBeInstanceOf(ThrottlerStorageRedisService);
  });
});
