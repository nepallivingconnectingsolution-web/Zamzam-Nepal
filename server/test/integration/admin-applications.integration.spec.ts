import { and, eq } from 'drizzle-orm';
import { AdminApplicationsService } from '../../src/modules/driver-onboarding/admin-applications.service';
import {
  applicationDocuments,
  auditLogs,
  driverApplications,
  driverStatus,
  rideOffers,
  rides,
  superAdminNotifications,
  userNotifications,
  users,
  vehicles,
  verificationReviews,
} from '../../src/database/schema';
import {
  createCustomerUser,
  createDriverUser,
  car,
  completeDraft,
  file,
  setupOnboarding,
  submittedApplication,
  type Onboarding,
} from '../setup/onboarding-fixtures';

const ADMIN = 'sa_1';

describe('AdminApplicationsService', () => {
  let o: Onboarding;
  let admin: AdminApplicationsService;
  let offline: jest.Mock;

  beforeEach(async () => {
    o = await setupOnboarding();
    offline = jest.fn(async () => undefined);
    admin = new AdminApplicationsService(o.db, o.notifications, o.requirements, { onDriverForcedOffline: offline });
  });
  afterEach(async () => {
    await o.close();
  });

  const currentDocs = (appId: string) =>
    o.db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, appId));

  async function approveAllDocuments(appId: string) {
    for (const d of await currentDocs(appId)) {
      if (d.status === 'PENDING' && d.supersededById === null) await admin.reviewDocument(ADMIN, d.id, { action: 'approve' });
    }
  }

  it('moves SUBMITTED to UNDER_REVIEW once, and is a no-op the second time', async () => {
    const appId = await submittedApplication(o, 'u1');
    expect(await admin.startReview(ADMIN, appId)).toEqual({ status: 'UNDER_REVIEW' });
    expect(await admin.startReview(ADMIN, appId)).toEqual({ status: 'UNDER_REVIEW' });
    const reviews = await o.db.select().from(verificationReviews).where(eq(verificationReviews.action, 'REVIEW_STARTED'));
    expect(reviews).toHaveLength(1);
  });

  it('refuses to reject a document without a reason', async () => {
    const appId = await submittedApplication(o, 'u1');
    const [doc] = await currentDocs(appId);
    await expect(admin.reviewDocument(ADMIN, doc.id, { action: 'reject', reason: '   ' })).rejects.toMatchObject({ status: 400 });
    const [after] = await o.db.select().from(applicationDocuments).where(eq(applicationDocuments.id, doc.id));
    expect(after.status).toBe('PENDING');
  });

  it('blocks final approval while documents are pending, with the exact message', async () => {
    const appId = await submittedApplication(o, 'u1');
    await admin.startReview(ADMIN, appId);
    await expect(admin.approve(ADMIN, appId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'APPROVAL_BLOCKED', message: expect.stringMatching(/^Application cannot be approved because \d+ required documents are still pending\.$/) },
    });
  });

  it('uses singular wording when exactly one document is pending', async () => {
    const appId = await submittedApplication(o, 'u1');
    const docs = await currentDocs(appId);
    const last = docs.find((d) => d.docType === 'bluebook')!;
    for (const d of docs.filter((x) => x.id !== last.id)) await admin.reviewDocument(ADMIN, d.id, { action: 'approve' });
    await expect(admin.approve(ADMIN, appId)).rejects.toMatchObject({
      response: { message: 'Application cannot be approved because 1 required document is still pending.' },
    });
  });

  it('approves a fully reviewed application: driver, vehicle and status are all set, and the driver is told', async () => {
    const appId = await submittedApplication(o, 'u1');
    await approveAllDocuments(appId);
    await admin.approve(ADMIN, appId);

    const [app] = await o.db.select().from(driverApplications).where(eq(driverApplications.id, appId));
    expect(app).toMatchObject({ status: 'APPROVED', reviewedBy: ADMIN });
    const [user] = await o.db.select().from(users).where(eq(users.id, 'u1'));
    expect(user.kycStatus).toBe('APPROVED');
    const [veh] = await o.db.select().from(vehicles).where(eq(vehicles.driverId, 'u1'));
    expect(veh).toMatchObject({ verificationStatus: 'APPROVED', isActive: true });
    const [ds] = await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1'));
    expect(ds).toMatchObject({ activeVehicleId: veh.id, online: false });

    const notes = await o.db.select().from(userNotifications).where(eq(userNotifications.userId, 'u1'));
    expect(notes.map((n) => n.message)).toContain('Your ZamZam Driver account has been approved.');
  });

  it('a driver who skipped the optional insurance and vehicle photos can still be approved', async () => {
    const appId = await submittedApplication(o, 'u1', undefined, { optionalItems: false });
    await approveAllDocuments(appId);
    await expect(admin.approve(ADMIN, appId)).resolves.toMatchObject({ status: 'APPROVED' });
    const d = await admin.detail(appId);
    expect(d.missing).toEqual([]);
    expect(d.requirements.filter((r) => !r.isRequired && !r.current).map((r) => r.docType)).toEqual(
      expect.arrayContaining(['insurance', 'photo:front']),
    );
  });

  it('cannot review the same document twice', async () => {
    const appId = await submittedApplication(o, 'u1');
    const [doc] = await currentDocs(appId);
    await admin.reviewDocument(ADMIN, doc.id, { action: 'approve' });
    await expect(admin.reviewDocument(ADMIN, doc.id, { action: 'approve' })).rejects.toMatchObject({ status: 409 });
    await expect(admin.reviewDocument(ADMIN, doc.id, { action: 'reject', reason: 'changed my mind' })).rejects.toMatchObject({ status: 409 });
  });

  it('an optional item (insurance) can still be rejected and re-requested: the driver replaces only that one', async () => {
    const appId = await submittedApplication(o, 'u1');
    await admin.startReview(ADMIN, appId);
    const docs = await currentDocs(appId);
    const insurance = docs.find((d) => d.docType === 'insurance')!;
    await admin.reviewDocument(ADMIN, insurance.id, { action: 'reject', reason: 'Insurance image is unclear.' });
    await expect(admin.requestResubmission(ADMIN, appId)).resolves.toMatchObject({ status: 'RESUBMISSION_REQUIRED' });

    const view = await o.apps.getOrCreate('u1');
    expect(view.statusMessage).toBe('Your vehicle insurance was rejected: Insurance image is unclear. Please upload a new one.');

    await o.apps.uploadFile('u1', { docType: 'insurance', expiryDate: '2041-01-01', file: file('ins2.jpg') });
    expect((await o.apps.submit('u1')).application.status).toBe('SUBMITTED');

    const current = (await currentDocs(appId)).filter((d) => d.supersededById === null);
    const newInsurance = current.find((d) => d.docType === 'insurance')!;
    expect(newInsurance.status).toBe('PENDING');
    expect(newInsurance.id).not.toBe(insurance.id);
    await admin.reviewDocument(ADMIN, newInsurance.id, { action: 'approve' });

    const notes = await o.db.select().from(userNotifications).where(eq(userNotifications.userId, 'u1'));
    expect(notes.some((n) => n.title === 'Document rejected' && n.message.includes('Insurance image is unclear'))).toBe(true);
  });

  it('will not request resubmission without a rejected item or a reason', async () => {
    const appId = await submittedApplication(o, 'u1');
    await admin.startReview(ADMIN, appId);
    await expect(admin.requestResubmission(ADMIN, appId)).rejects.toMatchObject({ status: 400 });
    await expect(admin.requestResubmission(ADMIN, appId, 'Please retake all photos in daylight')).resolves.toBeDefined();
  });

  it('rejects an application with a required reason, and it can be reopened by the driver', async () => {
    const appId = await submittedApplication(o, 'u1');
    await expect(admin.reject(ADMIN, appId, ' ')).rejects.toMatchObject({ status: 400 });
    await admin.reject(ADMIN, appId, 'Licence does not match the ID.');
    const view = await o.apps.getOrCreate('u1');
    expect(view.application.status).toBe('REJECTED');
    expect(view.statusMessage).toBe('Your application was rejected: Licence does not match the ID.');
    expect((await o.apps.reopen('u1')).application.status).toBe('DRAFT');
  });

  it('only one of two admins approving at the same moment succeeds', async () => {
    const appId = await submittedApplication(o, 'u1');
    await approveAllDocuments(appId);
    const results = await Promise.allSettled([admin.approve('sa_1', appId), admin.approve('sa_2', appId)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409 });
    expect(await o.db.select().from(verificationReviews).where(eq(verificationReviews.action, 'APPLICATION_APPROVED'))).toHaveLength(1);
  });

  it('refuses to approve from a stale page (expectedVersion mismatch)', async () => {
    const appId = await submittedApplication(o, 'u1');
    await approveAllDocuments(appId);
    const [app] = await o.db.select().from(driverApplications).where(eq(driverApplications.id, appId));
    await expect(admin.approve(ADMIN, appId, app.version - 1)).rejects.toMatchObject({ status: 409, response: { code: 'STALE' } });
    await expect(admin.approve(ADMIN, appId, app.version)).resolves.toBeDefined();
  });

  describe('suspension', () => {
    async function approvedOnline() {
      const appId = await submittedApplication(o, 'u1');
      await approveAllDocuments(appId);
      await admin.approve(ADMIN, appId);
      await o.db.update(driverStatus).set({ online: true }).where(eq(driverStatus.userId, 'u1'));
      return appId;
    }

    it('requires a reason', async () => {
      const appId = await approvedOnline();
      await expect(admin.suspend(ADMIN, appId, { scope: 'BOTH', reason: '' })).rejects.toMatchObject({ status: 400 });
    });

    it('suspending the driver forces them offline, blocks login-side kycStatus, notifies, and reactivation restores it', async () => {
      const appId = await approvedOnline();
      await admin.suspend(ADMIN, appId, { scope: 'DRIVER', reason: 'Multiple rider complaints' });

      const [app] = await o.db.select().from(driverApplications).where(eq(driverApplications.id, appId));
      expect(app).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'Multiple rider complaints' });
      expect((await o.db.select().from(users).where(eq(users.id, 'u1')))[0].kycStatus).toBe('SUSPENDED');
      expect((await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1')))[0].online).toBe(false);
      expect(offline).toHaveBeenCalledTimes(1);
      expect(offline).toHaveBeenCalledWith('u1', 'Multiple rider complaints');
      const [veh] = await o.db.select().from(vehicles).where(eq(vehicles.driverId, 'u1'));
      expect(veh.verificationStatus).toBe('APPROVED'); // scope was DRIVER only

      await admin.reactivate(ADMIN, appId, { scope: 'DRIVER' });
      expect((await o.db.select().from(driverApplications).where(eq(driverApplications.id, appId)))[0].status).toBe('APPROVED');
      expect((await o.db.select().from(users).where(eq(users.id, 'u1')))[0].kycStatus).toBe('APPROVED');
    });

    it('suspending only the vehicle detaches it and leaves the driver approved; reactivating re-attaches it', async () => {
      const appId = await approvedOnline();
      await admin.suspend(ADMIN, appId, { scope: 'VEHICLE', reason: 'Failed inspection' });
      const [veh] = await o.db.select().from(vehicles).where(eq(vehicles.driverId, 'u1'));
      expect(veh.verificationStatus).toBe('SUSPENDED');
      expect((await o.db.select().from(driverApplications).where(eq(driverApplications.id, appId)))[0].status).toBe('APPROVED');
      expect((await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1')))[0]).toMatchObject({ online: false, activeVehicleId: null });

      await admin.reactivate(ADMIN, appId, { scope: 'VEHICLE' });
      expect((await o.db.select().from(driverStatus).where(eq(driverStatus.userId, 'u1')))[0].activeVehicleId).toBe(veh.id);
    });

    it('cancels the driver\'s pending offers', async () => {
      const appId = await approvedOnline();
      await createCustomerUser(o.db, 'c1');
      await o.db.insert(rides).values({ id: 'r1', customerId: 'c1', service: 'bike', fromLabel: 'a', toLabel: 'b', fare: '100', status: 'REQUESTED' });
      await o.db.insert(rideOffers).values({ id: 'of1', rideId: 'r1', driverId: 'u1', pickupDistanceM: 500, etaMin: 2, expiresAt: new Date(Date.now() + 60000) });
      await admin.suspend(ADMIN, appId, { scope: 'DRIVER', reason: 'Investigation' });
      expect((await o.db.select().from(rideOffers).where(eq(rideOffers.id, 'of1')))[0].status).toBe('CANCELLED');
    });

    it('does not cancel a trip in progress, but flags it for support', async () => {
      const appId = await approvedOnline();
      await createCustomerUser(o.db, 'c1');
      await o.db.insert(rides).values({ id: 'r1', customerId: 'c1', driverId: 'u1', service: 'bike', fromLabel: 'a', toLabel: 'b', fare: '100', status: 'ONGOING' });
      await admin.suspend(ADMIN, appId, { scope: 'DRIVER', reason: 'Safety report' });
      expect((await o.db.select().from(rides).where(eq(rides.id, 'r1')))[0].status).toBe('ONGOING');
      const alerts = await o.db.select().from(superAdminNotifications);
      expect(alerts.some((n) => n.title === 'Suspended driver has an active trip' && n.entityId === 'r1')).toBe(true);
    });

    it('cannot suspend someone who is not approved', async () => {
      const appId = await submittedApplication(o, 'u1');
      await expect(admin.suspend(ADMIN, appId, { scope: 'DRIVER', reason: 'why not' })).rejects.toMatchObject({ status: 409 });
    });

    it('cannot reactivate an account that is not suspended', async () => {
      const appId = await approvedOnline();
      await expect(admin.reactivate(ADMIN, appId, { scope: 'DRIVER' })).rejects.toMatchObject({ status: 409 });
    });
  });

  it('records an audit log and a review row for every admin action', async () => {
    const appId = await submittedApplication(o, 'u1');
    await admin.startReview(ADMIN, appId);
    const docs = await currentDocs(appId);
    await admin.reviewDocument(ADMIN, docs[0].id, { action: 'reject', reason: 'Blurry photo' });
    await admin.addNote(ADMIN, appId, 'Called the driver, will resend.');

    const audits = await o.db.select().from(auditLogs).where(eq(auditLogs.actorId, ADMIN));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['super_admin.driver_application.review_started', 'super_admin.driver_document.rejected', 'super_admin.driver_application.note_added']),
    );
    const rejectedAudit = audits.find((a) => a.action === 'super_admin.driver_document.rejected')!;
    expect(rejectedAudit).toMatchObject({ actorType: 'super_admin', targetType: 'application_document', targetId: docs[0].id });
    expect(rejectedAudit.metadata).toMatchObject({ from: 'PENDING', to: 'REJECTED', reason: 'Blurry photo' });
    const reviewRows = await o.db.select().from(verificationReviews).where(and(eq(verificationReviews.applicationId, appId), eq(verificationReviews.adminId, ADMIN)));
    expect(reviewRows.length).toBeGreaterThanOrEqual(3);
  });

  describe('lists and details', () => {
    it('lists submitted applications with vehicle, filters, search, sort and stats', async () => {
      const a1 = await submittedApplication(o, 'u1');
      await createDriverUser(o.db, 'u2');
      await completeDraft(o.apps, o.db, 'u2', { ...car });
      const a2 = (await o.apps.submit('u2')).application.id;
      await createDriverUser(o.db, 'u3'); // stays a draft, hidden by default
      await o.apps.getOrCreate('u3');
      await admin.startReview(ADMIN, a2);

      const all = await admin.list({});
      expect(all.total).toBe(2);
      expect(all.items.map((i) => i.applicationId).sort()).toEqual([a1, a2].sort());
      const bike1 = all.items.find((i) => i.applicationId === a1)!;
      expect(bike1).toMatchObject({ driverId: 'u1', status: 'SUBMITTED', vehicle: { category: 'bike', plateNumber: 'BA 1 KHA 1234' } });
      expect(bike1.pendingDocs).toBeGreaterThan(0);

      expect((await admin.list({ status: 'PENDING' })).items.map((i) => i.applicationId)).toEqual([a1]);
      expect((await admin.list({ status: 'UNDER_REVIEW' })).items.map((i) => i.applicationId)).toEqual([a2]);
      expect((await admin.list({ status: 'DRAFT' })).total).toBe(1);

      expect((await admin.list({ q: 'ba1kha1234' })).items.map((i) => i.applicationId)).toEqual([a1]);
      expect((await admin.list({ q: 'BA 2 CHA' })).items.map((i) => i.applicationId)).toEqual([a2]);
      expect((await admin.list({ q: 'u2' })).items.map((i) => i.applicationId)).toEqual([a2]);
      expect((await admin.list({ q: '%' })).total).toBe(0); // wildcards are escaped, not matched

      const newest = await admin.list({ sort: 'newest' });
      const oldest = await admin.list({ sort: 'oldest' });
      expect(newest.items.map((i) => i.applicationId)).toEqual(oldest.items.map((i) => i.applicationId).reverse());

      expect(await admin.stats()).toMatchObject({ pending: 1, underReview: 1, approved: 0, draft: 1 });
    });

    it('detail shows what is missing, history, notes, the gate message and the timeline', async () => {
      const appId = await submittedApplication(o, 'u1');
      await o.db.delete(applicationDocuments).where(and(eq(applicationDocuments.applicationId, appId), eq(applicationDocuments.docType, 'bluebook')));
      await admin.startReview(ADMIN, appId);
      await admin.addNote(ADMIN, appId, 'Looks fine so far');
      const docs = await currentDocs(appId);
      const ins = docs.find((d) => d.docType === 'insurance')!;
      await admin.reviewDocument(ADMIN, ins.id, { action: 'reject', reason: 'Expired copy' });
      await o.apps.uploadFile('u1', { docType: 'insurance', expiryDate: '2041-01-01', file: file('new.jpg') });

      const d = await admin.detail(appId);
      expect(d.driver).toMatchObject({ id: 'u1' });
      expect(d.vehicle).toMatchObject({ plateNumber: 'BA 1 KHA 1234' });
      expect(d.missing).toEqual(['vehicle registration (bluebook)']);
      const insuranceReq = d.requirements.find((r) => r.docType === 'insurance')!;
      expect(insuranceReq.current!.status).toBe('PENDING');
      expect(insuranceReq.history).toHaveLength(1);
      expect(insuranceReq.history[0]).toMatchObject({ status: 'REJECTED', rejectionReason: 'Expired copy' });
      expect(d.notes.map((n) => n.reason)).toEqual(['Looks fine so far']);
      expect(d.timeline.map((t) => t.action)).toEqual(expect.arrayContaining(['SUBMITTED', 'REVIEW_STARTED', 'DOCUMENT_REJECTED']));
      expect(d.approvalGate.ok).toBe(false);
      expect(d.approvalGate.message).toMatch(/missing/);
      expect(d.application.version).toBeGreaterThan(0);
    });

    it('404s for an unknown application', async () => {
      await expect(admin.detail('app_nope')).rejects.toMatchObject({ status: 404 });
    });
  });
});
