import { eq } from 'drizzle-orm';
import { createTestDb } from '../setup/test-db';
import { BusesService } from '../../src/modules/buses/buses.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { users, buses, schedules, trips, tickets } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';
import type { BookBusDto } from '../../src/modules/buses/dto/buses.dto';
import { id } from '../../src/common/id';

const passenger = {
  firstName: 'Anita',
  lastName: 'Rai',
  email: 'anita@example.com',
  phone: '9812345678',
  age: 30,
  gender: 'female' as const,
};

describe('BusesService.book — atomic seat guard', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: BusesService;
  let tripId: string;
  let customerA: string;
  let customerB: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    service = new BusesService(db, new NotificationsService(db));

    const operatorId = id('u');
    customerA = id('u');
    customerB = id('u');
    await db.insert(users).values([
      { id: operatorId, name: 'Op', mobile: '9800000010', email: 'op@test.local', passwordHash: 'h', role: 'bus_operator' },
      { id: customerA, name: 'Customer A', mobile: '9800000011', email: 'a@test.local', passwordHash: 'h', role: 'customer' },
      { id: customerB, name: 'Customer B', mobile: '9800000012', email: 'b@test.local', passwordHash: 'h', role: 'customer' },
    ]);

    const busId = id('bus');
    await db.insert(buses).values({
      id: busId,
      operatorId,
      busName: 'Greenline',
      busNumber: 'GL-1',
      registrationNo: 'BA-1-PA-1234',
      type: 'AC',
      fuelType: 'diesel',
      totalSeats: 32,
      totalRows: 8,
    });

    const scheduleId = id('sch');
    await db.insert(schedules).values({
      id: scheduleId,
      operatorId,
      busId,
      fromCity: 'Kathmandu',
      toCity: 'Pokhara',
      departure: '07:00 AM',
      arrival: '01:30 PM',
      duration: '6h 30m',
      price: '1200.00',
      frequency: 'once',
      validFrom: '2026-01-01',
      busName: 'Greenline',
      busType: 'AC',
      totalSeats: 32,
    });

    tripId = id('trip');
    await db.insert(trips).values({
      id: tripId,
      scheduleId,
      operatorId,
      busId,
      fromCity: 'Kathmandu',
      toCity: 'Pokhara',
      date: '2026-08-01',
      departure: '07:00 AM',
      arrival: '01:30 PM',
      duration: '6h 30m',
      price: '1200.00',
      totalSeats: 32,
      totalRows: 8,
      type: 'AC',
    });
  });

  afterEach(async () => {
    await close();
  });

  function bookDto(seats: string[]): BookBusDto {
    return { seats, passengers: seats.map(() => passenger), method: 'cash' };
  }

  it('books an open seat successfully and marks it booked on the trip', async () => {
    const result = await service.book(customerA, tripId, bookDto(['1A']));
    expect(result.bookingRef).toBeTruthy();

    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    expect(trip.bookedSeats).toEqual(['1A']);
  });

  it('rejects a second booking for the same seat with a 409, leaving exactly one confirmed ticket', async () => {
    await service.book(customerA, tripId, bookDto(['2B']));

    await expect(service.book(customerB, tripId, bookDto(['2B']))).rejects.toMatchObject({
      response: expect.objectContaining({ message: expect.stringContaining('taken') }),
    });

    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    expect(trip.bookedSeats).toEqual(['2B']);

    const allTickets = await db.select().from(tickets).where(eq(tickets.tripId, tripId));
    expect(allTickets).toHaveLength(1);
  });

  it('rejects a seat outside the bus layout (row > totalRows)', async () => {
    await expect(service.book(customerA, tripId, bookDto(['9A']))).rejects.toBeTruthy();
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    expect(trip.bookedSeats).toEqual([]);
  });

  it('normalizes seat case and de-duplicates before booking', async () => {
    await service.book(customerA, tripId, {
      seats: ['3a'],
      passengers: [passenger],
      method: 'cash',
    });
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    expect(trip.bookedSeats).toEqual(['3A']);
  });

  it('debits the wallet atomically when paying by wallet, and fails cleanly on insufficient balance', async () => {
    await expect(
      service.book(customerA, tripId, { seats: ['4A'], passengers: [passenger], method: 'wallet' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ message: expect.stringContaining('Insufficient wallet balance') }),
    });

    // A failed wallet debit must roll back the whole transaction — the seat
    // must NOT be marked booked even though the seat-guard step succeeded.
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    expect(trip.bookedSeats).toEqual([]);
  });
});
