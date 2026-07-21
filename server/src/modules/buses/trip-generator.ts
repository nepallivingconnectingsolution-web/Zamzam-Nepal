import { id } from '../../common/id';
import { addDaysIso, dayOfWeek, todayIso } from './bus-time.util';
import type { schedules as schedulesTable } from '../../database/schema';

export const TRIP_GENERATION_HORIZON_DAYS = 21;

type ScheduleRow = typeof schedulesTable.$inferSelect;

export interface GeneratedTrip {
  id: string;
  scheduleId: string;
  operatorId: string;
  busId: string;
  fromCity: string;
  toCity: string;
  date: string;
  departure: string;
  arrival: string;
  duration: string;
  price: string;
  status: 'scheduled';
  bookedSeats: string[];
  totalSeats: number;
  totalRows: number;
  type: string;
  amenities: string[];
}

/**
 * Generates dated departures for a schedule template, looking ~21 days
 * ahead — the exact horizon and once/daily/weekly semantics from the
 * original mock engine's `generateTrips()`. Re-running this for the same
 * schedule on a later day naturally extends coverage further into the
 * future (see buses.cron.ts), since it always looks forward from "today".
 */
export function generateTripsForSchedule(schedule: ScheduleRow, busAmenities: string[]): GeneratedTrip[] {
  const out: GeneratedTrip[] = [];
  const start = todayIso();

  const make = (date: string): GeneratedTrip => ({
    id: id('trip'),
    scheduleId: schedule.id,
    operatorId: schedule.operatorId,
    busId: schedule.busId,
    fromCity: schedule.fromCity,
    toCity: schedule.toCity,
    date,
    departure: schedule.departure,
    arrival: schedule.arrival,
    duration: schedule.duration,
    price: schedule.price,
    status: 'scheduled',
    bookedSeats: [],
    totalSeats: schedule.totalSeats,
    totalRows: Math.ceil(schedule.totalSeats / 4),
    type: schedule.busType,
    amenities: busAmenities,
  });

  if (schedule.frequency === 'once') {
    if (schedule.onceDate && schedule.onceDate >= start) {
      out.push(make(schedule.onceDate));
    }
    return out;
  }

  const from = schedule.validFrom && schedule.validFrom > start ? schedule.validFrom : start;
  const until = schedule.validUntil ?? addDaysIso(start, TRIP_GENERATION_HORIZON_DAYS);

  let d = from;
  let i = 0;
  while (d <= until && i < TRIP_GENERATION_HORIZON_DAYS) {
    const dow = dayOfWeek(d);
    if (schedule.frequency === 'daily' || (schedule.frequency === 'weekly' && schedule.operatingDays.includes(dow))) {
      out.push(make(d));
    }
    d = addDaysIso(d, 1);
    i++;
  }
  return out;
}
