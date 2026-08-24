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
 * Generates dated departures for a schedule, looking
 * TRIP_GENERATION_HORIZON_DAYS ahead of "today". Always anchored to today
 * rather than the schedule's original validFrom, so re-running this later
 * (see buses.cron.ts) naturally extends coverage further out.
 */
export function generateTripsForSchedule(schedule: ScheduleRow, busAmenities: string[]): GeneratedTrip[] {
  const start = todayIso();

  const makeTrip = (date: string): GeneratedTrip => ({
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
    return schedule.onceDate && schedule.onceDate >= start ? [makeTrip(schedule.onceDate)] : [];
  }

  const rangeStart = schedule.validFrom > start ? schedule.validFrom : start;
  const rangeEnd = schedule.validUntil ?? addDaysIso(start, TRIP_GENERATION_HORIZON_DAYS);

  const out: GeneratedTrip[] = [];
  let date = rangeStart;
  for (let i = 0; i < TRIP_GENERATION_HORIZON_DAYS && date <= rangeEnd; i++, date = addDaysIso(date, 1)) {
    const runsToday =
      schedule.frequency === 'daily' ||
      (schedule.frequency === 'weekly' && schedule.operatingDays.includes(dayOfWeek(date)));
    if (runsToday) out.push(makeTrip(date));
  }
  return out;
}