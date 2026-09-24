import { createTestDb } from '../setup/test-db';
import { eq } from 'drizzle-orm';
import { documentRequirements, driverApplications, rides, users, vehicles } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

describe('driver onboarding schema', () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => {
    await close();
  });

  const seedUser = (idv: string, email: string, mobile: string, role: 'driver' | 'customer' = 'driver') =>
    db.insert(users).values({ id: idv, name: idv, email, mobile, passwordHash: 'x', role });

  it('seeds document requirements for bike and car', async () => {
    const rows = await db.select().from(documentRequirements);
    const keys = rows.map((r) => `${r.vehicleType}|${r.subject}|${r.docType}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        '|DRIVER|licence_front',
        '|DRIVER|licence_back',
        '|DRIVER|identity_front',
        'bike|VEHICLE|bluebook',
        'bike|VEHICLE|insurance',
        'bike|VEHICLE|photo:plate',
        'car|VEHICLE|bluebook',
        'car|VEHICLE|insurance',
        'car|VEHICLE|road_tax',
        'car|VEHICLE|photo:interior',
      ]),
    );
    expect(keys.some((k) => k === 'bike|VEHICLE|road_tax')).toBe(false);
  });

  it('makes vehicle insurance and vehicle photos optional, and keeps the rest required', async () => {
    const rows = await db.select().from(documentRequirements);
    const optional = rows.filter((r) => !r.isRequired).map((r) => `${r.vehicleType}|${r.docType}`).sort();
    expect(optional).toEqual(
      [
        '|identity_back',
        'bike|insurance', 'car|insurance',
        'bike|photo:front', 'bike|photo:side', 'bike|photo:rear', 'bike|photo:plate',
        'car|photo:front', 'car|photo:rear', 'car|photo:left', 'car|photo:right', 'car|photo:interior', 'car|photo:plate',
      ].sort(),
    );
    const required = rows.filter((r) => r.isRequired).map((r) => `${r.vehicleType}|${r.docType}`).sort();
    expect(required).toEqual(
      ['|identity_front', '|licence_back', '|licence_front', 'bike|bluebook', 'car|bluebook', 'car|road_tax'].sort(),
    );
  });

  it('rejects two ACTIVE vehicles with the same normalized plate but allows reuse after soft delete', async () => {
    await seedUser('u1', 'a@t.l', '9800000001');
    await seedUser('u2', 'b@t.l', '9800000002');
    const base = { category: 'bike' as const, makeModel: 'x', maxWeightKg: 20, plateNormalized: 'BA1KHA1234' };
    await db.insert(vehicles).values({ id: 'v1', driverId: 'u1', plateNumber: 'BA 1 KHA 1234', ...base });
    await expect(
      db.insert(vehicles).values({ id: 'v2', driverId: 'u2', plateNumber: 'ba-1-kha-1234', ...base }),
    ).rejects.toThrow();
    await db.update(vehicles).set({ isActive: false }).where(eq(vehicles.id, 'v1'));
    await expect(
      db.insert(vehicles).values({ id: 'v3', driverId: 'u2', plateNumber: 'BA1KHA1234', ...base }),
    ).resolves.toBeDefined();
  });

  it('allows only one application per user', async () => {
    await seedUser('u1', 'a@t.l', '9800000001');
    await db.insert(driverApplications).values({ id: 'a1', userId: 'u1' });
    await expect(db.insert(driverApplications).values({ id: 'a2', userId: 'u1' })).rejects.toThrow();
  });

  it('lets a driver hold only one active ride at the database level', async () => {
    await seedUser('d1', 'd@t.l', '9800000003');
    await seedUser('c1', 'c1@t.l', '9800000004', 'customer');
    await seedUser('c2', 'c2@t.l', '9800000005', 'customer');
    const ride = (idv: string, customerId: string, status: 'REQUESTED' | 'ACCEPTED' | 'ONGOING' | 'COMPLETED', driverId: string | null) =>
      db.insert(rides).values({
        id: idv, customerId, driverId, service: 'bike', fromLabel: 'a', toLabel: 'b', fare: '100', status,
      });

    await ride('r1', 'c1', 'ACCEPTED', 'd1');
    await expect(ride('r2', 'c2', 'ONGOING', 'd1')).rejects.toThrow();
    // finished rides and unassigned requests never collide
    await ride('r3', 'c2', 'COMPLETED', 'd1');
    await ride('r4', 'c2', 'REQUESTED', null);
    await ride('r5', 'c1', 'REQUESTED', null);
  });
});
