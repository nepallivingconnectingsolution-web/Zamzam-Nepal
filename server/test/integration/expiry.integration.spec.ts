import { and, eq } from 'drizzle-orm';
import { AdminApplicationsService } from '../../src/modules/driver-onboarding/admin-applications.service';
import { ExpiryService } from '../../src/modules/driver-onboarding/expiry.service';
import { EligibilityService } from '../../src/modules/driver-dispatch/eligibility.service';
import { PresenceService } from '../../src/modules/driver-dispatch/presence.service';
import { DriverEventsBus } from '../../src/modules/driver-dispatch/driver-events.bus';
import { MemoryLocationStore } from '../../src/modules/driver-dispatch/location.store';
import {
  applicationDocuments,
  auditLogs,
  driverApplications,
  driverProfiles,
  driverStatus,
  userNotifications,
  users,
  verificationReviews,
} from '../../src/database/schema';
import {
  approveEverything,
  completeDraft,
  createDriverUser,
  file,
  setupOnboarding,
  submittedApplication,
  type Onboarding,
} from '../setup/onboarding-fixtures';

const KTM = { lat: 27.7059, lng: 85.3145 };
const TODAY = '2026-09-21';

describe('ExpiryService', () => {
  let o: Onboarding;
  let store: MemoryLocationStore;
  let presence: PresenceService;
  let elig: EligibilityService;
  let admin: AdminApplicationsService;
  let expiry: ExpiryService;

  beforeEach(async () => {
    o = await setupOnboarding();
    store = new MemoryLocationStore();
    elig = new EligibilityService(o.db, store);
    presence = new PresenceService(o.db, elig, store, new DriverEventsBus());
    admin = new AdminApplicationsService(o.db, o.notifications, o.requirements, presence);
    expiry = new ExpiryService(o.db, o.notifications, o.requirements, presence);
  });
  afterEach(async () => {
    await o.close();
  });

  async function approvedOnline(userId = 'u1') {
    const appId = await submittedApplication(o, userId);
    await approveEverything(admin, o.db, appId);
    await presence.goOnline(userId, KTM);
    return appId;
  }
  const statusOf = async (appId: string) =>
    (await o.db.select().from(driverApplications).where(eq(driverApplications.id, appId)))[0].status;
  const docOf = async (appId: string, docType: string) =>
    (await o.db.select().from(applicationDocuments).where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, docType))))[0];

  it('expires an approved driver whose required document lapsed, and takes them offline', async () => {
    const appId = await approvedOnline();
    await o.db.update(applicationDocuments).set({ expiryDate: '2026-09-20' })
      .where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'bluebook')));

    expect(await expiry.run(TODAY)).toEqual({ expired: 1 });

    expect(await statusOf(appId)).toBe('EXPIRED');
    expect((await docOf(appId, 'bluebook')).status).toBe('EXPIRED');
    expect((await docOf(appId, 'licence_front')).status).toBe('APPROVED'); // untouched
    expect((await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1')))[0].online).toBe(false);
    expect(await store.get('u1')).toBeNull();
    expect((await elig.check('u1', { requireOnline: false, requireLocation: false })).reasons[0].code).toBe('APPLICATION_EXPIRED');

    const [review] = await o.db.select().from(verificationReviews).where(eq(verificationReviews.action, 'AUTO_EXPIRED'));
    expect(review).toMatchObject({ applicationId: appId, fromStatus: 'APPROVED', toStatus: 'EXPIRED', adminId: null });
    expect(review.reason).toContain('bluebook');
    const audit = (await o.db.select().from(auditLogs)).find((a) => a.action === 'system.driver_application.expired')!;
    expect(audit).toMatchObject({ actorType: 'system', targetId: appId });
    const notes = await o.db.select().from(userNotifications).where(eq(userNotifications.userId, 'u1'));
    expect(notes.some((n) => n.title === 'Document expired' && n.message.includes('bluebook'))).toBe(true);
  });

  it('expires a driver whose licence lapsed and marks both licence images for replacement', async () => {
    const appId = await approvedOnline();
    await o.db.update(driverProfiles).set({ licenceExpiryDate: '2026-09-20' }).where(eq(driverProfiles.userId, 'u1'));

    expect(await expiry.run(TODAY)).toEqual({ expired: 1 });
    expect(await statusOf(appId)).toBe('EXPIRED');
    expect((await docOf(appId, 'licence_front')).status).toBe('EXPIRED');
    expect((await docOf(appId, 'licence_back')).status).toBe('EXPIRED');
    const [review] = await o.db.select().from(verificationReviews).where(eq(verificationReviews.action, 'AUTO_EXPIRED'));
    expect(review.reason).toContain('driving licence');
    expect((await elig.check('u1', { requireOnline: false, requireLocation: false })).eligible).toBe(false);
  });

  it('leaves drivers with valid documents alone, and does not act twice', async () => {
    const good = await approvedOnline('u1');
    expect(await expiry.run(TODAY)).toEqual({ expired: 0 });
    expect(await statusOf(good)).toBe('APPROVED');

    await o.db.update(applicationDocuments).set({ expiryDate: '2026-09-20' })
      .where(and(eq(applicationDocuments.applicationId, good), eq(applicationDocuments.docType, 'bluebook')));
    await expiry.run(TODAY);
    await expiry.run(TODAY);
    expect(await o.db.select().from(verificationReviews).where(eq(verificationReviews.action, 'AUTO_EXPIRED'))).toHaveLength(1);
  });

  it('ignores an expired OPTIONAL document, an application that is not approved, and a legacy driver with no data', async () => {
    // optional document
    await createDriverUser(o.db, 'u1');
    await completeDraft(o.apps, o.db, 'u1');
    await o.apps.uploadFile('u1', { docType: 'identity_back', expiryDate: '2040-01-01', file: file() });
    const optionalApp = (await o.apps.submit('u1')).application.id;
    await approveEverything(admin, o.db, optionalApp);
    await o.db.update(applicationDocuments).set({ expiryDate: '2020-01-01' })
      .where(and(eq(applicationDocuments.applicationId, optionalApp), eq(applicationDocuments.docType, 'identity_back')));

    // legacy driver with nothing on file
    await createDriverUser(o.db, 'old1');
    await o.db.update(users).set({ kycStatus: 'APPROVED' }).where(eq(users.id, 'old1'));
    await o.db.insert(driverApplications).values({ id: 'app_old', userId: 'old1', status: 'APPROVED', isLegacy: true });

    expect(await expiry.run(TODAY)).toEqual({ expired: 0 });
    expect(await statusOf(optionalApp)).toBe('APPROVED');
    expect(await statusOf('app_old')).toBe('APPROVED');
  });

  it('does not touch an application that is still waiting for review', async () => {
    const appId = await submittedApplication(o, 'u1');
    await o.db.update(applicationDocuments).set({ expiryDate: '2020-01-01' })
      .where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'bluebook')));
    expect(await expiry.run(TODAY)).toEqual({ expired: 0 });
    expect(await statusOf(appId)).toBe('SUBMITTED');
  });

  it('lets the driver recover: replace the expired document, resubmit, and be approved again', async () => {
    const appId = await approvedOnline();
    await o.db.update(applicationDocuments).set({ expiryDate: '2026-09-20' })
      .where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'bluebook')));
    await expiry.run(TODAY);

    // still expired: cannot resubmit
    await expect(o.apps.submit('u1')).rejects.toMatchObject({ status: 400 });

    await o.apps.uploadFile('u1', { docType: 'bluebook', file: file('renewed.jpg') });
    expect((await o.apps.submit('u1')).application.status).toBe('SUBMITTED');
    await approveEverything(admin, o.db, appId);

    expect(await statusOf(appId)).toBe('APPROVED');
    await expect(presence.goOnline('u1', KTM)).resolves.toEqual({ online: true });
  });

  it('recovering from an expired licence needs a new date and fresh licence images', async () => {
    const appId = await approvedOnline();
    await o.db.update(driverProfiles).set({ licenceExpiryDate: '2026-09-20' }).where(eq(driverProfiles.userId, 'u1'));
    await expiry.run(TODAY);

    await o.apps.saveProfile('u1', { licenceIssueDate: '2026-09-01', licenceExpiryDate: '2036-09-01' });
    await expect(o.apps.submit('u1')).rejects.toMatchObject({ status: 400 }); // images still marked expired
    await o.apps.uploadFile('u1', { docType: 'licence_front', file: file('front2.jpg') });
    await o.apps.uploadFile('u1', { docType: 'licence_back', file: file('back2.jpg') });
    expect((await o.apps.submit('u1')).application.status).toBe('SUBMITTED');
    await approveEverything(admin, o.db, appId);
    await expect(presence.goOnline('u1', KTM)).resolves.toEqual({ online: true });
  });
});
