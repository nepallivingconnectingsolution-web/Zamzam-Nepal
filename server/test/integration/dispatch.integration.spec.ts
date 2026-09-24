import { and, eq } from 'drizzle-orm';
import { createTestDb } from '../setup/test-db';
import { DispatchService } from '../../src/modules/driver-dispatch/dispatch.service';
import { EligibilityService } from '../../src/modules/driver-dispatch/eligibility.service';
import { DriverEventsBus, type DriverEvent } from '../../src/modules/driver-dispatch/driver-events.bus';
import { MemoryLocationStore } from '../../src/modules/driver-dispatch/location.store';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { RidesService } from '../../src/modules/rides/rides.controller';
import {
  driverApplications,
  driverLocationLog,
  driverStatus,
  rideOffers,
  rides,
  userNotifications,
  users,
  vehicles,
} from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

jest.setTimeout(60000);

// Pickup at Ratna Park; drivers are placed at increasing distance east of it.
const PICKUP = { lat: 27.7059, lng: 85.3145 };
const at = (km: number) => ({ lat: PICKUP.lat, lng: PICKUP.lng + km / 98.5 }); // ~98.5 km per degree of longitude here

let seq = 0;
const config = (over: Record<string, string> = {}) => ({ get: (k: string) => over[k] }) as any;

