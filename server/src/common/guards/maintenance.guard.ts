import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { platformSettings } from '../../database/schema';

/**
 * Makes the Settings screen's "maintenance mode" toggle actually DO
 * something: while it's on, every request except the super-admin API
 * gets a 503 with a friendly message, so the platform can be safely
 * frozen during a risky deploy or incident.
 *
 * Design notes:
 *  - /super-admin/* is always allowed — otherwise the admin who turned
 *    maintenance on could never turn it off again.
 *  - The flag is cached for 30s so this guard costs one DB read per
 *    half-minute, not one per request.
 *  - Fails OPEN: if the settings read itself errors, traffic is allowed.
 *    A broken settings table must never take the whole platform down.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  private cache: { on: boolean; fetchedAt: number } = { on: false, fetchedAt: 0 };

  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path ?? req.url ?? '';
    if (path.startsWith('/super-admin')) return true;

    const now = Date.now();
    if (now - this.cache.fetchedAt > 30_000) {
      try {
        const [row] = await this.db
          .select({ on: platformSettings.maintenanceMode })
          .from(platformSettings)
          .where(eq(platformSettings.id, 'platform'))
          .limit(1);
        this.cache = { on: row?.on ?? false, fetchedAt: now };
      } catch {
        this.cache = { on: false, fetchedAt: now };
      }
    }

    if (this.cache.on) {
      throw new ServiceUnavailableException(
        'Zamzam is briefly down for maintenance. Please try again in a few minutes.',
      );
    }
    return true;
  }
}