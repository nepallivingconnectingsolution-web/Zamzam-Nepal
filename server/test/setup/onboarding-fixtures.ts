import { eq } from 'drizzle-orm';
import { createTestDb } from './test-db';
import { ApplicationService } from '../../src/modules/driver-onboarding/application.service';
import { RequirementsService } from '../../src/modules/driver-onboarding/requirements.service';
import { StorageBackend, StorageService } from '../../src/modules/driver-onboarding/files/storage.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { driverProfiles, users } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

export class MemoryBackend extends StorageBackend {
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
export const file = (name = 'a.jpg') =>
  ({ buffer: jpeg, mimetype: 'image/jpeg', originalname: name, size: jpeg.length }) as Express.Multer.File;

export const personal = {
  legalName: 'Ram Thapa', dateOfBirth: '1995-02-01', gender: 'male', address: 'Baneshwor', city: 'Kathmandu',
  province: 'Bagmati', emergencyContactName: 'Sita Thapa', emergencyContactPhone: '9800000000',
};
export const licence = {
  licenceNumber: 'L-100', licenceClass: 'A', licenceAuthority: 'DoTM Kathmandu',
  licenceIssueDate: '2020-01-01', licenceExpiryDate: '2040-01-01',
};
export const bike = {
  category: 'bike' as const, plateNumber: 'BA 1 KHA 1234', make: 'Bajaj', model: 'Pulsar 150',
  manufactureYear: 2020, registrationYear: 2020, color: 'Black', fuelType: 'petrol',
};
export const car = {
  category: 'car' as const, plateNumber: 'BA 2 CHA 4321', make: 'Suzuki', model: 'Alto',
  manufactureYear: 2021, registrationYear: 2021, color: 'White', fuelType: 'petrol', seats: 4, serviceClass: 'hatchback',
};

export interface Onboarding {
  db: Database;
  close: () => Promise<void>;
  apps: ApplicationService;
  requirements: RequirementsService;
  notifications: NotificationsService;
  storage: StorageService;
}

export async function setupOnboarding(): Promise<Onboarding> {
  const { db, close } = await createTestDb();
  const requirements = new RequirementsService(db);
  const storage = new StorageService(db, new MemoryBackend());
  const notifications = new NotificationsService(db);
  const apps = new ApplicationService(db, requirements, storage, notifications);
  return { db, close, apps, requirements, notifications, storage };
}

let counter = 0;
export async function createDriverUser(db: Database, idv: string) {
  counter += 1;
  await db.insert(users).values({
    id: idv,
    name: idv,
    email: `${idv}-${counter}@t.l`,
    mobile: `98${String(10000000 + counter).slice(-8)}`,
    passwordHash: 'x',
    role: 'driver',
  });
}

export async function createCustomerUser(db: Database, idv: string) {
  counter += 1;
  await db.insert(users).values({
    id: idv,
    name: idv,
    email: `${idv}-${counter}@t.l`,
    mobile: `97${String(10000000 + counter).slice(-8)}`,
    passwordHash: 'x',
    role: 'customer',
  });
}

/** Every step of the wizard, ending with a complete, submittable DRAFT. */
export async function completeDraft(
  apps: ApplicationService,
  db: Database,
  userId: string,
  vehicle: typeof bike | typeof car = bike,
  opts: { optionalItems?: boolean } = {},
) {
  const withOptional = opts.optionalItems !== false; // insurance and vehicle photos are optional
  await db
    .insert(driverProfiles)
    .values({ userId, phoneVerifiedAt: new Date() })
    .onConflictDoUpdate({ target: driverProfiles.userId, set: { phoneVerifiedAt: new Date() } });
  await apps.getOrCreate(userId);
  await apps.saveProfile(userId, { ...personal, ...licence });
  await apps.uploadFile(userId, { docType: 'profile_photo', file: file() });
  await apps.saveVehicle(userId, vehicle);
  for (const t of ['licence_front', 'licence_back', 'identity_front']) {
    await apps.uploadFile(userId, { docType: t, file: file() });
  }
  await apps.uploadFile(userId, { docType: 'bluebook', file: file() });
  if (withOptional) await apps.uploadFile(userId, { docType: 'insurance', expiryDate: '2040-01-01', file: file() });
  if (vehicle.category === 'car') {
    await apps.uploadFile(userId, { docType: 'road_tax', expiryDate: '2040-01-01', file: file() });
  }
  const photos = vehicle.category === 'car' ? ['front', 'rear', 'left', 'right', 'interior', 'plate'] : ['front', 'side', 'rear', 'plate'];
  if (withOptional) for (const t of photos) await apps.uploadFile(userId, { docType: `photo:${t}`, file: file() });
}

export async function submittedApplication(
  o: Onboarding,
  userId: string,
  vehicle: typeof bike | typeof car = bike,
  opts: { optionalItems?: boolean } = {},
) {
  await createDriverUser(o.db, userId);
  await completeDraft(o.apps, o.db, userId, vehicle, opts);
  const view = await o.apps.submit(userId);
  return view.application.id;
}

export const applicationIdFor = async (db: Database, userId: string) => {
  const { driverApplications } = await import('../../src/database/schema');
  const [row] = await db.select().from(driverApplications).where(eq(driverApplications.userId, userId));
  return row.id;
};

/** Approve every pending document, then the application itself. */
export async function approveEverything(
  admin: import('../../src/modules/driver-onboarding/admin-applications.service').AdminApplicationsService,
  db: Database,
  applicationId: string,
  adminId = 'sa_1',
) {
  const { applicationDocuments } = await import('../../src/database/schema');
  const docs = await db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, applicationId));
  for (const d of docs) {
    if (d.status === 'PENDING' && d.supersededById === null) {
      await admin.reviewDocument(adminId, d.id, { action: 'approve' });
    }
  }
  await admin.approve(adminId, applicationId);
}
