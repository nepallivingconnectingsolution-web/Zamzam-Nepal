import { generateTripsForSchedule, TRIP_GENERATION_HORIZON_DAYS } from './trip-generator';
import { addDaysIso, dayOfWeek, todayIso } from './bus-time.util';
import type { schedules as schedulesTable } from '../../database/schema';

type ScheduleRow = typeof schedulesTable.$inferSelect;

/** A fully-populated schedule row, overridable per test. */
function makeSchedule(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 'sch_test',
    operatorId: 'op_test',
    busId: 'bus_test',
    fromCity: 'Kathmandu',
    toCity: 'Pokhara',
    departure: '07:00 AM',
    arrival: '01:30 PM',
    duration: '6h 30m',
    price: '1500.00',
    status: 'active',
    frequency: 'once',
    operatingDays: [],
    onceDate: null,
    validFrom: todayIso(),
    validUntil: null,
    busName: 'Zamzam Deluxe',
    busType: 'AC Deluxe',
    totalSeats: 40,
    createdAt: new Date(),
    ...overrides,
  } as ScheduleRow;
}

const AMENITIES = ['wifi', 'ac'];

describe('generateTripsForSchedule', () => {
  const REAL_NOW = new Date('2026-03-10T00:00:00Z'); // a Tuesday

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(REAL_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('once', () => {
    it('generates exactly one trip on onceDate when it is today or later', () => {
      const schedule = makeSchedule({ frequency: 'once', onceDate: todayIso() });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(1);
      expect(trips[0].date).toBe(todayIso());
    });

    it('generates a trip for a future onceDate', () => {
      const future = addDaysIso(todayIso(), 5);
      const schedule = makeSchedule({ frequency: 'once', onceDate: future });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(1);
      expect(trips[0].date).toBe(future);
    });

    it('generates no trips when onceDate is in the past', () => {
      const past = addDaysIso(todayIso(), -1);
      const schedule = makeSchedule({ frequency: 'once', onceDate: past });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(0);
    });

    it('generates no trips when onceDate is missing', () => {
      const schedule = makeSchedule({ frequency: 'once', onceDate: null });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(0);
    });

    it('copies schedule fields and the given amenities onto the generated trip', () => {
      const schedule = makeSchedule({ frequency: 'once', onceDate: todayIso(), price: '2500.00' });
      const [trip] = generateTripsForSchedule(schedule, AMENITIES);
      expect(trip.id.startsWith('trip_')).toBe(true);
      expect(trip.scheduleId).toBe(schedule.id);
      expect(trip.operatorId).toBe(schedule.operatorId);
      expect(trip.busId).toBe(schedule.busId);
      expect(trip.fromCity).toBe(schedule.fromCity);
      expect(trip.toCity).toBe(schedule.toCity);
      expect(trip.departure).toBe(schedule.departure);
      expect(trip.arrival).toBe(schedule.arrival);
      expect(trip.duration).toBe(schedule.duration);
      expect(trip.price).toBe('2500.00');
      expect(trip.status).toBe('scheduled');
      expect(trip.bookedSeats).toEqual([]);
      expect(trip.totalSeats).toBe(40);
      expect(trip.totalRows).toBe(10); // ceil(40/4)
      expect(trip.type).toBe(schedule.busType);
      expect(trip.amenities).toEqual(AMENITIES);
    });
  });

  describe('daily', () => {
    it('generates one trip per day for the full horizon when unbounded', () => {
      const schedule = makeSchedule({ frequency: 'daily', validFrom: todayIso(), validUntil: null });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(TRIP_GENERATION_HORIZON_DAYS);
      expect(trips[0].date).toBe(todayIso());
      expect(trips[trips.length - 1].date).toBe(addDaysIso(todayIso(), TRIP_GENERATION_HORIZON_DAYS - 1));
    });

    it('stops at validUntil when it falls inside the horizon', () => {
      const until = addDaysIso(todayIso(), 3);
      const schedule = makeSchedule({ frequency: 'daily', validFrom: todayIso(), validUntil: until });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(4); // today, +1, +2, +3
      expect(trips[trips.length - 1].date).toBe(until);
    });

    it('starts from today when validFrom is in the past', () => {
      const pastStart = addDaysIso(todayIso(), -10);
      const schedule = makeSchedule({ frequency: 'daily', validFrom: pastStart, validUntil: null });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips[0].date).toBe(todayIso());
    });

    it('generates no trips when validFrom is beyond the horizon', () => {
      const farFuture = addDaysIso(todayIso(), TRIP_GENERATION_HORIZON_DAYS + 10);
      const schedule = makeSchedule({ frequency: 'daily', validFrom: farFuture, validUntil: null });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(0);
    });
  });

  describe('weekly', () => {
    it('only generates trips on the chosen operating days', () => {
      // REAL_NOW is a Tuesday (dow=2). Pick Mon(1) and Fri(5).
      const schedule = makeSchedule({
        frequency: 'weekly',
        operatingDays: [1, 5],
        validFrom: todayIso(),
        validUntil: null,
      });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips.length).toBeGreaterThan(0);
      for (const t of trips) {
        expect([1, 5]).toContain(dayOfWeek(t.date));
      }
    });

    it('generates no trips when operatingDays is empty', () => {
      const schedule = makeSchedule({ frequency: 'weekly', operatingDays: [], validFrom: todayIso(), validUntil: null });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(0);
    });

    it('respects validUntil for weekly schedules too', () => {
      const until = addDaysIso(todayIso(), 6); // exactly one week window
      const schedule = makeSchedule({
        frequency: 'weekly',
        operatingDays: [0, 1, 2, 3, 4, 5, 6], // every day, so this reduces to the daily case
        validFrom: todayIso(),
        validUntil: until,
      });
      const trips = generateTripsForSchedule(schedule, AMENITIES);
      expect(trips).toHaveLength(7);
    });
  });
});
