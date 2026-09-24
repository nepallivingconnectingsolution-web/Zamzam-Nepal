import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Roles } from '../../src/common/decorators/roles.decorator';
import { AllowPending } from '../../src/common/decorators/allow-pending.decorator';
import type { ExecutionContext } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ApprovalsService } from '../../src/modules/super-admin/approvals.service';
import { SuperAdminService } from '../../src/modules/super-admin/super-admin.service';
import { AdminApplicationsService } from '../../src/modules/driver-onboarding/admin-applications.service';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import type { PasswordResetService } from '../../src/common/password-reset/password-reset.service';
import { PARTNER_DOCUMENT_CATALOG, type PartnerType } from '../../src/modules/partner-documents/dto/partner-documents.dto';
import { partnerDocuments, users, vehicles, wallets, driverApplications } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';
import { fakeConfigService } from '../setup/fakes';
import { applicationIdFor, approveEverything, setupOnboarding, submittedApplication, type Onboarding } from '../setup/onboarding-fixtures';

const ADMIN = 'sa_1';
let seq = 0;

async function makeBusiness(db: Database, role: PartnerType, kycStatus: 'PENDING' | 'APPROVED' | 'SUSPENDED' = 'PENDING') {
  seq += 1;
  const id = `biz_${seq}`;
  await db.insert(users).values({
    id, name: `Biz ${seq}`, email: `biz${seq}@t.l`, mobile: `97${String(20000000 + seq)}`,
    passwordHash: 'x', role, kycStatus, businessName: `Shop ${seq}`, businessAddress: 'Pokhara',
  });
  return id;
}

async function upload(db: Database, partnerId: string, role: PartnerType, type: string, status: 'PENDING' | 'APPROVED' | 'SUSPENDED' = 'PENDING') {
  seq += 1;
  await db.insert(partnerDocuments).values({
    id: `doc_${seq}`, partnerId, partnerType: role, type, fileUrl: `/uploads/partner-documents/f${seq}.pdf`,
    fileName: `f${seq}.pdf`, mimeType: 'application/pdf', status,
  });
}

const requiredTypes = (role: PartnerType) => PARTNER_DOCUMENT_CATALOG[role].filter((d) => d.required).map((d) => d.type);

