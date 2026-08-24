import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, and, gte, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { buses, schedules, trips } from '../../database/schema';
import { generateTripsForSchedule } from './trip-generator';
import { todayIso } from './bus-time.util';

/** Nightly top-up of the rolling trip horizon for every active daily/weekly schedule. Idempotent — dedupes against existing future trips. */
@Injectable()
export class BusesCronService {
  private readonly logger = new Logger(BusesCronService.name);

  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async regenerateAllTrips(): Promise<void> {
    try {
      const today = todayIso();
      const activeSchedules = await this.db.select().from(schedules)
        .where(and(eq(schedules.status, 'active'), sql`${schedules.frequency} != 'once'`));

      let inserted = 0;
      for (const schedule of activeSchedules) {
        const [bus] = await this.db.select().from(buses).where(eq(buses.id, schedule.busId)).limit(1);
        if (!bus) continue;

        const candidates = generateTripsForSchedule(schedule, bus.amenities);
        if (candidates.length === 0) continue;

        const existing = await this.db.select({ date: trips.date }).from(trips)
          .where(and(eq(trips.scheduleId, schedule.id), gte(trips.date, today)));
        const existingDates = new Set(existing.map((r) => r.date));

        const toInsert = candidates.filter((c) => !existingDates.has(c.date));
        if (toInsert.length > 0) {
          await this.db.insert(trips).values(toInsert);
          inserted += toInsert.length;
        }
      }
      this.logger.log(`regenerateAllTrips: scanned ${activeSchedules.length} schedules, inserted ${inserted} trip(s).`);
    } catch (err) {
      this.logger.error('regenerateAllTrips failed — retrying next scheduled run.', err as Error);
    }
  }
}