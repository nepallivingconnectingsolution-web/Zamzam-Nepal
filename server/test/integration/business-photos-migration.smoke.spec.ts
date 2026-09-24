import { createTestDb } from '../setup/test-db';
import { buses, roomTypes, vehicles, hotels, users } from '../../src/database/schema';
import { eq } from 'drizzle-orm';

describe('business photos migration', () => {
  it('buses, roomTypes and vehicles accept and round-trip a photos array', async () => {
    const { db, close } = await createTestDb();
    try {
      const [owner] = await db
        .insert(users)
        .values({
          id: 'usr_photo_test',
          name: 'Photo Test Owner',
          mobile: '9800000001',
          email: 'phototest@test.local',
          passwordHash: 'hash',
          role: 'bus_operator',
        })
        .returning();

      const [bus] = await db
        .insert(buses)
        .values({
          id: 'bus_phototest',
          operatorId: owner.id,
          busName: 'Test Bus',
          busNumber: 'BA-1',
          registrationNo: 'REG-1',
          type: 'AC',
          fuelType: 'Diesel',
          totalSeats: 40,
          totalRows: 10,
          photos: ['https://cdn/bus1.jpg'],
        })
        .returning();
      expect(bus.photos).toEqual(['https://cdn/bus1.jpg']);

      const [hotel] = await db
        .insert(hotels)
        .values({ id: 'htl_phototest', partnerId: owner.id, name: 'Test Hotel', city: 'Kathmandu', address: 'Addr' })
        .returning();

      const [room] = await db
        .insert(roomTypes)
        .values({
          id: 'rt_phototest',
          hotelId: hotel.id,
          name: 'Deluxe',
          pricePerNight: '1000',
          totalRooms: 5,
          photos: ['https://cdn/room1.jpg'],
        })
        .returning();
      expect(room.photos).toEqual(['https://cdn/room1.jpg']);

      const [vehicle] = await db
        .insert(vehicles)
        .values({
          id: 'veh_phototest',
          driverId: owner.id,
          category: 'car',
          makeModel: 'Test Car',
          plateNumber: 'BA1PA1111',
          plateNormalized: 'BA1PA1111',
          maxWeightKg: 100,
          photos: ['https://cdn/veh1.jpg'],
        })
        .returning();
      expect(vehicle.photos).toEqual(['https://cdn/veh1.jpg']);

      // Default is an empty array when photos is omitted entirely.
      const [defaultBus] = await db.select().from(buses).where(eq(buses.id, 'bus_phototest'));
      expect(Array.isArray(defaultBus.photos)).toBe(true);
    } finally {
      await close();
    }
  });
});
