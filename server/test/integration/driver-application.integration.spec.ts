import { eq } from 'drizzle-orm';
import { createTestDb } from '../setup/test-db';
import { ApplicationService } from '../../src/modules/driver-onboarding/application.service';
import { RequirementsService } from '../../src/modules/driver-onboarding/requirements.service';
import { StorageBackend, StorageService } from '../../src/modules/driver-onboarding/files/storage.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import {
  applicationDocuments,
  driverApplications,
  driverProfiles,
  userNotifications,
  users,
  vehicles,
} from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

class MemoryBackend extends StorageBackend {
  m = new Map<string, Buffer>();
  async put(k: string, d: Buffer) {
    this.m.set(k, d);
  }
  async read(k: string) {
    return this.m.get(k)!;
  }
  async remove(k: string) {
    this.m.delete(k);
  }
}

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(100)]);
const file = (name = 'a.jpg') =>
  ({ buffer: jpeg, mimetype: 'image/jpeg', originalname: name, size: jpeg.length }) as Express.Multer.File;
const pdfFile = () =>
  ({ buffer: pdf, mimetype: 'application/pdf', originalname: 'a.pdf', size: pdf.length }) as Express.Multer.File;

const personal = {
  legalName: 'Ram Thapa', dateOfBirth: '1995-02-01', gender: 'male', address: 'Baneshwor', city: 'Kathmandu',
  province: 'Bagmati', emergencyContactName: 'Sita Thapa', emergencyContactPhone: '9800000000',
};
const licence = {
  licenceNumber: 'L-100', licenceClass: 'A', licenceAuthority: 'DoTM Kathmandu',
  licenceIssueDate: '2020-01-01', licenceExpiryDate: '2040-01-01',
};
const bike = {
  category: 'bike' as const, plateNumber: 'BA 1 KHA 1234', make: 'Bajaj', model: 'Pulsar 150',
  manufactureYear: 2020, registrationYear: 2020, color: 'Black', fuelType: 'petrol',
};

async function setup() {
  const { db, close } = await createTestDb();
  const storage = new StorageService(db, new MemoryBackend());
  const notes = new NotificationsService(db);
  const svc = new ApplicationService(db, new RequirementsService(db), storage, notes);
  await db.insert(users).values({ id: 'u1', name: 'Ram', email: 'r@t.l', mobile: '9812345678', passwordHash: 'x', role: 'driver' });
  await db.insert(users).values({ id: 'u2', name: 'Hari', email: 'h@t.l', mobile: '9812345679', passwordHash: 'x', role: 'driver' });
  return { db, close, svc };
}

const car = {
  category: 'car' as const, plateNumber: 'BA 2 CHA 4321', make: 'Suzuki', model: 'Alto',
  manufactureYear: 2021, registrationYear: 2021, color: 'White', fuelType: 'petrol', seats: 4, serviceClass: 'hatchback',
};

/** Insurance and vehicle photos are optional; pass `optionalItems: false` to skip them. */
async function completeDraft(
  svc: ApplicationService,
  db: Database,
  userId: string,
  vehicle: typeof bike | typeof car = bike,
  opts: { optionalItems?: boolean } = {},
) {
  const withOptional = opts.optionalItems !== false;
  await db.insert(driverProfiles).values({ userId, phoneVerifiedAt: new Date() }).onConflictDoUpdate({
    target: driverProfiles.userId,
    set: { phoneVerifiedAt: new Date() },
  });
  await svc.getOrCreate(userId);
  await svc.saveProfile(userId, { ...personal, ...licence });
  await svc.uploadFile(userId, { docType: 'profile_photo', file: file() });
  await svc.saveVehicle(userId, vehicle);
  for (const t of ['licence_front', 'licence_back', 'identity_front']) {
    await svc.uploadFile(userId, { docType: t, file: file() });
  }
  await svc.uploadFile(userId, { docType: 'bluebook', file: file() });
  if (vehicle.category === 'car') await svc.uploadFile(userId, { docType: 'road_tax', expiryDate: '2040-01-01', file: file() });
  if (withOptional) {
    await svc.uploadFile(userId, { docType: 'insurance', expiryDate: '2040-01-01', file: file() });
    for (const t of ['front', 'side', 'rear', 'plate']) {
      await svc.uploadFile(userId, { docType: `photo:${t}`, file: file() });
    }
  }
}