describe('Dispatch: offers and atomic assignment', () => {
  let db: Database;
  let close: () => Promise<void>;
  let store: MemoryLocationStore;
  let bus: DriverEventsBus;
  let eligibility: EligibilityService;
  let dispatch: DispatchService;
  let rideService: RidesService;
  let events: Record<string, DriverEvent[]>;

  async function build(cfg: Record<string, string> = {}) {
    ({ db, close } = await createTestDb());
    store = new MemoryLocationStore();
    bus = new DriverEventsBus();
    eligibility = new EligibilityService(db, store);
    dispatch = new DispatchService(db, eligibility, store, bus, new NotificationsService(db), config(cfg));
    rideService = new RidesService(db, dispatch, store, eligibility);
    events = {};
  }
  const listen = (id: string) => {
    events[id] = [];
    bus.stream(id).subscribe((e) => events[id].push(e));
  };

  /** An approved, online driver placed `km` east of the pickup. */
  async function driver(
    id: string,
    km: number,
    o: { category?: 'bike' | 'car'; online?: boolean; suspended?: boolean; maxWeightKg?: number; located?: boolean } = {},
  ) {
    seq += 1;
    await db.insert(users).values({
      id, name: id, email: `${id}@t.l`, mobile: `98${String(20000000 + seq).slice(-8)}`, passwordHash: 'x', role: 'driver',
      kycStatus: o.suspended ? 'SUSPENDED' : 'APPROVED',
    });
    await db.insert(driverApplications).values({
      id: `app_${id}`, userId: id, status: o.suspended ? 'SUSPENDED' : 'APPROVED', isLegacy: true,
    });
    const category = o.category ?? 'bike';
    await db.insert(vehicles).values({
      id: `veh_${id}`, driverId: id, category, makeModel: 'x', plateNumber: `BA ${seq} PA ${1000 + seq}`,
      plateNormalized: `BA${seq}PA${1000 + seq}`, maxWeightKg: o.maxWeightKg ?? 20, verificationStatus: 'APPROVED',
    });
    await db.insert(driverStatus).values({ userId: id, online: o.online ?? true, activeVehicleId: `veh_${id}` });
    if (o.located !== false) await store.update(id, at(km));
    listen(id);
  }

  async function customer(id: string) {
    seq += 1;
    await db.insert(users).values({
      id, name: id, email: `${id}@t.l`, mobile: `97${String(30000000 + seq).slice(-8)}`, passwordHash: 'x', role: 'customer',
    });
  }

  async function ride(id: string, customerId: string, over: Partial<typeof rides.$inferInsert> = {}) {
    await db.insert(rides).values({
      id, customerId, service: 'bike', fromLabel: 'Ratna Park', toLabel: 'Thamel', fare: '150', distanceKm: '2.50',
      pickupLat: String(PICKUP.lat), pickupLng: String(PICKUP.lng), dropLat: '27.715', dropLng: '85.31', status: 'REQUESTED',
      ...over,
    });
  }

  const offersOf = (rideId: string) => db.select().from(rideOffers).where(eq(rideOffers.rideId, rideId));
  const offeredTo = async (rideId: string) => (await offersOf(rideId)).map((o) => o.driverId).sort();

  afterEach(async () => {
    await close();
  });

  describe('choosing who gets an offer', () => {
    beforeEach(() => build());

    it('offers a bike ride to the nearest eligible bike drivers only', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('b1', 0.5);
      await driver('b2', 1.0);
      await driver('b3', 1.5);
      await driver('b4', 2.0); // beyond the batch of 3
      await driver('car1', 0.1, { category: 'car' }); // wrong vehicle type
      await driver('sus1', 0.05, { suspended: true }); // nearest, but suspended
      await driver('off1', 0.06, { online: false }); // nearest, but offline
      await driver('far1', 30); // outside the radius
      await driver('nogps', 0.2, { located: false }); // online but never sent a location

      expect(await dispatch.start('r1')).toEqual({ offered: 3 });
      expect(await offeredTo('r1')).toEqual(['b1', 'b2', 'b3']);
    });

    it('offers a taxi ride only to car drivers', async () => {
      await customer('c1');
      await ride('r1', 'c1', { service: 'taxi' });
      await driver('b1', 0.3);
      await driver('car1', 0.9, { category: 'car' });
      await dispatch.start('r1');
      expect(await offeredTo('r1')).toEqual(['car1']);
    });

    it('gives each offer the distance, ETA and a short expiry', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('b1', 1.0);
      const before = Date.now();
      await dispatch.start('r1');
      const [o] = await offersOf('r1');
      expect(o.status).toBe('PENDING');
      expect(o.pickupDistanceM).toBeGreaterThan(900);
      expect(o.pickupDistanceM).toBeLessThan(1100);
      expect(o.etaMin).toBeGreaterThanOrEqual(1);
      expect(o.round).toBe(1);
      const ttl = o.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(13_000);
      expect(ttl).toBeLessThan(17_000);
    });

    it('pushes the offer to the driver with the details they need to decide', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('b1', 1.0);
      await dispatch.start('r1');
      expect(events.b1).toHaveLength(1);
      expect(events.b1[0].type).toBe('offer');
      expect(events.b1[0].data).toMatchObject({
        rideId: 'r1', service: 'bike', fare: 150, distanceKm: 2.5,
        pickup: { label: 'Ratna Park' }, destination: { label: 'Thamel' },
      });
      const notes = await db.select().from(userNotifications).where(eq(userNotifications.userId, 'b1'));
      expect(notes.some((n) => n.type === 'ride_offer')).toBe(true);
    });

    it('does not offer a second ride to a driver who is still deciding on the first', async () => {
      await customer('c1');
      await customer('c2');
      await ride('r1', 'c1');
      await ride('r2', 'c2');
      await driver('b1', 0.5);
      await dispatch.start('r1');
      await dispatch.start('r2');
      expect(await offeredTo('r1')).toEqual(['b1']);
      expect(await offeredTo('r2')).toEqual([]);
    });

    it('does nothing for a ride with no coordinates or one that is no longer open', async () => {
      await customer('c1');
      await ride('r1', 'c1', { pickupLat: null, pickupLng: null });
      await ride('r2', 'c1', { status: 'CANCELLED' });
      await driver('b1', 0.5);
      expect(await dispatch.start('r1')).toEqual({ offered: 0 });
      expect(await dispatch.start('r2')).toEqual({ offered: 0 });
      expect(await dispatch.start('nope')).toEqual({ offered: 0 });
    });

    it('does not offer a heavy parcel to a vehicle that cannot carry it', async () => {
      await customer('c1');
      await ride('r1', 'c1', { service: 'parcel', parcelWeightKg: 50 });
      await driver('small', 0.4, { maxWeightKg: 20 });
      await driver('big', 0.8, { category: 'car', maxWeightKg: 200 });
      await dispatch.start('r1');
      expect(await offeredTo('r1')).toEqual(['big']);
    });

    it('never offers the same ride twice to the same driver', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('b1', 0.5);
      await dispatch.start('r1');
      await db.update(rideOffers).set({ status: 'DECLINED' });
      await dispatch.start('r1');
      expect(await offersOf('r1')).toHaveLength(1);
    });
  });

  describe('accepting', () => {
    beforeEach(() => build());

    async function twoOffers() {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      await driver('b', 1.0);
      await dispatch.start('r1');
    }

    it('assigns the ride to the accepting driver with their vehicle, and withdraws everyone else', async () => {
      await twoOffers();
      const [offerA] = await db.select().from(rideOffers).where(and(eq(rideOffers.rideId, 'r1'), eq(rideOffers.driverId, 'a')));
      await dispatch.acceptOffer('a', offerA.id);

      const [r] = await db.select().from(rides).where(eq(rides.id, 'r1'));
      expect(r).toMatchObject({ status: 'ACCEPTED', driverId: 'a', vehicleId: 'veh_a' });
      const byDriver = Object.fromEntries((await offersOf('r1')).map((o) => [o.driverId, o.status]));
      expect(byDriver).toEqual({ a: 'ACCEPTED', b: 'CANCELLED' });
      expect(events.b.map((e) => e.type)).toEqual(['offer', 'offer_cancelled']);
      expect((await db.select().from(driverLocationLog).where(eq(driverLocationLog.driverId, 'a'))).map((l) => l.event)).toEqual(['ACCEPTED']);
    });

    it('two drivers accepting the same ride at the same moment: exactly one wins', async () => {
      await twoOffers();
      const results = await Promise.allSettled([dispatch.acceptRide('a', 'r1'), dispatch.acceptRide('b', 'r1')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(lost.reason).toMatchObject({ status: 409, response: { code: 'ALREADY_TAKEN' } });
      const assigned = await db.select().from(rides).where(eq(rides.id, 'r1'));
      expect(assigned[0].driverId === 'a' || assigned[0].driverId === 'b').toBe(true);
      expect(await db.select().from(rides).where(eq(rides.driverId, assigned[0].driverId!))).toHaveLength(1);
    });

    it('one driver accepting two rides at the same moment: exactly one, never both', async () => {
      await customer('c1');
      await customer('c2');
      await ride('r1', 'c1');
      await ride('r2', 'c2');
      await driver('a', 0.5);
      const results = await Promise.allSettled([dispatch.acceptRide('a', 'r1'), dispatch.acceptRide('a', 'r2')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(lost.reason).toMatchObject({ status: 409, response: { code: 'DRIVER_BUSY' } });
      expect(await db.select().from(rides).where(and(eq(rides.driverId, 'a'), eq(rides.status, 'ACCEPTED')))).toHaveLength(1);
    });

    it('the database itself refuses a second active ride for one driver (backstop)', async () => {
      await customer('c1');
      await customer('c2');
      await driver('a', 0.5);
      await ride('r1', 'c1', { driverId: 'a', status: 'ACCEPTED' });
      await expect(ride('r2', 'c2', { driverId: 'a', status: 'ONGOING' })).rejects.toThrow();
    });

    it('a driver mid-trip cannot accept another ride', async () => {
      await customer('c1');
      await customer('c2');
      await driver('a', 0.5);
      await ride('r1', 'c1', { driverId: 'a', status: 'ONGOING' });
      await ride('r2', 'c2');
      await expect(dispatch.acceptRide('a', 'r2')).rejects.toMatchObject({ status: 409, response: { code: 'DRIVER_BUSY' } });
    });

    it('a suspended or offline driver cannot accept, even with an offer in hand', async () => {
      await twoOffers();
      const [offerA] = await db.select().from(rideOffers).where(eq(rideOffers.driverId, 'a'));
      await db.update(driverApplications).set({ status: 'SUSPENDED' }).where(eq(driverApplications.userId, 'a'));
      await expect(dispatch.acceptOffer('a', offerA.id)).rejects.toMatchObject({ status: 403, response: { code: 'DRIVER_SUSPENDED' } });
      await db.update(driverStatus).set({ online: false }).where(eq(driverStatus.userId, 'b'));
      const [offerB] = await db.select().from(rideOffers).where(eq(rideOffers.driverId, 'b'));
      await expect(dispatch.acceptOffer('b', offerB.id)).rejects.toMatchObject({ status: 403, response: { code: 'DRIVER_OFFLINE' } });
      expect((await db.select().from(rides).where(eq(rides.id, 'r1')))[0].status).toBe('REQUESTED');
    });

    it('an expired offer cannot be accepted, and someone else’s offer is invisible', async () => {
      await twoOffers();
      const [offerA] = await db.select().from(rideOffers).where(eq(rideOffers.driverId, 'a'));
      await expect(dispatch.acceptOffer('b', offerA.id)).rejects.toMatchObject({ status: 404 });
      await db.update(rideOffers).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(rideOffers.id, offerA.id));
      await expect(dispatch.acceptOffer('a', offerA.id)).rejects.toMatchObject({ status: 409, response: { code: 'OFFER_EXPIRED' } });
      expect((await db.select().from(rides).where(eq(rides.id, 'r1')))[0].status).toBe('REQUESTED');
    });

    it('cannot accept a ride the customer already cancelled', async () => {
      await customer('c1');
      await ride('r1', 'c1', { status: 'CANCELLED' });
      await driver('a', 0.5);
      await expect(dispatch.acceptRide('a', 'r1')).rejects.toMatchObject({ status: 409, response: { code: 'RIDE_CANCELLED' } });
    });

    it('will not assign a heavy parcel to a small vehicle', async () => {
      await customer('c1');
      await ride('r1', 'c1', { service: 'parcel', parcelWeightKg: 50 });
      await driver('small', 0.4, { maxWeightKg: 20 });
      await expect(dispatch.acceptRide('small', 'r1')).rejects.toMatchObject({ status: 400, response: { code: 'TOO_HEAVY' } });
    });

    it('the existing accept endpoint takes the same safe path (a driver who was never offered can still take an open ride)', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      const dto = await rideService.accept('a', 'r1');
      expect(dto).toMatchObject({ id: 'r1', status: 'ACCEPTED' });
      await customer('c2');
      await ride('r2', 'c2');
      await expect(rideService.accept('a', 'r2')).rejects.toMatchObject({ response: { code: 'DRIVER_BUSY' } });
    });
  });

  describe('declining, expiring and re-offering', () => {
    beforeEach(() => build({ OFFER_BATCH_SIZE: '1', OFFER_MAX_ROUNDS: '3', OFFER_TTL_SECONDS: '15' }));

    it('a decline passes the ride to the next nearest driver', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      await driver('b', 1.0);
      await dispatch.start('r1');
      expect(await offeredTo('r1')).toEqual(['a']);

      const [offer] = await offersOf('r1');
      await dispatch.decline('a', offer.id);
      expect(await offeredTo('r1')).toEqual(['a', 'b']);
      const byDriver = Object.fromEntries((await offersOf('r1')).map((o) => [o.driverId, [o.status, o.round]]));
      expect(byDriver).toEqual({ a: ['DECLINED', 1], b: ['PENDING', 2] });
    });

    it('declining an offer twice, or someone else’s, fails cleanly', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      await driver('b', 1.0);
      await dispatch.start('r1');
      const [offer] = await offersOf('r1');
      await expect(dispatch.decline('b', offer.id)).rejects.toMatchObject({ status: 409 });
      await dispatch.decline('a', offer.id);
      await expect(dispatch.decline('a', offer.id)).rejects.toMatchObject({ status: 409 });
    });

    it('the sweeper expires stale offers, tells the driver, and moves on to the next driver', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      await driver('b', 1.0);
      await dispatch.start('r1');
      await db.update(rideOffers).set({ expiresAt: new Date(Date.now() - 1000) });

      expect(await dispatch.expireStale()).toBe(1);
      const byDriver = Object.fromEntries((await offersOf('r1')).map((o) => [o.driverId, o.status]));
      expect(byDriver).toEqual({ a: 'EXPIRED', b: 'PENDING' });
      expect(events.a.map((e) => e.type)).toEqual(['offer', 'offer_cancelled']);
      expect(events.b.map((e) => e.type)).toEqual(['offer']);
    });

    it('stops after the maximum rounds and leaves the ride open for the driver-side list', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) await driver(id, 0.5 + i * 0.3);
      await dispatch.start('r1');
      for (let round = 0; round < 6; round++) {
        await db.update(rideOffers).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(rideOffers.status, 'PENDING'));
        await dispatch.expireStale();
      }
      expect(await offersOf('r1')).toHaveLength(3); // OFFER_MAX_ROUNDS
      expect((await db.select().from(rides).where(eq(rides.id, 'r1')))[0]).toMatchObject({ status: 'REQUESTED', driverId: null });
      // it is still visible to eligible drivers through the existing poll
      expect((await rideService.incoming('d')).map((r) => r.id)).toEqual(['r1']);
    });

    it('a request that found nobody nearby is offered later, when a driver comes online', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      expect(await dispatch.start('r1')).toEqual({ offered: 0 });
      expect(await dispatch.retryOpenRides()).toBe(0);

      await driver('late', 0.6);
      expect(await dispatch.retryOpenRides()).toBe(1);
      expect(await offeredTo('r1')).toEqual(['late']);
      // while an offer is waiting, the sweep leaves the ride alone
      expect(await dispatch.retryOpenRides()).toBe(0);
    });

    it('stops retrying a request that has been open for too long', async () => {
      await customer('c1');
      await ride('r1', 'c1', { createdAt: new Date(Date.now() - 30 * 60_000) });
      await driver('late', 0.6);
      expect(await dispatch.retryOpenRides()).toBe(0);
    });

    it('withdraws offers whose ride has been accepted or cancelled by other means', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      await dispatch.start('r1');
      await db.update(rides).set({ status: 'CANCELLED' }).where(eq(rides.id, 'r1'));
      await dispatch.expireStale();
      expect((await offersOf('r1'))[0].status).toBe('CANCELLED');
      expect(events.a.map((e) => e.type)).toEqual(['offer', 'offer_cancelled']);
    });

    it('lists only the driver’s live offers', async () => {
      await customer('c1');
      await customer('c2');
      await ride('r1', 'c1');
      await ride('r2', 'c2');
      await driver('a', 0.5);
      await dispatch.start('r1');
      expect((await dispatch.pending('a')).map((o) => o.rideId)).toEqual(['r1']);
      await db.update(rideOffers).set({ expiresAt: new Date(Date.now() - 1000) });
      expect(await dispatch.pending('a')).toEqual([]);
      expect(await dispatch.pending('b')).toEqual([]);
    });
  });

  describe('customer side', () => {
    beforeEach(() => build());

    it('creating a ride dispatches it automatically', async () => {
      await customer('c1');
      await driver('a', 0.5);
      const dto = await rideService.create('c1', {
        service: 'bike', fromLabel: 'Ratna Park', toLabel: 'Thamel',
        pickupLat: PICKUP.lat, pickupLng: PICKUP.lng, dropLat: 27.715, dropLng: 85.31,
      } as any);
      for (let i = 0; i < 40 && (await offersOf(dto.id)).length === 0; i++) await new Promise((r) => setTimeout(r, 50));
      expect(await offeredTo(dto.id)).toEqual(['a']);
    });

    it('two passengers requesting at once never end up sharing one driver', async () => {
      await customer('c1');
      await customer('c2');
      await driver('a', 0.5);
      const dto = (id: string) => rideService.create(id, {
        service: 'bike', fromLabel: 'x', toLabel: 'y', pickupLat: PICKUP.lat, pickupLng: PICKUP.lng, dropLat: 27.715, dropLng: 85.31,
      } as any);
      const [r1, r2] = await Promise.all([dto('c1'), dto('c2')]);
      // one driver is offered the first ride; the second waits until they are free
      await new Promise((r) => setTimeout(r, 300));
      const results = await Promise.allSettled([dispatch.acceptRide('a', r1.id), dispatch.acceptRide('a', r2.id)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('cancelling withdraws the offers and tells an already-assigned driver', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      await dispatch.start('r1');
      await rideService.cancel('c1', 'r1', { reason: 'changed my mind' } as any);
      expect((await offersOf('r1'))[0].status).toBe('CANCELLED');
      expect(events.a.map((e) => e.type)).toEqual(['offer', 'offer_cancelled']);

      await customer('c2');
      await ride('r2', 'c2');
      await dispatch.acceptRide('a', 'r2');
      await rideService.cancel('c2', 'r2', {} as any);
      expect(events.a.map((e) => e.type)).toContain('ride_cancelled');
      const notes = await db.select().from(userNotifications).where(eq(userNotifications.userId, 'a'));
      expect(notes.some((n) => n.title === 'Ride cancelled')).toBe(true);
    });

    it('starting and completing a trip is logged with the driver’s position', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('a', 0.5);
      await dispatch.acceptRide('a', 'r1');
      await rideService.start('a', 'r1');
      await rideService.complete('a', 'r1');
      const log = (await db.select().from(driverLocationLog).where(eq(driverLocationLog.driverId, 'a'))).map((l) => l.event);
      expect(log).toEqual(['ACCEPTED', 'STARTED', 'COMPLETED']);
    });

    it('the driver-side ride list applies the same eligibility rules', async () => {
      await customer('c1');
      await ride('r1', 'c1');
      await driver('ok', 0.5);
      await driver('sus', 0.4, { suspended: true });
      await driver('car', 0.3, { category: 'car' });
      expect((await rideService.incoming('ok')).map((r) => r.id)).toEqual(['r1']);
      expect(await rideService.incoming('sus')).toEqual([]);
      expect(await rideService.incoming('car')).toEqual([]);
    });
  });
});
