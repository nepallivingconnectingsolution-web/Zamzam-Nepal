import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

/**
 * Backs @nestjs/throttler with Redis so rate-limit counters survive app
 * restarts/deploys instead of resetting to zero every time (the default
 * in-memory storage). Returns undefined when REDIS_URL isn't configured
 * (e.g. local dev without Docker) so ThrottlerModule falls back to its
 * built-in in-memory storage rather than failing to start.
 */
export function buildThrottlerStorage(redisUrl: string | undefined): ThrottlerStorage | undefined {
  if (!redisUrl) return undefined;
  return new ThrottlerStorageRedisService(new Redis(redisUrl));
}
