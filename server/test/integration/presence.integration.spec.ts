import { and, eq } from 'drizzle-orm';
import { AdminApplicationsService } from '../../src/modules/driver-onboarding/admin-applications.service';
import { EligibilityService } from '../../src/modules/driver-dispatch/eligibility.service';
import { PresenceService } from '../../src/modules/driver-dispatch/presence.service';
import { DriverEventsBus } from '../../src/modules/driver-dispatch/driver-events.bus';
import { MemoryLocationStore } from '../../src/modules/driver-dispatch/location.store';
import {
  applicationDocuments,
  driverApplications,
  driverLocationLog,
  driverProfiles,
  driverStatus,
  rideOffers,
  rides,
  users,
  vehicles,
} from '../../src/database/schema';
import {
  approveEverything,
  completeDraft,
  createCustomerUser,
  createDriverUser,
  setupOnboarding,
  submittedApplication,
  car,
  file,
  type Onboarding,
} from '../setup/onboarding-fixtures';

const KTM = { lat: 27.7059, lng: 85.3145 };

describe('Presence + eligibility (go online / offline)', () => {
  let o: Onboarding;
  let store: MemoryLocationStore;
  let bus: DriverEventsBus;
  let elig: EligibilityService;
  let presence: PresenceService;
  let admin: AdminApplicationsService;

  beforeEach(async () => {
    o = await setupOnboarding();
    store = new MemoryLocationStore();
    bus = new DriverEventsBus();
    elig = new EligibilityService(o.db, store);
    presence = new PresenceService(o.db, elig, store, bus);
    admin = new AdminApplicationsService(o.db, o.notifications, o.requirements, presence);
  });
  afterEach(async () => {
    await o.close();
  });

  async function approvedDriver(userId = 'u1', vehicle: typeof car | undefined = undefined) {
    const appId = await submittedApplication(o, userId, vehicle);
    await approveEverything(admin, o.db, appId);
    return appId;
  }
  const onlineOf = async (userId: string) =>
    (await o.db.select().from(driverStatus).where(eq(driverStatus.userId, userId)))[0]?.online ?? false;

  it('refuses a driver whose application is not approved, with the reason', async () => {
    await createDriverUser(o.db, 'u1');
    await o.apps.getOrCreate('u1');
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({
      status: 403,
      response: { code: 'APPLICATION_NOT_APPROVED' },
    });
    expect(await onlineOf('u1')).toBe(false);
  });

  it('refuses a submitted-but-unreviewed driver too', async () => {
    await submittedApplication(o, 'u1');
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({ response: { code: 'APPLICATION_NOT_APPROVED' } });
  });

  it('puts an approved driver online, records their position, and logs it', async () => {
    await approvedDriver();
    await expect(presence.goOnline('u1', { ...KTM, accuracy: 9 })).resolves.toEqual({ online: true });
    expect(await onlineOf('u1')).toBe(true);
    expect((await store.get('u1'))!.lat).toBe(KTM.lat);
    const log = await o.db.select().from(driverLocationLog).where(eq(driverLocationLog.driverId, 'u1'));
    expect(log.map((l) => l.event)).toEqual(['ONLINE']);
  });

  it('needs a location on the new endpoint, but the legacy toggle may go online and wait for the first ping', async () => {
    await approvedDriver();
    await expect(presence.goOnline('u1')).rejects.toMatchObject({ status: 400, response: { code: 'LOCATION_REQUIRED' } });
    await expect(presence.goOnline('u1', undefined, { allowNoLocation: true })).resolves.toEqual({ online: true });
    // online but invisible to matching until a fresh location arrives
    const check = await elig.check('u1', { requireOnline: true, requireLocation: true });
    expect(check.reasons.map((r) => r.code)).toEqual(['LOCATION_STALE']);
  });

  it('uses the last known location for the legacy toggle when there is one', async () => {
    await approvedDriver();
    await store.update('u1', KTM);
    await expect(presence.goOnline('u1', undefined, { allowNoLocation: true })).resolves.toEqual({ online: true });
    expect((await elig.check('u1', { requireOnline: true, requireLocation: true })).eligible).toBe(true);
  });

  it('blocks going online when the licence expired', async () => {
    await approvedDriver();
    await o.db.update(driverProfiles).set({ licenceExpiryDate: '2020-01-01' }).where(eq(driverProfiles.userId, 'u1'));
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({ response: { code: 'LICENCE_EXPIRED' } });
  });

  it('blocks going online when a required document expired', async () => {
    const appId = await approvedDriver();
    await o.db.update(applicationDocuments).set({ expiryDate: '2020-01-01' })
      .where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'bluebook')));
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({ response: { code: 'DOCUMENT_EXPIRED' } });
  });

  it('does not count an expired OPTIONAL document against the driver', async () => {
    // identity_back is optional in the seeded configuration
    await createDriverUser(o.db, 'u1');
    await completeDraft(o.apps, o.db, 'u1');
    await o.apps.uploadFile('u1', { docType: 'identity_back', expiryDate: '2040-01-01', file: file() });
    const appId = (await o.apps.submit('u1')).application.id;
    await approveEverything(admin, o.db, appId);

    await o.db.update(applicationDocuments).set({ expiryDate: '2020-01-01' })
      .where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'identity_back')));
    // the insurance is optional now too
    await o.db.update(applicationDocuments).set({ expiryDate: '2020-01-01' })
      .where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'insurance')));
    await expect(presence.goOnline('u1', KTM)).resolves.toEqual({ online: true });

    // ...but the same date on a REQUIRED document does block
    await o.db.update(applicationDocuments).set({ expiryDate: '2020-01-01' })
      .where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'bluebook')));
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({ response: { code: 'DOCUMENT_EXPIRED' } });
  });

  it('blocks a driver who is already on a trip', async () => {
    await approvedDriver();
    await createCustomerUser(o.db, 'c1');
    await o.db.insert(rides).values({ id: 'r1', customerId: 'c1', driverId: 'u1', service: 'bike', fromLabel: 'a', toLabel: 'b', fare: '100', status: 'ACCEPTED' });
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({ response: { code: 'ACTIVE_RIDE' } });
  });

  it('suspension makes go-online fail, and forces an online driver offline immediately', async () => {
    const appId = await approvedDriver();
    await presence.goOnline('u1', KTM);
    const events: unknown[] = [];
    bus.stream('u1').subscribe((e) => events.push(e));

    await admin.suspend('sa_1', appId, { scope: 'DRIVER', reason: 'Multiple complaints' });

    expect(await onlineOf('u1')).toBe(false);
    expect(await store.get('u1')).toBeNull();
    expect(events).toEqual([{ type: 'status', data: { online: false, reason: 'Multiple complaints' } }]);
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({ response: { code: 'DRIVER_SUSPENDED' } });

    await admin.reactivate('sa_1', appId, { scope: 'DRIVER' });
    await expect(presence.goOnline('u1', KTM)).resolves.toEqual({ online: true });
  });

  it('a suspended vehicle keeps the driver off the road, a different code from a suspended driver', async () => {
    const appId = await approvedDriver();
    await admin.suspend('sa_1', appId, { scope: 'VEHICLE', reason: 'Failed inspection' });
    await expect(presence.goOnline('u1', KTM)).rejects.toMatchObject({ response: { code: 'NO_ACTIVE_VEHICLE' } });
  });

  it('going offline clears the position and cancels waiting offers', async () => {
    await approvedDriver();
    await presence.goOnline('u1', KTM);
    await createCustomerUser(o.db, 'c1');
    await o.db.insert(rides).values({ id: 'r1', customerId: 'c1', service: 'bike', fromLabel: 'a', toLabel: 'b', fare: '100', status: 'REQUESTED' });
    await o.db.insert(rideOffers).values({ id: 'of1', rideId: 'r1', driverId: 'u1', pickupDistanceM: 300, etaMin: 1, expiresAt: new Date(Date.now() + 60000) });

    await expect(presence.goOffline('u1')).resolves.toEqual({ online: false });
    expect(await onlineOf('u1')).toBe(false);
    expect(await store.get('u1')).toBeNull();
    expect((await o.db.select().from(rideOffers).where(eq(rideOffers.id, 'of1')))[0].status).toBe('CANCELLED');
    expect((await o.db.select().from(driverLocationLog).where(eq(driverLocationLog.driverId, 'u1'))).map((l) => l.event)).toEqual(['ONLINE', 'OFFLINE']);
  });

  it('accepts location pings only while online and stores the extra fields', async () => {
    await approvedDriver();
    await expect(presence.ping('u1', KTM)).rejects.toMatchObject({ status: 400, response: { code: 'DRIVER_OFFLINE' } });
    await presence.goOnline('u1', KTM);
    await presence.ping('u1', { lat: 27.71, lng: 85.32, accuracy: 6, heading: 180, speed: 7.5 });
    expect(await store.get('u1')).toMatchObject({ lat: 27.71, lng: 85.32, accuracy: 6, heading: 180, speed: 7.5 });
  });

  it('does not write every ping to Postgres', async () => {
    await approvedDriver();
    await presence.goOnline('u1', KTM);
    const before = (await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1')))[0];
    await presence.ping('u1', { lat: 27.72, lng: 85.33 });
    await presence.ping('u1', { lat: 27.73, lng: 85.34 });
    const after = (await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1')))[0];
    expect(after.lat).toBe(before.lat);
    expect(after.lastLocationAt!.getTime()).toBe(before.lastLocationAt!.getTime());
    expect((await store.get('u1'))!.lat).toBe(27.73);
  });

  it('does write a position to Postgres once it is older than a minute (legacy readers stay fresh)', async () => {
    await approvedDriver();
    await presence.goOnline('u1', KTM);
    await o.db.update(driverStatus).set({ lastLocationAt: new Date(Date.now() - 120_000) }).where(eq(driverStatus.userId, 'u1'));
    await presence.ping('u1', { lat: 27.74, lng: 85.35 });
    const row = (await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1')))[0];
    expect(Number(row.lat)).toBeCloseTo(27.74, 4);
  });

  it('a car driver is only eligible for taxi, a bike driver only for bike', async () => {
    await approvedDriver('u1'); // bike
    await approvedDriver('u2', car);
    for (const id of ['u1', 'u2']) await presence.goOnline(id, KTM);
    const ok = (id: string, s: 'taxi' | 'bike') => elig.check(id, { serviceType: s, requireOnline: true, requireLocation: true });
    expect((await ok('u1', 'bike')).eligible).toBe(true);
    expect((await ok('u1', 'taxi')).reasons[0].code).toBe('VEHICLE_TYPE_MISMATCH');
    expect((await ok('u2', 'taxi')).eligible).toBe(true);
    expect((await ok('u2', 'bike')).reasons[0].code).toBe('VEHICLE_TYPE_MISMATCH');
  });

  it('lets a driver approved before onboarding existed carry on (grandfathered), until suspended', async () => {
    await createDriverUser(o.db, 'old1');
    await o.db.update(users).set({ kycStatus: 'APPROVED' }).where(eq(users.id, 'old1'));
    await o.db.insert(vehicles).values({
      id: 'veh_old', driverId: 'old1', category: 'bike', makeModel: 'Honda', plateNumber: 'BA 9 PA 9999',
      plateNormalized: 'BA9PA9999', maxWeightKg: 20, verificationStatus: 'APPROVED',
    });
    await o.db.insert(driverApplications).values({ id: 'app_old', userId: 'old1', status: 'APPROVED', isLegacy: true, vehicleId: 'veh_old' });
    await o.db.insert(driverStatus).values({ userId: 'old1', activeVehicleId: 'veh_old' });

    await expect(presence.goOnline('old1', KTM)).resolves.toEqual({ online: true });
    await o.db.update(users).set({ kycStatus: 'SUSPENDED' }).where(eq(users.id, 'old1'));
    expect((await elig.check('old1', { requireOnline: true, requireLocation: true })).reasons[0].code).toBe('DRIVER_SUSPENDED');
  });

  it('says NOT_DRIVER for a customer and for someone who does not exist', async () => {
    await createCustomerUser(o.db, 'c1');
    expect((await elig.check('c1', { requireOnline: false, requireLocation: false })).reasons[0].code).toBe('NOT_DRIVER');
    expect((await elig.check('ghost', { requireOnline: false, requireLocation: false })).reasons[0].code).toBe('NOT_DRIVER');
  });
});
