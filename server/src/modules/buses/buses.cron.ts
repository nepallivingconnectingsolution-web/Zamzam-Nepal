import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, and, gte, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { buses, schedules, trips } from '../../database/schema';
import { generateTripsForSchedule } from './trip-generator';
import { todayIso } from './bus-time.util';

/**
 * Keeps the rolling trip-generation horizon topped up every day for every
 * active daily/weekly schedule.
 *
 * This is the real, registered successor to the bug documented in this
 * project's history: a `regenerateAllTrips` cron job that was written but
 * never actually registered because `@nestjs/schedule` wasn't wired into
 * the module — meaning it silently never ran. Here, ScheduleModule.forRoot()
 * is imported in AppModule and this provider is registered in BusesModule,
 * so @Cron actually fires.
 *
 * Idempotency: every insert is deduplicated against existing future trips
 * for the same schedule/date, so re-running this twice (or after a
 * restart) never creates duplicate departures.
 */
@Injectable()
export class BusesCronService {
  private readonly logger = new Logger(BusesCronService.name);

  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async regenerateAllTrips(): Promise<void> {
    // This runs on a timer, completely outside any HTTP request — there is
    // no controller, no AllExceptionsFilter, no caller waiting to .catch()
    // it. A rejection here (e.g. Neon's serverless compute cold-starting
    // after auto-suspend, or any other transient DB blip) had nowhere to go
    // but an unhandled rejection, which used to take the entire process down
    // with it — every connected client sees that as the backend going dark
    // mid-session. The try/catch is what keeps one bad night's cron run from
    // becoming an outage; main.ts's process-level handler is the last-resort
    // backstop for everything else.
    try {
      const today = todayIso();
      const activeSchedules = await this.db
        .select()
        .from(schedules)
        .where(and(eq(schedules.status, 'active'), sql`${schedules.frequency} != 'once'`));

      let inserted = 0;
      for (const schedule of activeSchedules) {
        const [bus] = await this.db.select().from(buses).where(eq(buses.id, schedule.busId)).limit(1);
        if (!bus) continue;

        const candidates = generateTripsForSchedule(schedule, bus.amenities);
        if (candidates.length === 0) continue;

        const existing = await this.db
          .select({ date: trips.date })
          .from(trips)
          .where(and(eq(trips.scheduleId, schedule.id), gte(trips.date, today)));
        const existingDates = new Set(existing.map((r) => r.date));

        const toInsert = candidates.filter((c) => !existingDates.has(c.date));
        if (toInsert.length > 0) {
          await this.db.insert(trips).values(toInsert);
          inserted += toInsert.length;
        }
      }

      this.logger.log(
        `regenerateAllTrips: scanned ${activeSchedules.length} schedules, inserted ${inserted} new trip(s).`,
      );
    } catch (err) {
      // Logged, not rethrown: tomorrow's 1am run tries again on its own.
      // A missed night of trip generation is recoverable; a crashed server
      // is not.
      this.logger.error('regenerateAllTrips failed — will retry on the next scheduled run.', err as Error);
    }
  }
}