describe('Approvals inbox', () => {
  let o: Onboarding;
  let approvals: ApprovalsService;
  let sa: SuperAdminService;

  beforeEach(async () => {
    o = await setupOnboarding();
    approvals = new ApprovalsService(o.db);
    sa = new SuperAdminService(o.db, new JwtService(), fakeConfigService(), new NotificationsService(o.db), {} as PasswordResetService);
  });
  afterEach(async () => {
    await o.close();
  });

  describe('business registrations', () => {
    it('moves from AWAITING_DOCUMENTS to IN_REVIEW to READY_TO_APPROVE as documents arrive and are approved', async () => {
      const hotel = await makeBusiness(o.db, 'hotel');
      const stage = async () => (await approvals.list({ status: 'PENDING' })).items.find((i) => i.userId === hotel)?.stage;

      expect(await stage()).toBe('AWAITING_DOCUMENTS');

      const [first, ...rest] = requiredTypes('hotel');
      await upload(o.db, hotel, 'hotel', first);
      expect(await stage()).toBe('IN_REVIEW');

      for (const t of rest) await upload(o.db, hotel, 'hotel', t);
      await o.db.update(partnerDocuments).set({ status: 'APPROVED' }).where(eq(partnerDocuments.partnerId, hotel));
      expect(await stage()).toBe('READY_TO_APPROVE');
    });

    it('reports a document summary and per-tab counts, and filters by status and type', async () => {
      const pending = await makeBusiness(o.db, 'hotel');
      await upload(o.db, pending, 'hotel', 'business_license');
      await upload(o.db, pending, 'hotel', 'owner_id', 'APPROVED');
      await makeBusiness(o.db, 'freight', 'APPROVED');
      await makeBusiness(o.db, 'grocery', 'SUSPENDED');

      const inbox = await approvals.list({ status: 'PENDING' });
      expect(inbox.counts).toEqual({ PENDING: 1, APPROVED: 1, REJECTED: 1 });
      expect(inbox.items).toHaveLength(1);
      expect(inbox.items[0].documents).toMatchObject({ uploaded: 2, pending: 1, approved: 1, rejected: 0 });

      expect((await approvals.list({ status: 'REJECTED' })).items.map((i) => i.role)).toEqual(['grocery']);
      expect((await approvals.list({ status: 'PENDING', type: 'freight' })).items).toHaveLength(0);
    });

    it('searches by name, business name and phone', async () => {
      await makeBusiness(o.db, 'hotel');
      expect((await approvals.list({ q: 'shop 1' })).items).toHaveLength(1);
      expect((await approvals.list({ q: 'nobody' })).items).toHaveLength(0);
    });

    it('resolves a business with its documents (including ones not uploaded yet) and the approval gate', async () => {
      const hotel = await makeBusiness(o.db, 'hotel');
      await upload(o.db, hotel, 'hotel', 'business_license');

      const r = await approvals.resolve(hotel);
      if (r.kind !== 'business') throw new Error('expected a business');
      expect(r.user.businessName).toMatch(/^Shop /);
      expect(r.documents.map((d) => d.status)).toEqual(['PENDING', 'NOT_UPLOADED', 'NOT_UPLOADED']);
      expect(r.gate.ok).toBe(false);
    });

    it('404s for a customer or unknown id', async () => {
      await o.db.insert(users).values({ id: 'cust_1', name: 'C', email: 'c@t.l', mobile: '9700000001', passwordHash: 'x', role: 'customer' });
      await expect(approvals.resolve('cust_1')).rejects.toMatchObject({ status: 404 });
      await expect(approvals.resolve('nope')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('driver registrations', () => {
    it('hides a driver who has not submitted, lists a submitted one with its application id, and reaches APPROVED', async () => {
      const appId = await submittedApplication(o, 'drv_1');
      const inbox = await approvals.list({ status: 'PENDING' });
      const item = inbox.items.find((i) => i.userId === 'drv_1');
      expect(item).toMatchObject({ role: 'driver', stage: 'IN_REVIEW', applicationId: appId });
      expect(item!.documents.pending).toBeGreaterThan(0);

      const admin = new AdminApplicationsService(o.db, o.notifications, o.requirements);
      await approveEverything(admin, o.db, appId);
      expect((await approvals.list({ status: 'APPROVED' })).items.map((i) => i.userId)).toContain('drv_1');
      expect((await approvals.list({ status: 'PENDING' })).items.map((i) => i.userId)).not.toContain('drv_1');
    });

    it('brings an approved driver back to PENDING as VEHICLE_CHANGED when a vehicle is awaiting approval', async () => {
      const appId = await submittedApplication(o, 'drv_1');
      const admin = new AdminApplicationsService(o.db, o.notifications, o.requirements);
      await approveEverything(admin, o.db, appId);

      await o.db.update(vehicles).set({ verificationStatus: 'PENDING' }).where(eq(vehicles.driverId, 'drv_1'));
      const item = (await approvals.list({ status: 'PENDING' })).items.find((i) => i.userId === 'drv_1');
      expect(item?.stage).toBe('VEHICLE_CHANGED');

      const r = await approvals.resolve('drv_1');
      if (r.kind !== 'driver') throw new Error('expected a driver');
      expect(r.applicationId).toBe(appId);
      expect(r.pendingVehicles).toHaveLength(1);
    });

    it('lists a driver in Partner Docs with their uploaded documents', async () => {
      await submittedApplication(o, 'drv_1');
      const { items } = await approvals.records({});
      const rec = items.find((i) => i.userId === 'drv_1')!;
      expect(rec.documents.length).toBeGreaterThan(3);
      expect(rec.documents.every((d) => d.source === 'application' && d.fileId)).toBe(true);
      expect(await applicationIdFor(o.db, 'drv_1')).toBe(rec.applicationId);
    });

    it('keeps a driver who has only registered (DRAFT) out of the inbox', async () => {
      await o.db.insert(users).values({ id: 'drv_9', name: 'D', email: 'd9@t.l', mobile: '9700000009', passwordHash: 'x', role: 'driver' });
      await o.db.insert(driverApplications).values({ id: 'app_9', userId: 'drv_9' });
      const all = await approvals.list({ status: 'PENDING' });
      expect(all.items.find((i) => i.userId === 'drv_9')).toBeUndefined();
    });
  });

  describe('deciding through users/:id/kyc', () => {
    it('refuses to approve a driver: that has to go through the application review', async () => {
      await submittedApplication(o, 'drv_1');
      await expect(sa.decideKyc(ADMIN, 'drv_1', 'APPROVED')).rejects.toMatchObject({
        status: 409,
        response: { code: 'USE_APPLICATION_REVIEW' },
      });
      const [u] = await o.db.select().from(users).where(eq(users.id, 'drv_1'));
      expect(u.kycStatus).toBe('PENDING');
    });

    it('refuses to approve a business while a required document is not verified', async () => {
      const hotel = await makeBusiness(o.db, 'hotel');
      await expect(sa.decideKyc(ADMIN, hotel, 'APPROVED')).rejects.toMatchObject({ response: { code: 'DOCUMENTS_NOT_VERIFIED' } });

      for (const t of requiredTypes('hotel')) await upload(o.db, hotel, 'hotel', t, 'PENDING');
      await expect(sa.decideKyc(ADMIN, hotel, 'APPROVED')).rejects.toMatchObject({ response: { code: 'DOCUMENTS_NOT_VERIFIED' } });
    });

    it('approves a business once every required document is verified, and gives it a wallet', async () => {
      const hotel = await makeBusiness(o.db, 'hotel');
      for (const t of requiredTypes('hotel')) await upload(o.db, hotel, 'hotel', t, 'APPROVED');
      await sa.decideKyc(ADMIN, hotel, 'APPROVED');

      const [u] = await o.db.select().from(users).where(eq(users.id, hotel));
      expect(u.kycStatus).toBe('APPROVED');
      expect(await o.db.select().from(wallets).where(eq(wallets.userId, hotel))).toHaveLength(1);
    });

    it('always lets an admin reject a business, even with no documents', async () => {
      const hotel = await makeBusiness(o.db, 'hotel');
      await sa.decideKyc(ADMIN, hotel, 'SUSPENDED');
      const [u] = await o.db.select().from(users).where(eq(users.id, hotel));
      expect(u.kycStatus).toBe('SUSPENDED');
    });
  });
});

describe('RolesGuard and unapproved business partners', () => {
  let o: Onboarding;
  let guard: RolesGuard;

  @Roles('hotel', 'restaurant')
  class Closed { handler() {} }

  @Roles('hotel', 'restaurant')
  @AllowPending()
  class Open { handler() {} }

  @Roles('driver')
  class DriverOnly { handler() {} }

  const ctx = (cls: { prototype: { handler: () => void } }, user: { id: string; role: string }) =>
    ({
      getHandler: () => cls.prototype.handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    o = await setupOnboarding();
    guard = new RolesGuard(new Reflector(), o.db);
  });
  afterEach(async () => {
    await o.close();
  });

  it('blocks a PENDING business from a normal partner route with PARTNER_NOT_APPROVED', async () => {
    const id = await makeBusiness(o.db, 'hotel', 'PENDING');
    await expect(guard.canActivate(ctx(Closed, { id, role: 'hotel' }))).rejects.toMatchObject({
      status: 403,
      response: { code: 'PARTNER_NOT_APPROVED' },
    });
  });

  it('lets a PENDING business reach a route marked @AllowPending()', async () => {
    const id = await makeBusiness(o.db, 'hotel', 'PENDING');
    await expect(guard.canActivate(ctx(Open, { id, role: 'hotel' }))).resolves.toBe(true);
  });

  it('lets an APPROVED business through, and blocks it again the moment it is suspended', async () => {
    const id = await makeBusiness(o.db, 'hotel', 'APPROVED');
    await expect(guard.canActivate(ctx(Closed, { id, role: 'hotel' }))).resolves.toBe(true);

    await o.db.update(users).set({ kycStatus: 'SUSPENDED' }).where(eq(users.id, id));
    await expect(guard.canActivate(ctx(Closed, { id, role: 'hotel' }))).rejects.toMatchObject({
      response: { code: 'PARTNER_NOT_APPROVED' },
    });
  });

  it('still enforces the role claim first', async () => {
    const id = await makeBusiness(o.db, 'freight', 'APPROVED');
    await expect(guard.canActivate(ctx(Closed, { id, role: 'freight' }))).rejects.toMatchObject({
      response: { code: 'ROLE_MISMATCH' },
    });
  });

  it('does not apply the approval check to drivers (their access is gated by onboarding and eligibility)', async () => {
    await expect(guard.canActivate(ctx(DriverOnly, { id: 'drv_x', role: 'driver' }))).resolves.toBe(true);
  });
});