describe('ApplicationService', () => {
  it('starts as DRAFT and lists the bike requirements after a vehicle is saved', async () => {
    const { svc, close } = await setup();
    const v0 = await svc.getOrCreate('u1');
    expect(v0.application.status).toBe('DRAFT');
    expect(v0.requirements.some((r) => r.docType === 'bluebook')).toBe(false); // no vehicle yet
    await svc.saveVehicle('u1', bike);
    const v1 = await svc.getOrCreate('u1');
    expect(v1.requirements.map((r) => r.docType)).toEqual(
      expect.arrayContaining(['bluebook', 'insurance', 'photo:plate', 'licence_front']),
    );
    expect(v1.requirements.some((r) => r.docType === 'road_tax')).toBe(false);
    await close();
  });

  it('switching to a car changes the requirements (road tax and interior photo appear)', async () => {
    const { svc, close } = await setup();
    await svc.getOrCreate('u1');
    await svc.saveVehicle('u1', bike);
    await svc.saveVehicle('u1', { ...bike, category: 'car', plateNumber: 'BA 2 PA 5678' });
    const v = await svc.getOrCreate('u1');
    expect(v.vehicle?.category).toBe('car');
    expect(v.requirements.map((r) => r.docType)).toEqual(expect.arrayContaining(['road_tax', 'photo:interior']));
    await close();
  });

  it('insurance and vehicle photos are optional: a complete application without them can be submitted', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1', bike, { optionalItems: false });
    const before = await svc.getOrCreate('u1');
    expect(before.blockers).toEqual([]);
    const optional = before.requirements.filter((r) => !r.isRequired).map((r) => r.docType);
    expect(optional).toEqual(expect.arrayContaining(['insurance', 'photo:front', 'photo:side', 'photo:rear', 'photo:plate', 'identity_back']));
    expect((await svc.submit('u1')).application.status).toBe('SUBMITTED');
    await close();
  });

  it('a car still needs its road tax, but not insurance or photos', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1', car, { optionalItems: false });
    const v = await svc.getOrCreate('u1');
    const required = v.requirements.filter((r) => r.isRequired).map((r) => r.docType).sort();
    expect(required).toEqual(['bluebook', 'identity_front', 'licence_back', 'licence_front', 'road_tax']);
    await close();
  });

  it('refuses to submit an incomplete draft with a friendly message and the reasons', async () => {
    const { svc, close } = await setup();
    await svc.getOrCreate('u1');
    await expect(svc.submit('u1')).rejects.toMatchObject({
      status: 400,
      response: { code: 'SUBMIT_BLOCKED', details: expect.any(Array) },
    });
    await close();
  });

  it('refuses an expired licence with the exact user message', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.saveProfile('u1', { licenceIssueDate: '2015-01-01', licenceExpiryDate: '2020-01-01' });
    await expect(svc.submit('u1')).rejects.toMatchObject({
      response: { message: 'Your driving licence has expired. Please upload a valid licence.' },
    });
    await close();
  });

  it('rejects a licence whose expiry is not after its issue date, and under-18 drivers', async () => {
    const { svc, close } = await setup();
    await svc.getOrCreate('u1');
    await expect(
      svc.saveProfile('u1', { licenceIssueDate: '2030-01-01', licenceExpiryDate: '2029-01-01' }),
    ).rejects.toMatchObject({ status: 400 });
    const young = new Date();
    young.setFullYear(young.getFullYear() - 16);
    await expect(
      svc.saveProfile('u1', { dateOfBirth: young.toISOString().slice(0, 10) }),
    ).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('submits a complete draft -> SUBMITTED, notifies the driver, and locks editing', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    const v = await svc.submit('u1');
    expect(v.application.status).toBe('SUBMITTED');
    expect(v.application.submittedAt).not.toBeNull();
    await expect(svc.saveProfile('u1', { city: 'Pokhara' })).rejects.toMatchObject({ status: 409 });
    await expect(svc.saveVehicle('u1', { ...bike, color: 'Red' })).rejects.toMatchObject({ status: 409 });
    const notes = await db.select().from(userNotifications).where(eq(userNotifications.userId, 'u1'));
    expect(notes.some((n) => n.type === 'driver_application')).toBe(true);
    await close();
  });

  it('prevents a second driver from registering the same plate in another format', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.getOrCreate('u2');
    await expect(svc.saveVehicle('u2', { ...bike, plateNumber: 'ba-1-kha-1234' })).rejects.toMatchObject({ status: 409 });
    await close();
  });

  it('keeps history when a document is replaced', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.uploadFile('u1', { docType: 'bluebook', file: file('new.jpg') });
    const rows = await db.select().from(applicationDocuments).where(eq(applicationDocuments.docType, 'bluebook'));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.supersededById === null)).toHaveLength(1);
    await close();
  });

  it('requires a future expiry date for insurance', async () => {
    const { svc, close } = await setup();
    await svc.getOrCreate('u1');
    await svc.saveVehicle('u1', bike);
    await expect(svc.uploadFile('u1', { docType: 'insurance', file: file() })).rejects.toMatchObject({ status: 400 });
    await expect(
      svc.uploadFile('u1', { docType: 'insurance', expiryDate: '2020-01-01', file: file() }),
    ).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('rejects unknown document types, vehicle documents before a vehicle exists, and PDFs as photos', async () => {
    const { svc, close } = await setup();
    await svc.getOrCreate('u1');
    await expect(svc.uploadFile('u1', { docType: 'bluebook', file: file() })).rejects.toMatchObject({ status: 400 });
    await svc.saveVehicle('u1', bike);
    await expect(svc.uploadFile('u1', { docType: 'passport_x', file: file() })).rejects.toMatchObject({ status: 400 });
    await expect(svc.uploadFile('u1', { docType: 'photo:front', file: pdfFile() })).rejects.toMatchObject({ status: 400 });
    await expect(svc.uploadFile('u1', { docType: 'profile_photo', file: pdfFile() })).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('does not let a submitted driver silently replace a pending document', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.submit('u1');
    await expect(svc.uploadFile('u1', { docType: 'bluebook', file: file() })).rejects.toMatchObject({ status: 409 });
    await close();
  });

  it('lets the driver replace a REJECTED document, then resubmit without restarting', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.submit('u1');
    await db.update(applicationDocuments).set({ status: 'REJECTED', rejectionReason: 'Bluebook image is unclear.' })
      .where(eq(applicationDocuments.docType, 'bluebook'));
    await db.update(driverApplications).set({ status: 'RESUBMISSION_REQUIRED' }).where(eq(driverApplications.userId, 'u1'));

    const before = await svc.getOrCreate('u1');
    expect(before.statusMessage).toBe(
      'Your vehicle registration (bluebook) was rejected: Bluebook image is unclear. Please upload a new one.',
    );
    await expect(svc.submit('u1')).rejects.toMatchObject({ status: 400 }); // rejected doc not yet replaced

    await svc.uploadFile('u1', { docType: 'bluebook', file: file('bluebook2.jpg') });
    const cur = (await svc.getOrCreate('u1')).requirements.find((r) => r.docType === 'bluebook')!.current!;
    expect(cur.status).toBe('PENDING');
    expect(cur.rejectionReason).toBeNull();

    const after = await svc.submit('u1');
    expect(after.application.status).toBe('SUBMITTED');
    // nothing else was reset
    const licence = (await svc.getOrCreate('u1')).requirements.find((r) => r.docType === 'licence_front')!.current!;
    expect(licence.status).toBe('PENDING');
    await close();
  });

  it('deletes an upload only while the application is a draft', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    const v = await svc.getOrCreate('u1');
    const photoDoc = v.requirements.find((r) => r.docType === 'photo:rear')!.current!;
    const afterDelete = await svc.deleteFile('u1', photoDoc.id);
    expect(afterDelete.requirements.find((r) => r.docType === 'photo:rear')!.current).toBeNull();

    await svc.uploadFile('u1', { docType: 'photo:rear', file: file() });
    await svc.submit('u1');
    const cur = (await svc.getOrCreate('u1')).requirements.find((r) => r.docType === 'photo:rear')!.current!;
    await expect(svc.deleteFile('u1', cur.id)).rejects.toMatchObject({ status: 409 });
    await close();
  });

  it("never lets one driver touch another driver's documents", async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.getOrCreate('u2');
    const doc = (await svc.getOrCreate('u1')).requirements.find((r) => r.docType === 'photo:rear')!.current!;
    await expect(svc.deleteFile('u2', doc.id)).rejects.toMatchObject({ status: 404 });
    await close();
  });

  it('lets a rejected applicant reopen the application as a draft', async () => {
    const { svc, db, close } = await setup();
    await svc.getOrCreate('u1');
    await db.update(driverApplications).set({ status: 'REJECTED', rejectionReason: 'Photos unclear' });
    const v = await svc.reopen('u1');
    expect(v.application.status).toBe('DRAFT');
    await expect(svc.reopen('u1')).rejects.toMatchObject({ status: 409 });
    await close();
  });

  it('keeps the vehicle row and the application in sync (one vehicle per application)', async () => {
    const { svc, db, close } = await setup();
    await svc.getOrCreate('u1');
    await svc.saveVehicle('u1', bike);
    await svc.saveVehicle('u1', { ...bike, color: 'Red' });
    const rows = await db.select().from(vehicles).where(eq(vehicles.driverId, 'u1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ color: 'Red', plateNormalized: 'BA1KHA1234', verificationStatus: 'PENDING', isActive: true });
    await close();
  });
});
