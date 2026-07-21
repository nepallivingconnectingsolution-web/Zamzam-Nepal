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
  }
}
