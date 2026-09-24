# Driver Onboarding, Verification and Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing ZamZam driver stack into a full driver + vehicle onboarding, super-admin verification, eligibility-gated go-online and atomic offer-based ride dispatch.

**Architecture:** Two new NestJS modules on top of the existing Drizzle/Postgres schema: `driver-onboarding` (application aggregate, private files, OTP, admin review) and `driver-dispatch` (eligibility, Redis-GEO location store, offers, SSE, atomic accept). Pure logic (plate normalization, state machine, gates, eligibility) lives in dependency-free files with unit tests; DB behaviour is tested against pglite via the existing `createTestDb()`. Legacy routes (`/driver/*`, `/vehicles/*`, `/rides/*`) keep their wire contracts and are re-routed through the new services.

**Tech Stack:** NestJS 10, Drizzle ORM 0.36 (Postgres), drizzle-kit migrations, ioredis (optional at runtime), @nestjs/schedule, jest + ts-jest + pglite, React 19 + Vite + Tailwind + Zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-driver-onboarding-verification-design.md`

## Global Constraints

- Work in `C:\Users\KIIT\Downloads\zamzam_fixed\zamzam testing`. Server = `server/`, client = `client/`. Run server commands from `server/`, client commands from `client/`.
- Do not create git commits unless the user asks. Steps therefore end with a passing test run, not a commit.
- IDs use `id('prefix')` from `src/common/id.ts` (varchar(32)). Errors use `apiError(status, message, code?)` from `src/common/exceptions.ts` with user-friendly messages.
- Ride statuses are `REQUESTED, ACCEPTED, ONGOING, PAYMENT_PENDING, COMPLETED, CANCELLED`. Services are `taxi | bike | parcel`. Vehicle categories are `bike | car | van | mini_truck | truck`; onboarding supports `bike` and `car` only.
- `vehicle.status = ACTIVE` means `vehicles.verificationStatus='APPROVED' AND vehicles.isActive=true`. `kyc_status` enum is not altered.
- No mock/fake data. Only configuration rows (document requirements) are seeded by the migration.
- Existing routes `/driver/status`, `/driver/location`, `/vehicles/*`, `/rides/incoming`, `/rides/:id/accept`, `/drivers/nearby` keep working with the same request/response shapes.
- Colour palette: reuse the existing Tailwind tokens (teal 900/700/100, amber-500, ink). No dark UI, no new colours.
- Server tests: `npm test -- <pattern>` from `server/`. Client tests: `npm test -- <pattern>` from `client/`.
- Every migration is generated with `npm run db:generate` then hand-edited only where a task says so. Migration replay must work in pglite (`test/setup/test-db.ts` splits on `--> statement-breakpoint`).

## File Structure

Server (new):
- `src/modules/driver-onboarding/plate.util.ts` (+ `.spec.ts`): `normalizePlate`, `isValidNepalPlate`.
- `src/modules/driver-onboarding/application-state.ts` (+ spec): allowed transitions, `assertTransition`.
- `src/modules/driver-onboarding/application-gates.ts` (+ spec): `evaluateSubmitGate`, `evaluateApprovalGate`.
- `src/modules/driver-onboarding/requirements.service.ts`: reads `document_requirements`.
- `src/modules/driver-onboarding/files/{storage.service.ts,file-validation.ts,files.controller.ts}`: private storage + authenticated download.
- `src/modules/driver-onboarding/otp/{sms.provider.ts,console-sms.provider.ts,sparrow-sms.provider.ts,otp.service.ts,otp.controller.ts}`.
- `src/modules/driver-onboarding/application.service.ts`, `application.controller.ts`, `dto/application.dto.ts`: driver-facing.
- `src/modules/driver-onboarding/admin-applications.service.ts`, `admin-applications.controller.ts`, `dto/admin-applications.dto.ts`: super-admin-facing.
- `src/modules/driver-onboarding/expiry.service.ts`: cron that moves expired approved applications to EXPIRED.
- `src/modules/driver-onboarding/driver-onboarding.module.ts`.
- `src/modules/driver-dispatch/eligibility.ts` (+ spec): pure `evaluateEligibility`.
- `src/modules/driver-dispatch/eligibility.service.ts`: loads snapshot, calls pure fn.
- `src/modules/driver-dispatch/location.store.ts`: `LocationStore` interface, `MemoryLocationStore`, `RedisLocationStore`.
- `src/modules/driver-dispatch/driver-events.bus.ts`, `driver-stream.controller.ts`.
- `src/modules/driver-dispatch/presence.service.ts`: go online/offline, location ping.
- `src/modules/driver-dispatch/dispatch.service.ts`, `offers.controller.ts`, `dispatch.sweeper.ts`.
- `src/modules/driver-dispatch/driver-dispatch.module.ts`.

Server (modified): `src/database/schema.ts`, `drizzle/0026_*.sql`, `src/app.module.ts`, `src/main.ts` (no public serving of private dir; nothing to change except env), `src/modules/auth/auth.service.ts` (driver register/login), `src/modules/driver/driver.service.ts` + `driver.module.ts`, `src/modules/vehicles/vehicles.service.ts`, `src/modules/rides/rides.controller.ts` (create/incoming/accept/active/start/complete hooks), `.env.example`, `docker-compose.yml`, `nginx/*` (SSE).

Client (new): `src/features/driver/onboarding/**`, `src/features/driver/offers/**`, `src/features/super-admin/pages/SuperAdminDriverApplications.tsx`, `SuperAdminDriverApplicationDetail.tsx`. Modified: `src/api/client.ts`, `src/routes/index.tsx`, `src/features/auth/RegisterPage.tsx`, `src/features/driver/DriverDashboard.tsx`, `src/features/super-admin/SuperAdminLayout.tsx`.

---

## Phase 1: Backend foundation

### Task 1: Plate normalization

**Files:**
- Create: `server/src/modules/driver-onboarding/plate.util.ts`
- Test: `server/src/modules/driver-onboarding/plate.util.spec.ts`

**Interfaces:**
- Produces: `normalizePlate(input: string): string` (uppercase, alphanumerics only); `isValidNepalPlate(normalized: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { isValidNepalPlate, normalizePlate } from './plate.util';

describe('normalizePlate', () => {
  it.each(['ba-99-pa-1234', 'BA 99 PA 1234', 'BA99PA1234', ' Ba 99 Pa 1234 '])('normalizes %p', (v) => {
    expect(normalizePlate(v)).toBe('BA99PA1234');
  });
});

describe('isValidNepalPlate', () => {
  it.each(['BA99PA1234', 'BA1KHA1234', 'LU1PA123', 'GA12CHA9999'])('accepts %p', (v) => {
    expect(isValidNepalPlate(v)).toBe(true);
  });
  it.each(['', '1234', 'BA', 'BA99PA', 'BA99PA12345', '99BAPA1234', 'BA-99-PA-1234'])('rejects %p', (v) => {
    expect(isValidNepalPlate(v)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- plate.util` -> FAIL "Cannot find module './plate.util'".

- [ ] **Step 3: Implement**

```ts
/** Uppercase, alphanumerics only, so "ba-99-pa-1234" and "BA 99 PA 1234" compare equal. */
export function normalizePlate(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Nepal plates: province/zone letters, 1-3 digits, series letters, 1-4 digits
 * (e.g. BA 99 PA 1234, BA 1 KHA 1234, LU 1 PA 123). Takes the already
 * normalized value; a value containing separators is rejected.
 */
const NEPAL_PLATE = /^[A-Z]{1,3}\d{1,3}[A-Z]{1,4}\d{1,4}$/;

export function isValidNepalPlate(normalized: string): boolean {
  return NEPAL_PLATE.test(normalized);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- plate.util` -> PASS.

### Task 2: Application state machine and gates (pure)

**Files:**
- Create: `server/src/modules/driver-onboarding/application-state.ts`, `application-gates.ts`
- Test: `application-state.spec.ts`, `application-gates.spec.ts` in the same folder.

**Interfaces:**
- Produces from `application-state.ts`:
  - `type ApplicationStatus = 'DRAFT'|'SUBMITTED'|'UNDER_REVIEW'|'RESUBMISSION_REQUIRED'|'APPROVED'|'REJECTED'|'SUSPENDED'|'EXPIRED'`
  - `canTransition(from, to): boolean`
  - `assertTransition(from, to): void` (throws `apiError(409, ..., 'INVALID_TRANSITION')`)
- Produces from `application-gates.ts`:
  - `interface GateRequirement { docType: string; kind: 'DOCUMENT'|'PHOTO'; label: string; isRequired: boolean; requiresExpiry: boolean; subject: 'DRIVER'|'VEHICLE' }`
  - `interface GateDoc { docType: string; subject: 'DRIVER'|'VEHICLE'; status: 'PENDING'|'APPROVED'|'REJECTED'|'EXPIRED'|'RESUBMISSION_REQUIRED'; expiryDate: string | null }` (current, non-superseded rows only)
  - `interface GateProfile { legalName?: string|null; photoFileId?: string|null; dateOfBirth?: string|null; address?: string|null; city?: string|null; province?: string|null; emergencyContactName?: string|null; emergencyContactPhone?: string|null; licenceNumber?: string|null; licenceClass?: string|null; licenceAuthority?: string|null; licenceIssueDate?: string|null; licenceExpiryDate?: string|null; phoneVerifiedAt?: Date|string|null }`
  - `interface GateVehicle { category: string; plateNumber: string; make?: string|null; model?: string|null; manufactureYear?: number|null; color?: string|null } | null`
  - `interface GateResult { ok: boolean; blockers: { code: string; message: string }[]; message: string }`
  - `evaluateSubmitGate(input: { profile: GateProfile|null; vehicle: GateVehicle|null; requirements: GateRequirement[]; docs: GateDoc[]; today?: string }): GateResult`
  - `evaluateApprovalGate(same input): GateResult`

- [ ] **Step 1: Write failing tests**

`application-state.spec.ts`:

```ts
import { assertTransition, canTransition } from './application-state';

describe('application state machine', () => {
  it.each([
    ['DRAFT', 'SUBMITTED'],
    ['SUBMITTED', 'UNDER_REVIEW'],
    ['SUBMITTED', 'APPROVED'],
    ['UNDER_REVIEW', 'APPROVED'],
    ['UNDER_REVIEW', 'REJECTED'],
    ['UNDER_REVIEW', 'RESUBMISSION_REQUIRED'],
    ['RESUBMISSION_REQUIRED', 'SUBMITTED'],
    ['APPROVED', 'SUSPENDED'],
    ['APPROVED', 'EXPIRED'],
    ['SUSPENDED', 'APPROVED'],
    ['EXPIRED', 'SUBMITTED'],
    ['REJECTED', 'DRAFT'],
  ] as const)('%s -> %s is allowed', (a, b) => expect(canTransition(a, b)).toBe(true));

  it.each([
    ['DRAFT', 'APPROVED'],
    ['REJECTED', 'APPROVED'],
    ['APPROVED', 'DRAFT'],
    ['SUSPENDED', 'SUBMITTED'],
    ['EXPIRED', 'APPROVED'],
  ] as const)('%s -> %s is blocked', (a, b) => {
    expect(canTransition(a, b)).toBe(false);
    expect(() => assertTransition(a, b)).toThrow();
  });
});
```

`application-gates.spec.ts`:

```ts
import { evaluateApprovalGate, evaluateSubmitGate, type GateDoc, type GateRequirement } from './application-gates';

const req = (docType: string, over: Partial<GateRequirement> = {}): GateRequirement => ({
  docType, kind: 'DOCUMENT', label: docType, isRequired: true, requiresExpiry: false, subject: 'VEHICLE', ...over,
});
const doc = (docType: string, status: GateDoc['status'] = 'PENDING', over: Partial<GateDoc> = {}): GateDoc => ({
  docType, subject: 'VEHICLE', status, expiryDate: null, ...over,
});
const profile = {
  legalName: 'Ram Thapa', photoFileId: 'f1', dateOfBirth: '1995-02-01', address: 'Kathmandu', city: 'Kathmandu',
  province: 'Bagmati', emergencyContactName: 'Sita', emergencyContactPhone: '9800000000', licenceNumber: 'L-1',
  licenceClass: 'A', licenceAuthority: 'DoTM', licenceIssueDate: '2020-01-01', licenceExpiryDate: '2030-01-01',
  phoneVerifiedAt: new Date(),
};
const vehicle = { category: 'bike', plateNumber: 'BA1KHA1234', make: 'Bajaj', model: 'Pulsar', manufactureYear: 2020, color: 'Black' };
const requirements = [req('bluebook'), req('insurance', { requiresExpiry: true }), req('photo:front', { kind: 'PHOTO' })];
const today = '2026-09-21';

describe('evaluateSubmitGate', () => {
  it('passes with a complete draft', () => {
    const r = evaluateSubmitGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook'), doc('insurance', 'PENDING', { expiryDate: '2027-01-01' }), doc('photo:front')],
    });
    expect(r.ok).toBe(true);
  });
  it('blocks an expired licence with the exact user message', () => {
    const r = evaluateSubmitGate({ profile: { ...profile, licenceExpiryDate: '2026-01-01' }, vehicle, requirements, today, docs: [] });
    expect(r.blockers.map((b) => b.code)).toContain('LICENCE_EXPIRED');
    expect(r.blockers.find((b) => b.code === 'LICENCE_EXPIRED')!.message).toBe(
      'Your driving licence has expired. Please upload a valid licence.',
    );
  });
  it('blocks when phone is not verified, a doc is missing, or a doc has expired', () => {
    const r = evaluateSubmitGate({
      profile: { ...profile, phoneVerifiedAt: null }, vehicle, requirements, today,
      docs: [doc('insurance', 'PENDING', { expiryDate: '2026-01-01' })],
    });
    const codes = r.blockers.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['PHONE_NOT_VERIFIED', 'DOCUMENT_MISSING', 'DOCUMENT_EXPIRED']));
  });
  it('blocks when no vehicle is registered', () => {
    const r = evaluateSubmitGate({ profile, vehicle: null, requirements, today, docs: [] });
    expect(r.blockers.map((b) => b.code)).toContain('NO_VEHICLE');
  });
});

describe('evaluateApprovalGate', () => {
  it('reports pending documents with the spec message', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'APPROVED'), doc('insurance', 'PENDING', { expiryDate: '2027-01-01' }), doc('photo:front', 'PENDING')],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Application cannot be approved because 2 required documents are still pending.');
  });
  it('passes when every required item is APPROVED', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'APPROVED'), doc('insurance', 'APPROVED', { expiryDate: '2027-01-01' }), doc('photo:front', 'APPROVED')],
    });
    expect(r.ok).toBe(true);
    expect(r.message).toBe('');
  });
  it('ignores optional requirements', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, today, requirements: [req('bluebook'), req('pollution', { isRequired: false })],
      docs: [doc('bluebook', 'APPROVED')],
    });
    expect(r.ok).toBe(true);
  });
  it('counts rejected and missing separately', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'REJECTED')],
    });
    expect(r.message).toBe(
      'Application cannot be approved because 1 required document was rejected and 2 required documents are missing.',
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- application-state application-gates` -> FAIL (modules not found).

- [ ] **Step 3: Implement `application-state.ts`**

```ts
import { apiError } from '../../common/exceptions';

export type ApplicationStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'RESUBMISSION_REQUIRED'
  | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED';

const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'],
  RESUBMISSION_REQUIRED: ['SUBMITTED'],
  APPROVED: ['SUSPENDED', 'EXPIRED'],
  REJECTED: ['DRAFT'],
  SUSPENDED: ['APPROVED'],
  EXPIRED: ['SUBMITTED'],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    apiError(
      409,
      `This application is ${from.toLowerCase().replace(/_/g, ' ')} and cannot move to ${to.toLowerCase().replace(/_/g, ' ')}. Reload and try again.`,
      'INVALID_TRANSITION',
    );
  }
}
```

- [ ] **Step 4: Implement `application-gates.ts`**

```ts
export interface GateRequirement { docType: string; kind: 'DOCUMENT' | 'PHOTO'; label: string; isRequired: boolean; requiresExpiry: boolean; subject: 'DRIVER' | 'VEHICLE' }
export interface GateDoc { docType: string; subject: 'DRIVER' | 'VEHICLE'; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'RESUBMISSION_REQUIRED'; expiryDate: string | null }
export interface GateProfile {
  legalName?: string | null; photoFileId?: string | null; dateOfBirth?: string | null; address?: string | null;
  city?: string | null; province?: string | null; emergencyContactName?: string | null; emergencyContactPhone?: string | null;
  licenceNumber?: string | null; licenceClass?: string | null; licenceAuthority?: string | null;
  licenceIssueDate?: string | null; licenceExpiryDate?: string | null; phoneVerifiedAt?: Date | string | null;
}
export type GateVehicle = { category: string; plateNumber: string; make?: string | null; model?: string | null; manufactureYear?: number | null; color?: string | null } | null;
export interface GateBlocker { code: string; message: string }
export interface GateResult { ok: boolean; blockers: GateBlocker[]; message: string }
export interface GateInput { profile: GateProfile | null; vehicle: GateVehicle; requirements: GateRequirement[]; docs: GateDoc[]; today?: string }

const LICENCE_EXPIRED_MESSAGE = 'Your driving licence has expired. Please upload a valid licence.';
const isoToday = () => new Date().toISOString().slice(0, 10);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function baseChecks(input: GateInput): GateBlocker[] {
  const today = input.today ?? isoToday();
  const p = input.profile;
  const blockers: GateBlocker[] = [];

  if (!p?.phoneVerifiedAt) blockers.push({ code: 'PHONE_NOT_VERIFIED', message: 'Verify your mobile number with the OTP first.' });

  const personal: (keyof GateProfile)[] = ['legalName', 'photoFileId', 'dateOfBirth', 'address', 'city', 'province', 'emergencyContactName', 'emergencyContactPhone'];
  if (!p || personal.some((k) => !p[k])) blockers.push({ code: 'PROFILE_INCOMPLETE', message: 'Complete your personal information, including a profile photo.' });

  const licence: (keyof GateProfile)[] = ['licenceNumber', 'licenceClass', 'licenceAuthority', 'licenceIssueDate', 'licenceExpiryDate'];
  if (!p || licence.some((k) => !p[k])) {
    blockers.push({ code: 'LICENCE_INCOMPLETE', message: 'Complete your driving licence details.' });
  } else if (p.licenceExpiryDate! <= today) {
    blockers.push({ code: 'LICENCE_EXPIRED', message: LICENCE_EXPIRED_MESSAGE });
  }

  const v = input.vehicle;
  if (!v) blockers.push({ code: 'NO_VEHICLE', message: 'Add your vehicle details.' });
  else if (!v.plateNumber || !v.make || !v.model || !v.manufactureYear || !v.color) {
    blockers.push({ code: 'VEHICLE_INCOMPLETE', message: 'Complete your vehicle details.' });
  }

  for (const d of input.docs) {
    if (d.expiryDate && d.expiryDate <= today) {
      blockers.push({ code: 'DOCUMENT_EXPIRED', message: `The ${d.docType.replace(/[:_]/g, ' ')} has expired. Upload a valid one.` });
    }
  }
  return blockers;
}

function required(input: GateInput) {
  return input.requirements.filter((r) => r.isRequired);
}

export function evaluateSubmitGate(input: GateInput): GateResult {
  const blockers = baseChecks(input);
  for (const r of required(input)) {
    const cur = input.docs.find((d) => d.docType === r.docType && d.subject === r.subject);
    if (!cur) blockers.push({ code: 'DOCUMENT_MISSING', message: `Upload your ${r.label}.` });
    else if (r.requiresExpiry && !cur.expiryDate) blockers.push({ code: 'EXPIRY_REQUIRED', message: `Enter the expiry date for your ${r.label}.` });
  }
  return { ok: blockers.length === 0, blockers, message: blockers[0]?.message ?? '' };
}

export function evaluateApprovalGate(input: GateInput): GateResult {
  const blockers = baseChecks(input);
  let pending = 0, missing = 0, rejected = 0;
  for (const r of required(input)) {
    const cur = input.docs.find((d) => d.docType === r.docType && d.subject === r.subject);
    if (!cur) missing++;
    else if (cur.status === 'PENDING') pending++;
    else if (cur.status !== 'APPROVED') rejected++;
  }
  const parts: string[] = [];
  if (pending) parts.push(`${pending} required ${plural(pending, 'document is', 'documents are')} still pending`);
  if (rejected) parts.push(`${rejected} required ${plural(rejected, 'document was', 'documents were')} rejected`);
  if (missing) parts.push(`${missing} required ${plural(missing, 'document is', 'documents are')} missing`);
  for (const b of blockers) parts.push(b.message.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase()));
  const ok = parts.length === 0;
  return {
    ok,
    blockers: [...blockers, ...(pending || rejected || missing ? [{ code: 'DOCUMENTS_NOT_APPROVED', message: '' }] : [])],
    message: ok ? '' : `Application cannot be approved because ${parts.join(' and ')}.`,
  };
}
```

NOTE for the implementer: the "counts rejected and missing separately" test expects the sentence `1 required document was rejected and 2 required documents are missing` (rejected before missing, pending first), matching the `parts` order above, with no extra base-check parts for the fixture used. The DOCUMENTS_NOT_APPROVED blocker's message is empty by design; UI reads `message` for the sentence.

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- application-state application-gates` -> PASS.

### Task 3: Database schema and migration

**Files:**
- Modify: `server/src/database/schema.ts` (append tables/enums; add columns to `vehicles`; extend `userNotificationTypeEnum`; add indexes)
- Create (generated + hand edited): `server/drizzle/0026_driver_onboarding.sql` (name may differ; use the generated file)
- Test: `server/test/integration/driver-onboarding-schema.integration.spec.ts`

**Interfaces:**
- Produces schema exports (all in `schema.ts`): `applicationStatusEnum`, `reviewStatusEnum`, `offerStatusEnum`, `storedFiles`, `driverProfiles`, `driverApplications`, `applicationDocuments`, `documentRequirements`, `verificationReviews`, `rideOffers`, `phoneOtps`, `driverLocationLog`. New `vehicles` columns: `plateNormalized`, `make`, `model`, `manufactureYear`, `registrationYear`, `fuelType`, `serviceClass`. New notification enum values `driver_application`, `ride_offer`.

- [ ] **Step 1: Write the failing integration test**

```ts
import { createTestDb } from '../setup/test-db';
import { sql } from 'drizzle-orm';
import { documentRequirements, driverApplications, users, vehicles } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

describe('driver onboarding schema', () => {
  let db: Database; let close: () => Promise<void>;
  beforeEach(async () => { ({ db, close } = await createTestDb()); });
  afterEach(async () => { await close(); });

  const seedUser = async (idv: string, email: string, mobile: string) =>
    db.insert(users).values({ id: idv, name: idv, email, mobile, passwordHash: 'x', role: 'driver' });

  it('seeds document requirements for bike and car', async () => {
    const rows = await db.select().from(documentRequirements);
    const key = (r: { vehicleType: string; subject: string; docType: string }) => `${r.vehicleType}|${r.subject}|${r.docType}`;
    const keys = rows.map(key);
    expect(keys).toEqual(expect.arrayContaining([
      '|DRIVER|licence_front', '|DRIVER|licence_back', '|DRIVER|identity_front',
      'bike|VEHICLE|bluebook', 'bike|VEHICLE|insurance', 'bike|VEHICLE|photo:plate',
      'car|VEHICLE|bluebook', 'car|VEHICLE|insurance', 'car|VEHICLE|road_tax', 'car|VEHICLE|photo:interior',
    ]));
  });

  it('rejects two ACTIVE vehicles with the same normalized plate but allows reuse after soft delete', async () => {
    await seedUser('u1', 'a@t.l', '9800000001');
    await seedUser('u2', 'b@t.l', '9800000002');
    const base = { category: 'bike' as const, makeModel: 'x', maxWeightKg: 20, plateNormalized: 'BA1KHA1234' };
    await db.insert(vehicles).values({ id: 'v1', driverId: 'u1', plateNumber: 'BA 1 KHA 1234', ...base });
    await expect(
      db.insert(vehicles).values({ id: 'v2', driverId: 'u2', plateNumber: 'ba-1-kha-1234', ...base }),
    ).rejects.toThrow();
    await db.update(vehicles).set({ isActive: false }).where(sql`id = 'v1'`);
    await expect(
      db.insert(vehicles).values({ id: 'v3', driverId: 'u2', plateNumber: 'BA1KHA1234', ...base }),
    ).resolves.toBeDefined();
  });

  it('allows only one application per user', async () => {
    await seedUser('u1', 'a@t.l', '9800000001');
    await db.insert(driverApplications).values({ id: 'a1', userId: 'u1' });
    await expect(db.insert(driverApplications).values({ id: 'a2', userId: 'u1' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- driver-onboarding-schema` -> FAIL (imports missing).

- [ ] **Step 3: Extend `schema.ts`**

Add `date` to the `drizzle-orm/pg-core` import and `sql` to the `drizzle-orm` import (`import { relations, sql } from 'drizzle-orm';`). Append these definitions after the `driverStatus` table (they reference `users`, `vehicles`, `rides`, so place them below those definitions; enums may sit next to other enums only if no table dependency exists, so keep everything in one block below `driverStatus`):

```ts
/* ───────────────────── Driver onboarding & verification ───────────────────── */

export const applicationStatusEnum = pgEnum('application_status', [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED',
]);
export const reviewStatusEnum = pgEnum('review_status', ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'RESUBMISSION_REQUIRED']);
export const offerStatusEnum = pgEnum('offer_status', ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED']);
export const docSubjectEnum = pgEnum('doc_subject', ['DRIVER', 'VEHICLE']);

/** Private uploaded files. The bytes live in private storage, never in Postgres. */
export const storedFiles = pgTable('stored_files', {
  id: varchar('id', { length: 32 }).primaryKey(),
  ownerUserId: varchar('owner_user_id', { length: 32 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('stored_files_owner_idx').on(t.ownerUserId) }));

export const driverProfiles = pgTable('driver_profiles', {
  userId: varchar('user_id', { length: 32 }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  legalName: text('legal_name'),
  photoFileId: varchar('photo_file_id', { length: 32 }).references(() => storedFiles.id, { onDelete: 'set null' }),
  dateOfBirth: date('date_of_birth'),
  gender: varchar('gender', { length: 16 }),
  address: text('address'),
  city: varchar('city', { length: 80 }),
  province: varchar('province', { length: 40 }),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
  language: varchar('language', { length: 8 }),
  licenceNumber: varchar('licence_number', { length: 40 }),
  licenceClass: varchar('licence_class', { length: 16 }),
  licenceAuthority: text('licence_authority'),
  licenceIssueDate: date('licence_issue_date'),
  licenceExpiryDate: date('licence_expiry_date'),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const driverApplications = pgTable('driver_applications', {
  id: varchar('id', { length: 32 }).primaryKey(),
  userId: varchar('user_id', { length: 32 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: applicationStatusEnum('status').notNull().default('DRAFT'),
  currentStep: integer('current_step').notNull().default(1),
  vehicleId: varchar('vehicle_id', { length: 32 }).references(() => vehicles.id, { onDelete: 'set null' }),
  /** Drivers approved before this feature existed: document checks are skipped until they resubmit. */
  isLegacy: boolean('is_legacy').notNull().default(false),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: varchar('reviewed_by', { length: 64 }),
  rejectionReason: text('rejection_reason'),
  suspensionReason: text('suspension_reason'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: uniqueIndex('driver_applications_user_unique_idx').on(t.userId),
  statusIdx: index('driver_applications_status_idx').on(t.status, t.updatedAt),
}));

/** One row per upload. The "current" row per (application, scope, docType) is the one with superseded_by_id IS NULL. */
export const applicationDocuments = pgTable('application_documents', {
  id: varchar('id', { length: 32 }).primaryKey(),
  applicationId: varchar('application_id', { length: 32 }).notNull().references(() => driverApplications.id, { onDelete: 'cascade' }),
  subject: docSubjectEnum('subject').notNull(),
  /** 'driver' for driver documents, otherwise the vehicle id. Part of the current-row uniqueness key. */
  scope: varchar('scope', { length: 32 }).notNull(),
  vehicleId: varchar('vehicle_id', { length: 32 }).references(() => vehicles.id, { onDelete: 'set null' }),
  docType: varchar('doc_type', { length: 40 }).notNull(),
  fileId: varchar('file_id', { length: 32 }).notNull().references(() => storedFiles.id, { onDelete: 'restrict' }),
  expiryDate: date('expiry_date'),
  status: reviewStatusEnum('status').notNull().default('PENDING'),
  rejectionReason: text('rejection_reason'),
  reviewedBy: varchar('reviewed_by', { length: 64 }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  supersededById: varchar('superseded_by_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  currentIdx: uniqueIndex('application_documents_current_unique_idx')
    .on(t.applicationId, t.scope, t.docType)
    .where(sql`${t.supersededById} IS NULL`),
  statusIdx: index('application_documents_status_idx').on(t.status),
}));

/** Admin-editable requirement config. '' in vehicleType / serviceClass means "applies to all". */
export const documentRequirements = pgTable('document_requirements', {
  id: varchar('id', { length: 32 }).primaryKey(),
  vehicleType: varchar('vehicle_type', { length: 16 }).notNull().default(''),
  serviceClass: varchar('service_class', { length: 24 }).notNull().default(''),
  subject: docSubjectEnum('subject').notNull(),
  docType: varchar('doc_type', { length: 40 }).notNull(),
  kind: varchar('kind', { length: 8 }).notNull().default('DOCUMENT'), // DOCUMENT | PHOTO
  label: text('label').notNull(),
  isRequired: boolean('is_required').notNull().default(true),
  requiresExpiry: boolean('requires_expiry').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  uniq: uniqueIndex('document_requirements_unique_idx').on(t.vehicleType, t.serviceClass, t.subject, t.docType),
}));

export const verificationReviews = pgTable('verification_reviews', {
  id: varchar('id', { length: 32 }).primaryKey(),
  applicationId: varchar('application_id', { length: 32 }).notNull().references(() => driverApplications.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 16 }).notNull(), // APPLICATION | DOCUMENT | VEHICLE | DRIVER | NOTE
  targetId: varchar('target_id', { length: 32 }),
  action: varchar('action', { length: 40 }).notNull(),
  fromStatus: varchar('from_status', { length: 32 }),
  toStatus: varchar('to_status', { length: 32 }),
  reason: text('reason'),
  adminId: varchar('admin_id', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ appIdx: index('verification_reviews_app_idx').on(t.applicationId, t.createdAt) }));

export const rideOffers = pgTable('ride_offers', {
  id: varchar('id', { length: 32 }).primaryKey(),
  rideId: varchar('ride_id', { length: 32 }).notNull().references(() => rides.id, { onDelete: 'cascade' }),
  driverId: varchar('driver_id', { length: 32 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: offerStatusEnum('status').notNull().default('PENDING'),
  round: integer('round').notNull().default(1),
  pickupDistanceM: integer('pickup_distance_m').notNull(),
  etaMin: integer('eta_min').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  rideDriverIdx: uniqueIndex('ride_offers_ride_driver_unique_idx').on(t.rideId, t.driverId),
  driverStatusIdx: index('ride_offers_driver_status_idx').on(t.driverId, t.status),
  expiryIdx: index('ride_offers_status_expiry_idx').on(t.status, t.expiresAt),
}));

export const phoneOtps = pgTable('phone_otps', {
  id: varchar('id', { length: 32 }).primaryKey(),
  userId: varchar('user_id', { length: 32 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  phone: varchar('phone', { length: 20 }).notNull(),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userCreatedIdx: index('phone_otps_user_created_idx').on(t.userId, t.createdAt) }));

/** Sampled location history: written on ride lifecycle events only, never per GPS ping. */
export const driverLocationLog = pgTable('driver_location_log', {
  id: varchar('id', { length: 32 }).primaryKey(),
  driverId: varchar('driver_id', { length: 32 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  rideId: varchar('ride_id', { length: 32 }).references(() => rides.id, { onDelete: 'set null' }),
  event: varchar('event', { length: 24 }).notNull(), // ONLINE | OFFLINE | ACCEPTED | STARTED | COMPLETED
  lat: numeric('lat', { precision: 10, scale: 7 }).notNull(),
  lng: numeric('lng', { precision: 10, scale: 7 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ driverIdx: index('driver_location_log_driver_idx').on(t.driverId, t.createdAt) }));
```

In the `vehicles` table add columns and swap the plate index:

```ts
    plateNormalized: varchar('plate_normalized', { length: 24 }).notNull(),
    make: varchar('make', { length: 40 }),
    model: varchar('model', { length: 40 }),
    manufactureYear: integer('manufacture_year'),
    registrationYear: integer('registration_year'),
    fuelType: varchar('fuel_type', { length: 16 }),
    serviceClass: varchar('service_class', { length: 24 }),
```
and in the index block replace `plateIdx: uniqueIndex('vehicles_plate_unique_idx').on(t.plateNumber)` with:
```ts
    plateActiveIdx: uniqueIndex('vehicles_plate_normalized_active_unique_idx')
      .on(t.plateNormalized)
      .where(sql`${t.isActive} = true`),
```
`plateNormalized` is `notNull` with no default, so every `insert(vehicles)` in the codebase must now provide it (Task 4 fixes the only call site, `VehiclesService.register`). Add to `rides` indexes:
```ts
    oneActivePerDriver: uniqueIndex('rides_one_active_per_driver_idx')
      .on(t.driverId)
      .where(sql`${t.status} IN ('ACCEPTED','ONGOING','PAYMENT_PENDING')`),
```
Append `'driver_application', 'ride_offer'` to the end of `userNotificationTypeEnum`.

- [ ] **Step 4: Generate and hand-edit the migration**

Run: `npm run db:generate` (needs `DATABASE_URL` set to any value; drizzle-kit generate does not connect). Open the new `drizzle/0026_*.sql` and make these edits:

1. For the `vehicles.plate_normalized` column: change the generated `ADD COLUMN "plate_normalized" varchar(24) NOT NULL` into three statements, each separated by `--> statement-breakpoint`:
```sql
ALTER TABLE "vehicles" ADD COLUMN "plate_normalized" varchar(24);
--> statement-breakpoint
UPDATE "vehicles" SET "plate_normalized" = regexp_replace(upper("plate_number"), '[^A-Z0-9]', '', 'g');
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "plate_normalized" SET NOT NULL;
```
2. Ensure `DROP INDEX "vehicles_plate_unique_idx"` appears before the new unique index is created.
3. Append seeds (configuration, not mock data). IDs are fixed strings:

```sql
--> statement-breakpoint
INSERT INTO "document_requirements" ("id","vehicle_type","service_class","subject","doc_type","kind","label","is_required","requires_expiry","sort_order") VALUES
 ('req_lic_front','','','DRIVER','licence_front','DOCUMENT','driving licence (front)',true,false,1),
 ('req_lic_back','','','DRIVER','licence_back','DOCUMENT','driving licence (back)',true,false,2),
 ('req_id_front','','','DRIVER','identity_front','DOCUMENT','citizenship or national ID (front)',true,false,3),
 ('req_id_back','','','DRIVER','identity_back','DOCUMENT','citizenship or national ID (back)',false,false,4),
 ('req_bike_bluebook','bike','','VEHICLE','bluebook','DOCUMENT','vehicle registration (bluebook)',true,false,1),
 ('req_bike_insurance','bike','','VEHICLE','insurance','DOCUMENT','vehicle insurance',true,true,2),
 ('req_bike_p_front','bike','','VEHICLE','photo:front','PHOTO','front photo',true,false,10),
 ('req_bike_p_side','bike','','VEHICLE','photo:side','PHOTO','side photo',true,false,11),
 ('req_bike_p_rear','bike','','VEHICLE','photo:rear','PHOTO','rear photo',true,false,12),
 ('req_bike_p_plate','bike','','VEHICLE','photo:plate','PHOTO','number plate photo',true,false,13),
 ('req_car_bluebook','car','','VEHICLE','bluebook','DOCUMENT','vehicle registration (bluebook)',true,false,1),
 ('req_car_insurance','car','','VEHICLE','insurance','DOCUMENT','vehicle insurance',true,true,2),
 ('req_car_roadtax','car','','VEHICLE','road_tax','DOCUMENT','road tax receipt',true,true,3),
 ('req_car_p_front','car','','VEHICLE','photo:front','PHOTO','front photo',true,false,10),
 ('req_car_p_rear','car','','VEHICLE','photo:rear','PHOTO','rear photo',true,false,11),
 ('req_car_p_left','car','','VEHICLE','photo:left','PHOTO','left side photo',true,false,12),
 ('req_car_p_right','car','','VEHICLE','photo:right','PHOTO','right side photo',true,false,13),
 ('req_car_p_interior','car','','VEHICLE','photo:interior','PHOTO','interior photo',true,false,14),
 ('req_car_p_plate','car','','VEHICLE','photo:plate','PHOTO','number plate photo',true,false,15);
--> statement-breakpoint
INSERT INTO "driver_applications" ("id","user_id","status","current_step","is_legacy","reviewed_at")
 SELECT 'app_legacy_' || substr("id", 3), "id", 'APPROVED', 8, true, now() FROM "users"
 WHERE "role" = 'driver' AND "kyc_status" = 'APPROVED';
```
The last statement grandfathers every already-approved driver so the new eligibility check does not lock out live drivers. The unique ride index will fail loudly if two active rides already share a driver; resolve those rows manually before migrating.

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- driver-onboarding-schema` -> PASS. Then run `npm test` (whole server suite) to ensure existing integration tests still pass with the new migration, and `npx tsc --noEmit -p tsconfig.json` to surface any `insert(vehicles)` call missing `plateNormalized` (expect exactly `vehicles.service.ts`).

### Task 4: Vehicle service uses normalized plates (legacy path)

**Files:**
- Modify: `server/src/modules/vehicles/vehicles.service.ts` (`register`, `update`)
- Test: `server/test/integration/vehicles-plate.integration.spec.ts`

**Interfaces:**
- Consumes: `normalizePlate`, `isValidNepalPlate` from Task 1.

- [ ] **Step 1: Write the failing test**

```ts
import { createTestDb } from '../setup/test-db';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { users } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

describe('VehiclesService plate rules', () => {
  let db: Database; let close: () => Promise<void>; let svc: VehiclesService;
  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    svc = new VehiclesService(db, new NotificationsService(db));
    for (const [i, idv] of ['u1', 'u2'].entries()) {
      await db.insert(users).values({ id: idv, name: idv, email: `${idv}@t.l`, mobile: `980000000${i}`, passwordHash: 'x', role: 'driver' });
    }
  });
  afterEach(async () => { await close(); });

  const dto = { category: 'bike' as const, makeModel: 'Bajaj Pulsar', plateNumber: 'BA 99 PA 1234' };

  it('stores the normalized plate and rejects the same plate in another format', async () => {
    const v = await svc.register('u1', dto);
    expect(v.plateNumber).toBe('BA 99 PA 1234');
    await expect(svc.register('u2', { ...dto, plateNumber: 'ba-99-pa-1234' })).rejects.toMatchObject({ status: 409 });
    await expect(svc.register('u2', { ...dto, plateNumber: 'BA99PA1234' })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a malformed plate with a friendly 400', async () => {
    await expect(svc.register('u1', { ...dto, plateNumber: '1234' })).rejects.toMatchObject({ status: 400 });
  });

  it('frees the plate after the first vehicle is removed', async () => {
    const v = await svc.register('u1', dto);
    await svc.remove('u1', v.id);
    await expect(svc.register('u2', dto)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- vehicles-plate` -> FAIL (plate stored un-normalized / no 400).

- [ ] **Step 3: Implement**

In `vehicles.service.ts` import the helpers and add a private method:

```ts
import { isValidNepalPlate, normalizePlate } from '../driver-onboarding/plate.util';

private async assertPlateUsable(plateNumber: string, exceptVehicleId?: string) {
  const normalized = normalizePlate(plateNumber);
  if (!isValidNepalPlate(normalized)) {
    apiError(400, 'Enter a valid number plate, for example BA 99 PA 1234.', 'INVALID_PLATE');
  }
  const [existing] = await this.db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.plateNormalized, normalized), eq(vehicles.isActive, true)))
    .limit(1);
  if (existing && existing.id !== exceptVehicleId) {
    apiError(409, 'A vehicle with this number plate is already registered.', 'PLATE_TAKEN');
  }
  return normalized;
}
```
In `register`: replace the manual duplicate check with `const plateNormalized = await this.assertPlateUsable(dto.plateNumber);` and add `plateNormalized` to the insert values. In `update`, when `dto.plateNumber` changed, call `assertPlateUsable(dto.plateNumber, vehicleId)` and include `plateNormalized` in `set`. Also catch the unique-violation (`code === '23505'`) around the insert and rethrow as the same 409 so a concurrent duplicate never surfaces a raw DB error.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- vehicles-plate` -> PASS.

### Task 5: Private file storage and secure download

**Files:**
- Create: `driver-onboarding/files/file-validation.ts`, `storage.service.ts`, `files.controller.ts`
- Test: `driver-onboarding/files/file-validation.spec.ts`, `test/integration/stored-files.integration.spec.ts`

**Interfaces:**
- Produces:
  - `validateUpload(file: {buffer: Buffer; mimetype: string; size: number}, opts?: {imagesOnly?: boolean}): { mime: 'image/jpeg'|'image/png'|'image/webp'|'application/pdf'; ext: string }` (throws `apiError(400)` with a friendly message; checks declared mime, 5 MB cap, magic bytes).
  - `abstract class StorageBackend { abstract put(key: string, data: Buffer): Promise<void>; abstract read(key: string): Promise<Buffer>; abstract remove(key: string): Promise<void> }` and `LocalPrivateStorage` implementation (dir from `UPLOAD_PRIVATE_DIR`, default `<cwd>/private-uploads`).
  - `StorageService.save(ownerUserId: string, file: Express.Multer.File, opts?): Promise<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>`, `StorageService.readForUser(fileId, requester: {kind:'user'|'admin'; id: string}): Promise<{ buffer: Buffer; mimeType: string; originalName: string }>` (403 unless `kind==='admin'` or `ownerUserId===id`), `StorageService.remove(fileId)`.
  - Routes: `GET /driver/files/:id` (JwtAuthGuard + role driver, owner only), `GET /super-admin/files/:id` (SuperAdminAuthGuard). Both stream with headers `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="..."`.

- [ ] **Step 1: Write the failing tests**

`file-validation.spec.ts`:

```ts
import { validateUpload } from './file-validation';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(100)]);

describe('validateUpload', () => {
  it('accepts real jpeg/png/pdf', () => {
    expect(validateUpload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }).ext).toBe('jpg');
    expect(validateUpload({ buffer: png, mimetype: 'image/png', size: png.length }).ext).toBe('png');
    expect(validateUpload({ buffer: pdf, mimetype: 'application/pdf', size: pdf.length }).mime).toBe('application/pdf');
  });
  it('rejects a mismatched mime/magic (exe renamed .jpg)', () => {
    expect(() => validateUpload({ buffer: Buffer.from('MZ....'), mimetype: 'image/jpeg', size: 6 })).toThrow();
  });
  it('rejects files over 5 MB and non-images when imagesOnly', () => {
    expect(() => validateUpload({ buffer: jpeg, mimetype: 'image/jpeg', size: 6 * 1024 * 1024 })).toThrow();
    expect(() => validateUpload({ buffer: pdf, mimetype: 'application/pdf', size: pdf.length }, { imagesOnly: true })).toThrow();
  });
});
```

`stored-files.integration.spec.ts` (uses an in-memory `StorageBackend` fake):

```ts
import { createTestDb } from '../setup/test-db';
import { StorageService } from '../../src/modules/driver-onboarding/files/storage.service';
import { StorageBackend } from '../../src/modules/driver-onboarding/files/storage.service';
import { users } from '../../src/database/schema';

class MemoryBackend extends StorageBackend {
  m = new Map<string, Buffer>();
  async put(k: string, d: Buffer) { this.m.set(k, d); }
  async read(k: string) { return this.m.get(k)!; }
  async remove(k: string) { this.m.delete(k); }
}
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const file = (): Express.Multer.File => ({ buffer: jpeg, mimetype: 'image/jpeg', originalname: 'a.jpg', size: jpeg.length } as Express.Multer.File);

describe('StorageService access control', () => {
  it('lets the owner and admins read, and blocks other users', async () => {
    const { db, close } = await createTestDb();
    const svc = new StorageService(db, new MemoryBackend());
    for (const [i, idv] of ['u1', 'u2'].entries()) {
      await db.insert(users).values({ id: idv, name: idv, email: `${idv}@t.l`, mobile: `980000000${i}`, passwordHash: 'x', role: 'driver' });
    }
    const saved = await svc.save('u1', file());
    expect((await svc.readForUser(saved.id, { kind: 'user', id: 'u1' })).mimeType).toBe('image/jpeg');
    expect((await svc.readForUser(saved.id, { kind: 'admin', id: 'sa_1' })).buffer.length).toBe(jpeg.length);
    await expect(svc.readForUser(saved.id, { kind: 'user', id: 'u2' })).rejects.toMatchObject({ status: 403 });
    await close();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- file-validation stored-files` -> FAIL.

- [ ] **Step 3: Implement**

`file-validation.ts`: sniff signatures (`FF D8 FF` jpeg, `89 50 4E 47 0D 0A 1A 0A` png, `52 49 46 46 .... 57 45 42 50` webp, `25 50 44 46` pdf), require the sniffed type equals the declared mimetype, enforce `size <= 5*1024*1024`, and throw `apiError(400, 'Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.', 'INVALID_FILE')`. With `imagesOnly` a PDF is rejected with `'Please upload a photo (JPG, PNG or WEBP).'`.

`storage.service.ts`: `StorageBackend` abstract class, `LocalPrivateStorage` (`mkdir -p`, write/read/unlink using `join(root, key)`, reject keys containing `..`), and `StorageService` with `save` (validate -> run `ModerationService.checkImage` for images when injected -> `key = ${yyyy}/${mm}/${id('file')}.${ext}` -> `backend.put` -> insert `storedFiles`) and `readForUser` per the interface above. Inject `StorageBackend` via a provider token so tests pass a memory fake; `ModerationService` is optional (`@Optional()`), and moderation only runs when provided (reuse `common/moderation/moderation.service.ts`; look at how `driver-documents.service.ts` calls it and copy that usage exactly).

`files.controller.ts`: two controllers using `@Res() res` with `res.set({...}).send(buffer)`.

- [ ] **Step 4: Run to verify pass** — `npm test -- file-validation stored-files` -> PASS.

### Task 6: Phone OTP service

**Files:**
- Create: `driver-onboarding/otp/{sms.provider.ts,console-sms.provider.ts,sparrow-sms.provider.ts,otp.service.ts,otp.controller.ts}`
- Test: `test/integration/otp.integration.spec.ts`

**Interfaces:**
- Produces:
  - `abstract class SmsProvider { abstract send(to: string, text: string): Promise<void> }`
  - `OtpService.send(userId: string): Promise<{ sentTo: string; expiresInSeconds: number }>`; `OtpService.verify(userId: string, code: string): Promise<{ verified: true }>` (sets `driver_profiles.phone_verified_at`, creating the profile row if absent).
  - Routes: `POST /driver/otp/send` (`@Throttle 3/min`), `POST /driver/otp/verify` (`@Throttle 10/min`), both `JwtAuthGuard + RolesGuard @Roles('driver')`; verify body `{ code: string }` (6 digits).
  - Env: `SMS_PROVIDER` (`sparrow`|`console`, default `console` when not production), `SPARROW_SMS_TOKEN`, `SPARROW_SMS_FROM`.

Rules: code is 6 random digits (`crypto.randomInt`), stored as `sha256(userId + ':' + code)`; TTL 5 min; at most 3 sends per rolling 10 min per user (429 `OTP_RATE_LIMIT`, message "Too many codes requested. Try again in a few minutes."); at most 5 verify attempts per code (then the code is burned, 429 `OTP_ATTEMPTS`); a new send invalidates older unconsumed codes; a consumed or expired code fails with "That code is invalid or has expired."; `ConsoleSmsProvider` throws at construction when `NODE_ENV==='production'`.

- [ ] **Step 1: Write the failing test**

```ts
import { createTestDb } from '../setup/test-db';
import { OtpService } from '../../src/modules/driver-onboarding/otp/otp.service';
import { SmsProvider } from '../../src/modules/driver-onboarding/otp/sms.provider';
import { driverProfiles, users } from '../../src/database/schema';
import { eq } from 'drizzle-orm';

class CaptureSms extends SmsProvider {
  sent: { to: string; text: string }[] = [];
  async send(to: string, text: string) { this.sent.push({ to, text }); }
  lastCode() { return /(\d{6})/.exec(this.sent[this.sent.length - 1].text)![1]; }
}

describe('OtpService', () => {
  const setup = async () => {
    const { db, close } = await createTestDb();
    await db.insert(users).values({ id: 'u1', name: 'A', email: 'a@t.l', mobile: '9812345678', passwordHash: 'x', role: 'driver' });
    const sms = new CaptureSms();
    return { db, close, sms, svc: new OtpService(db, sms) };
  };

  it('sends to the account mobile and verifies the phone', async () => {
    const { db, close, sms, svc } = await setup();
    const r = await svc.send('u1');
    expect(r.sentTo).toBe('98*****678');
    expect(sms.sent[0].to).toBe('9812345678');
    await expect(svc.verify('u1', '000000')).rejects.toMatchObject({ status: 400 });
    await expect(svc.verify('u1', sms.lastCode())).resolves.toEqual({ verified: true });
    const [p] = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, 'u1'));
    expect(p.phoneVerifiedAt).not.toBeNull();
    await close();
  });

  it('blocks reuse of a consumed code', async () => {
    const { close, sms, svc } = await setup();
    await svc.send('u1');
    const code = sms.lastCode();
    await svc.verify('u1', code);
    await expect(svc.verify('u1', code)).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('limits sends to 3 per 10 minutes', async () => {
    const { close, svc } = await setup();
    await svc.send('u1'); await svc.send('u1'); await svc.send('u1');
    await expect(svc.send('u1')).rejects.toMatchObject({ status: 429 });
    await close();
  });

  it('burns the code after 5 wrong attempts', async () => {
    const { close, sms, svc } = await setup();
    await svc.send('u1');
    const good = sms.lastCode();
    for (let i = 0; i < 5; i++) await expect(svc.verify('u1', '111111')).rejects.toBeDefined();
    await expect(svc.verify('u1', good)).rejects.toMatchObject({ status: 429 });
    await close();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- otp.integration` -> FAIL.
- [ ] **Step 3: Implement** the service per the rules above. `SparrowSmsProvider.send` does `POST https://api.sparrowsms.com/v2/sms/` with form fields `token`, `from`, `to`, `text` and throws a friendly `apiError(502, 'We could not send the SMS right now. Please try again.')` on a non-200 `response_code`. Note in the module doc comment that the Sparrow request shape must be confirmed against live credentials before go-live.
- [ ] **Step 4: Run to verify pass** — `npm test -- otp.integration` -> PASS.

### Task 7: Driver auth changes (register + login)

**Files:**
- Modify: `server/src/modules/auth/auth.service.ts` (`register` ~L133-175, `login` ~L250)
- Test: extend `server/test/integration/auth-register.integration.spec.ts`

**Interfaces:** For `role='driver'` only: `register` issues tokens (returns the same shape as the customer branch) with `kycStatus: 'PENDING'`, creates a `driver_applications` row (`DRAFT`) and a `driver_profiles` row, and still notifies the super admin; `login` no longer throws for PENDING or SUSPENDED when `user.role==='driver'`. All other roles unchanged.

- [ ] **Step 1: Write failing tests** (add to the existing describe):

```ts
it('registers a driver, issues tokens, and creates a DRAFT application', async () => {
  const r = await auth.register({ ...baseDto, email: 'drv@example.com', mobile: '9833333333', role: 'driver' });
  if (!issuedTokens(r)) throw new Error('driver should get tokens');
  expect(r.user.kycStatus).toBe('PENDING');
});

it('lets a PENDING driver log in but still blocks a PENDING hotel partner', async () => {
  await auth.register({ ...baseDto, email: 'drv@example.com', mobile: '9833333333', role: 'driver' });
  await auth.register({ ...baseDto, email: 'h@example.com', mobile: '9844444444', role: 'hotel' });
  await expect(auth.login({ email: 'drv@example.com', password: 'password123' })).resolves.toHaveProperty('accessToken');
  await expect(auth.login({ email: 'h@example.com', password: 'password123' })).rejects.toMatchObject({ status: 403 });
});
```
Update the existing test "registers a partner role (e.g. hotel)..." only if it uses `role: 'driver'` (it uses hotel; leave as is).

- [ ] **Step 2: Run to verify failure** — `npm test -- auth-register` -> FAIL for the two new tests.
- [ ] **Step 3: Implement** — in `register`, compute `const isDriver = dto.role === 'driver'` and `isPartner = PARTNER_ROLES.includes(role) && !isDriver`; insert with `kycStatus: isPartner || isDriver ? 'PENDING' : 'APPROVED'`; for drivers insert `driverApplications` and `driverProfiles` rows in the same flow, notify the super admin ("New driver started an application"), then fall through to the token-issuing tail. In `login`, wrap the two kycStatus throws in `if (user.role !== 'driver') { ... }`.
- [ ] **Step 4: Run to verify pass** — `npm test -- auth-register` -> PASS (all existing cases too).

### Task 8: Requirements service and driver application service

**Files:**
- Create: `driver-onboarding/requirements.service.ts`, `application.service.ts`, `dto/application.dto.ts`
- Test: `test/integration/driver-application.integration.spec.ts`

**Interfaces:**
- Produces `RequirementsService.forVehicle(vehicleType: 'bike'|'car'|null, serviceClass?: string): Promise<(GateRequirement & { id: string; sortOrder: number; serviceClass: string })[]>` — driver rows plus vehicle rows where `vehicleType` is `''` or equals the type, and `serviceClass` is `''` or equals the class; ordered by `subject, sortOrder`.
- Produces `ApplicationService`:
  - `getOrCreate(userId): Promise<ApplicationView>` where
    `ApplicationView = { application: {id,status,currentStep,version,rejectionReason,suspensionReason,submittedAt,isLegacy}; profile: DriverProfileRow|null; vehicle: VehicleRow|null; requirements: (Requirement & { current: CurrentDocView | null })[]; blockers: GateBlocker[]; canSubmit: boolean; statusMessage: string; eligibility: { eligible: boolean; reasons: {code:string;message:string}[] } | null }`
    and `CurrentDocView = { id: string; status: ReviewStatus; rejectionReason: string|null; expiryDate: string|null; fileId: string; originalName: string; mimeType: string; uploadedAt: string }`.
  - `saveProfile(userId, dto: SaveProfileDto): Promise<ApplicationView>` (partial personal + licence fields; only while status is `DRAFT`, `RESUBMISSION_REQUIRED`, or `EXPIRED`, otherwise 409 `LOCKED`; sets `currentStep`).
  - `saveVehicle(userId, dto: SaveVehicleDto): Promise<ApplicationView>` (create or update the application's vehicle; category limited to `bike|car`; calls the same plate rules as Task 4; changing category while docs exist supersedes nothing but re-evaluates requirements).
  - `uploadFile(userId, input: { docType: string; expiryDate?: string; file: Express.Multer.File }): Promise<ApplicationView>` — `docType === 'profile_photo'` sets `driver_profiles.photoFileId` (images only); otherwise the doc type must exist in `forVehicle(...)` for the driver's vehicle (vehicle-scope doc types require a saved vehicle); saves the file, inserts a new `application_documents` row with status PENDING and marks the previous current row `supersededById=<new id>`; replacement is allowed only when the application is `DRAFT|RESUBMISSION_REQUIRED|EXPIRED` or the current doc's status is `REJECTED|EXPIRED|RESUBMISSION_REQUIRED`; a doc whose requirement `requiresExpiry` must carry a future `expiryDate` else 400.
  - `deleteFile(userId, docId)`: only in `DRAFT`; removes the row and the stored file.
  - `submit(userId): Promise<ApplicationView>` — allowed from `DRAFT|RESUBMISSION_REQUIRED|EXPIRED`; runs `evaluateSubmitGate` (400 with `blockers` in the body `code: 'SUBMIT_BLOCKED'` and the first blocker message) then `assertTransition(..., 'SUBMITTED')`; sets `submittedAt`, `version+1`; rejected docs must all have a newer PENDING replacement before resubmit (else blocker `DOCUMENT_REJECTED` "Replace the rejected {label} first."); writes a `verification_reviews` row (`action: 'SUBMITTED'`), notifies the driver (`notifyUser`, type `driver_application`, title "Application submitted") and the super admin (`notifications.notify` type `partner_registration`... use `system` type if `partner_registration` is unsuitable).
  - `statusMessage` mapping (used by the UI): DRAFT "Finish your application to start driving with ZamZam."; SUBMITTED "Your application is submitted and waiting for review."; UNDER_REVIEW "Your application is under review."; RESUBMISSION_REQUIRED `"{first rejected label} was rejected: {reason}. Please upload a new one."` (falls back to "Some items need to be updated."); APPROVED "Your ZamZam Driver account has been approved."; REJECTED `"Your application was rejected: {reason}"`; SUSPENDED `"Your account is suspended: {reason}"`; EXPIRED "A licence or document has expired. Upload a valid one to continue."

- [ ] **Step 1: Write the failing integration tests**

```ts
import { createTestDb } from '../setup/test-db';
import { ApplicationService } from '../../src/modules/driver-onboarding/application.service';
import { RequirementsService } from '../../src/modules/driver-onboarding/requirements.service';
import { StorageBackend, StorageService } from '../../src/modules/driver-onboarding/files/storage.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { applicationDocuments, driverApplications, driverProfiles, users } from '../../src/database/schema';
import { eq } from 'drizzle-orm';

class MemoryBackend extends StorageBackend {
  m = new Map<string, Buffer>();
  async put(k: string, d: Buffer) { this.m.set(k, d); }
  async read(k: string) { return this.m.get(k)!; }
  async remove(k: string) { this.m.delete(k); }
}
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const file = (name = 'a.jpg') => ({ buffer: jpeg, mimetype: 'image/jpeg', originalname: name, size: jpeg.length }) as Express.Multer.File;

const personal = { legalName: 'Ram Thapa', dateOfBirth: '1995-02-01', gender: 'male', address: 'Baneshwor', city: 'Kathmandu', province: 'Bagmati', emergencyContactName: 'Sita Thapa', emergencyContactPhone: '9800000000' };
const licence = { licenceNumber: 'L-100', licenceClass: 'A', licenceAuthority: 'DoTM Kathmandu', licenceIssueDate: '2020-01-01', licenceExpiryDate: '2032-01-01' };
const bike = { category: 'bike' as const, plateNumber: 'BA 1 KHA 1234', make: 'Bajaj', model: 'Pulsar 150', manufactureYear: 2020, registrationYear: 2020, color: 'Black', fuelType: 'petrol' };

async function setup() {
  const { db, close } = await createTestDb();
  const storage = new StorageService(db, new MemoryBackend());
  const notes = new NotificationsService(db);
  const svc = new ApplicationService(db, new RequirementsService(db), storage, notes);
  await db.insert(users).values({ id: 'u1', name: 'Ram', email: 'r@t.l', mobile: '9812345678', passwordHash: 'x', role: 'driver' });
  await db.insert(users).values({ id: 'u2', name: 'Hari', email: 'h@t.l', mobile: '9812345679', passwordHash: 'x', role: 'driver' });
  return { db, close, svc };
}

async function completeDraft(svc: ApplicationService, db: any, userId: string, plate = bike.plateNumber) {
  await db.insert(driverProfiles).values({ userId }).onConflictDoNothing();
  await db.update(driverProfiles).set({ phoneVerifiedAt: new Date() }).where(eq(driverProfiles.userId, userId));
  await svc.getOrCreate(userId);
  await svc.saveProfile(userId, { ...personal, ...licence });
  await svc.uploadFile(userId, { docType: 'profile_photo', file: file() });
  await svc.saveVehicle(userId, { ...bike, plateNumber: plate });
  for (const t of ['licence_front', 'licence_back', 'identity_front']) await svc.uploadFile(userId, { docType: t, file: file() });
  await svc.uploadFile(userId, { docType: 'bluebook', file: file() });
  await svc.uploadFile(userId, { docType: 'insurance', expiryDate: '2030-01-01', file: file() });
  for (const t of ['front', 'side', 'rear', 'plate']) await svc.uploadFile(userId, { docType: `photo:${t}`, file: file() });
}

describe('ApplicationService', () => {
  it('starts as DRAFT and lists the bike requirements after a vehicle is saved', async () => {
    const { svc, close } = await setup();
    const v0 = await svc.getOrCreate('u1');
    expect(v0.application.status).toBe('DRAFT');
    await svc.saveVehicle('u1', bike);
    const v1 = await svc.getOrCreate('u1');
    expect(v1.requirements.map((r) => r.docType)).toEqual(expect.arrayContaining(['bluebook', 'insurance', 'photo:plate', 'licence_front']));
    expect(v1.requirements.some((r) => r.docType === 'road_tax')).toBe(false);
    await close();
  });

  it('refuses to submit an incomplete draft with a friendly message', async () => {
    const { svc, close } = await setup();
    await svc.getOrCreate('u1');
    await expect(svc.submit('u1')).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('refuses an expired licence', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.saveProfile('u1', { licenceExpiryDate: '2020-01-01' });
    await expect(svc.submit('u1')).rejects.toMatchObject({ response: { message: 'Your driving licence has expired. Please upload a valid licence.' } });
    await close();
  });

  it('submits a complete draft -> SUBMITTED and locks editing', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    const v = await svc.submit('u1');
    expect(v.application.status).toBe('SUBMITTED');
    await expect(svc.saveProfile('u1', { city: 'Pokhara' })).rejects.toMatchObject({ status: 409 });
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

  it('requires an expiry date for insurance', async () => {
    const { svc, close } = await setup();
    await svc.getOrCreate('u1'); await svc.saveVehicle('u1', bike);
    await expect(svc.uploadFile('u1', { docType: 'insurance', file: file() })).rejects.toMatchObject({ status: 400 });
    await close();
  });

  it('does not let a submitted driver silently replace an approved/pending document', async () => {
    const { svc, db, close } = await setup();
    await completeDraft(svc, db, 'u1');
    await svc.submit('u1');
    await expect(svc.uploadFile('u1', { docType: 'bluebook', file: file() })).rejects.toMatchObject({ status: 409 });
    await close();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- driver-application` -> FAIL.
- [ ] **Step 3: Implement** `RequirementsService`, `ApplicationService`, DTOs (`SaveProfileDto`, `SaveVehicleDto` with class-validator: dates `IsISO8601({strict:true})`, `manufactureYear` between 1990 and current year + 1, `category` `IsIn(['bike','car'])`, emergency phone `Matches(/^[0-9]{7,15}$/)`, strings trimmed and length-limited). Vehicle persistence rules: one vehicle per application (`driver_applications.vehicleId`); if a vehicle exists, update it while the application is editable, else create with `verificationStatus 'PENDING'`, `isActive true`, `makeModel = `${make} ${model}``, `maxWeightKg` from the same defaults as `VehiclesService`, `seats` from dto or bike 1 / car 4; the plate check is the shared `assertPlateUsable` logic (extract it into `driver-onboarding/plate.service.ts` used by both services, or export a function taking a `db` executor). The aggregate `getOrCreate` builds `ApplicationView` by loading: application (insert if absent using `onConflictDoNothing` on the user unique index, then re-select), profile, vehicle, current docs (`supersededById IS NULL`) joined with `storedFiles`, requirements, gate blockers via `evaluateSubmitGate`.
- [ ] **Step 4: Run to verify pass** — `npm test -- driver-application` -> PASS.

### Task 9: Driver application controller

**Files:**
- Create: `driver-onboarding/application.controller.ts`, `otp/otp.controller.ts` (if not done in Task 6), `driver-onboarding.module.ts`
- Modify: `server/src/app.module.ts` (import `DriverOnboardingModule`)
- Test: `server/test/e2e/driver-application.e2e-spec.ts` (supertest, real Nest app on pglite is not available; instead use `Test.createTestingModule` with the controller and mocked guards — see step 1)

**Interfaces (routes, all `JwtAuthGuard + RolesGuard @Roles('driver')`):**
`GET /driver/application` -> `ApplicationView`; `PUT /driver/application/profile`; `PUT /driver/application/vehicle`; `POST /driver/application/files` (multipart `file`, body `docType`, optional `expiryDate`; `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })`); `DELETE /driver/application/files/:docId`; `POST /driver/application/submit`; `GET /driver/requirements?vehicleType=bike|car`; plus the OTP and file routes from Tasks 5-6.

- [ ] **Step 1: Write a failing controller test** that builds a `Test.createTestingModule({ controllers: [ApplicationController], providers: [{ provide: ApplicationService, useValue: fake }] })`, overrides `JwtAuthGuard`/`RolesGuard` with `canActivate: () => true` and a stub that injects `req.user = { id: 'u1', role: 'driver' }`, and asserts with supertest: `GET /driver/application` calls `fake.getOrCreate('u1')`; `PUT /driver/application/profile` with an invalid body (`licenceExpiryDate: 'nope'`) returns 400 (ValidationPipe applied via `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`); `POST /driver/application/files` without a file returns 400 "Attach a JPG, PNG, WEBP or PDF file."
- [ ] **Step 2: Run to verify failure** — `npm run test:e2e -- driver-application` -> FAIL.
- [ ] **Step 3: Implement** controller and module (`imports: [ConfigModule]`, providers for services, `{ provide: StorageBackend, useClass: LocalPrivateStorage }`, `{ provide: SmsProvider, useFactory }` choosing provider by `SMS_PROVIDER`). Export `ApplicationService`, `StorageService`, `RequirementsService`. Register in `app.module.ts`.
- [ ] **Step 4: Run to verify pass** — `npm run test:e2e -- driver-application` -> PASS, then `npx tsc --noEmit` and `npm run build`.

### Task 10: Admin review service (approve / reject / resubmission / suspend / reactivate / notes / audit)

**Files:**
- Create: `driver-onboarding/admin-applications.service.ts`, `dto/admin-applications.dto.ts`
- Test: `test/integration/admin-applications.integration.spec.ts`

**Interfaces:**
- `AdminApplicationsService` constructor: `(db, notifications: NotificationsService, requirements: RequirementsService, hooks: { onDriverForcedOffline(driverId: string): Promise<void> })`. `hooks` is a small provider token `DRIVER_OFFLINE_HOOK` implemented in Task 12 by the presence service (default no-op so this task is testable alone).
- `list(q: { status?: 'PENDING'|ApplicationStatus; q?: string; sort?: 'newest'|'oldest'|'updated'; page?: number; limit?: number })`: `PENDING` = `SUBMITTED`; search matches user name, mobile, application id, normalized plate; returns `{ items: {applicationId, driverId, driverName, mobile, vehicle: {id, category, plateNumber}|null, status, submittedAt, updatedAt, pendingDocs, totalRequiredDocs}[], total, page, limit }`.
- `stats()`: `{ pending, underReview, approved, rejected, resubmissionRequired, suspended, expired, draft }`.
- `detail(applicationId)`: `{ application, driver: {id,name,email,mobile}, profile, vehicle, requirements: (Requirement & { current, history: DocView[] })[], missing: string[], timeline: ReviewRow[], notes: ReviewRow[], approvalGate: GateResult }`.
- `startReview(adminId, applicationId)`: `SUBMITTED -> UNDER_REVIEW`; no-op when already `UNDER_REVIEW`.
- `reviewDocument(adminId, docId, decision: { action: 'approve' } | { action: 'reject'; reason: string; kind?: 'REJECTED'|'RESUBMISSION_REQUIRED' })`: rejects without a non-empty trimmed reason with 400 "Give a reason so the driver knows what to fix."; the `UPDATE ... WHERE id=? AND status='PENDING' AND superseded_by_id IS NULL` returns 0 rows -> 409 "This document was already reviewed."; only allowed while the application is `SUBMITTED|UNDER_REVIEW|RESUBMISSION_REQUIRED`; writes `verification_reviews` + `audit_logs` (`action: 'super_admin.driver_document.approved|rejected'`); notifies the driver.
- `approve(adminId, applicationId, expectedVersion?)`: inside a transaction: lock the application row (`.for('update')`), 409 if `expectedVersion` provided and different, run `evaluateApprovalGate` with current docs, throw `apiError(409, gate.message, 'APPROVAL_BLOCKED')` when not ok, `assertTransition(status, 'APPROVED')`, then set application `APPROVED` (+`reviewedBy/At`, `version+1`), `users.kycStatus='APPROVED'`, vehicle `verificationStatus='APPROVED', isActive=true`, upsert `driver_status` with `activeVehicleId` (online stays false), review row, audit log, driver notification "Your ZamZam Driver account has been approved."
- `reject(adminId, applicationId, reason)`: reason required; -> `REJECTED`; `users.kycStatus` stays `PENDING`; notification.
- `requestResubmission(adminId, applicationId, reason?)`: requires at least one REJECTED/RESUBMISSION_REQUIRED current doc or a reason; -> `RESUBMISSION_REQUIRED`; notification includes the labels of the rejected items.
- `suspend(adminId, applicationId, { scope: 'DRIVER'|'VEHICLE'|'BOTH'; reason: string })`: reason required; driver scope: `APPROVED -> SUSPENDED`, `users.kycStatus='SUSPENDED'`; vehicle scope: `vehicles.verificationStatus='SUSPENDED'` and clear `driver_status.activeVehicleId` if it matches; always set `driver_status.online=false` and call `hooks.onDriverForcedOffline`; if the driver has an active ride (`ACCEPTED|ONGOING|PAYMENT_PENDING`) do not touch it, but record `activeRideId` in the audit metadata and raise a super-admin notification "Suspended driver has an active trip" (`entityType: 'ride'`).
- `reactivate(adminId, applicationId, { scope })`: driver: `SUSPENDED -> APPROVED`, `users.kycStatus='APPROVED'`; vehicle: `SUSPENDED -> APPROVED`.
- `addNote(adminId, applicationId, text)`: `verification_reviews` row with `targetType: 'NOTE'`.
- Every mutation writes one `audit_logs` row (`actorType: 'super_admin'`, `targetType: 'driver_application' | 'application_document' | 'vehicle'`, metadata `{ from, to, reason }`).

- [ ] **Step 1: Write failing tests** covering: reject without reason -> 400; approve blocked while a document is PENDING with the exact message `Application cannot be approved because 1 required document is still pending.` (arrange all docs approved except one); full happy path (submit via `ApplicationService`, `startReview`, approve every current doc, `approve`) leaves application `APPROVED`, user `kycStatus 'APPROVED'`, vehicle `APPROVED` + active, and a `driver_status.activeVehicleId` set; document review is idempotent-safe (second approve of the same doc -> 409); replacing a rejected doc yields a new PENDING row and lets the admin approve it; `requestResubmission` moves to `RESUBMISSION_REQUIRED` and the driver's `resubmit` (submit) returns it to `SUBMITTED`; concurrent approve: `Promise.all([svc.approve('sa1', id), svc.approve('sa2', id)])` results in exactly one fulfilled and one rejected with 409; suspend forces `driver_status.online=false`, sets `users.kycStatus='SUSPENDED'`, calls the hook once, and reactivate restores `APPROVED`; every action produced an `audit_logs` row and a `verification_reviews` row.
- [ ] **Step 2: Run to verify failure** — `npm test -- admin-applications` -> FAIL.
- [ ] **Step 3: Implement** using drizzle transactions (`this.db.transaction(async (tx) => ...)`) and `.for('update')` on the application row for every status-changing method. Helper `private async record(tx, adminId, app, target, action, from, to, reason)` writes both `verification_reviews` and `audit_logs`.
- [ ] **Step 4: Run to verify pass** — `npm test -- admin-applications` -> PASS.

### Task 11: Admin controller

**Files:**
- Create: `driver-onboarding/admin-applications.controller.ts`; register in `driver-onboarding.module.ts`
- Test: `server/test/e2e/admin-applications.e2e-spec.ts`

**Routes** (`@Controller('super-admin/driver-applications') @UseGuards(SuperAdminAuthGuard)`; admin id from `@CurrentSuperAdmin()`):
`GET /` (list, query `status,q,sort,page,limit` clamped: limit 1..100), `GET /stats`, `GET /:id`, `POST /:id/start-review`, `PATCH /documents/:docId/approve`, `PATCH /documents/:docId/reject` (body `{ reason, kind? }`), `POST /:id/approve` (body `{ expectedVersion? }`), `POST /:id/reject`, `POST /:id/request-resubmission`, `POST /:id/suspend`, `POST /:id/reactivate`, `POST /:id/notes`, `GET /requirements`, `PUT /requirements` (upsert one requirement row: `{ vehicleType, serviceClass, subject, docType, kind, label, isRequired, requiresExpiry, sortOrder }`). Static routes (`/stats`, `/requirements`, `/documents/...`) are declared before `/:id`. Add `@Get('/super-admin/files/:id')` served by the files controller from Task 5.

- [ ] **Step 1: Write failing test**: with `SuperAdminAuthGuard` overridden to inject `req.user = { id: 'sa_1' }` and a fake service, assert each route delegates with the admin id, `reject` without `reason` -> 400 via DTO validation (`@IsString() @MinLength(3) reason`), and that a request through the *real* `SuperAdminAuthGuard` with no token returns 401 (proves a driver token cannot call it).
- [ ] **Step 2-4:** run FAIL, implement controller + DTOs, run PASS (`npm run test:e2e -- admin-applications`), then `npm run build`.

### Task 12: Eligibility, location store, presence (go online/offline)

**Files:**
- Create: `driver-dispatch/eligibility.ts` (+ `.spec.ts`), `eligibility.service.ts`, `location.store.ts` (+ `location.store.spec.ts`), `presence.service.ts`, `driver-events.bus.ts`, `driver-dispatch.module.ts`
- Modify: `driver/driver.service.ts` (`setStatus`, `updateLocation`), `driver/driver.module.ts` (import `DriverDispatchModule`)
- Test: `eligibility.spec.ts`, `location.store.spec.ts`, `test/integration/presence.integration.spec.ts`

**Interfaces:**
- Pure `evaluateEligibility(s: EligibilitySnapshot, opts: { serviceType?: 'taxi'|'bike'|'parcel'; requireOnline: boolean; requireLocation: boolean; now?: Date; locationFreshMs?: number }): { eligible: boolean; reasons: { code: EligibilityCode; message: string }[] }` with
  `EligibilitySnapshot = { role: string|null; application: { status: ApplicationStatus; isLegacy: boolean } | null; kycStatus: string; vehicle: { category: string; verificationStatus: string; isActive: boolean } | null; licenceExpiryDate: string|null; expiredRequiredDocs: number; online: boolean; lastLocationAt: Date|null; hasActiveRide: boolean }`
  and codes `NOT_DRIVER, APPLICATION_NOT_APPROVED, DRIVER_SUSPENDED, NO_ACTIVE_VEHICLE, VEHICLE_NOT_APPROVED, VEHICLE_TYPE_MISMATCH, LICENCE_EXPIRED, DOCUMENT_EXPIRED, DRIVER_OFFLINE, LOCATION_STALE, ACTIVE_RIDE`. Legacy applications skip licence/doc-expiry checks when the data is null. Service match uses `SERVICE_CATEGORIES[serviceType].includes(vehicle.category)`.
- `EligibilityService.check(driverId: string, opts, executor?: Database | Tx): Promise<EligibilityResult>` loads the snapshot (users, application, vehicle via `driver_status.activeVehicleId`, profile licence expiry, count of current required docs whose `expiry_date <= today`, `driver_status`, active ride exists, and the location from `LocationStore.get`) and calls the pure function.
- `LocationStore` (injection token `LOCATION_STORE`): `update(driverId, p: { lat: number; lng: number; accuracy?: number; heading?: number; speed?: number; ts?: number }): Promise<void>`; `get(driverId): Promise<{lat:number;lng:number;ts:number}|null>`; `remove(driverId)`; `nearby(lat, lng, radiusKm, limit): Promise<{ driverId: string; distanceKm: number; lat: number; lng: number }[]>`. `MemoryLocationStore` uses `haversineKm`. `RedisLocationStore` uses `GEOADD zz:drivers:geo <lng> <lat> <id>`, `HSET zz:driver:loc:<id>` with `EXPIRE 120`, and `GEOSEARCH zz:drivers:geo FROMLONLAT <lng> <lat> BYRADIUS <r> km ASC COUNT <n> WITHCOORD WITHDIST`. The module provider picks Redis when `REDIS_URL` is set, otherwise Memory (log a warning in production that live locations will not survive restarts or scale across instances).
- `PresenceService`: `goOnline(driverId, loc: { lat: number; lng: number; accuracy?: number }): Promise<{ online: true }>` (runs `check` with `requireOnline: false, requireLocation: false`, requires `loc` -> 400 `LOCATION_REQUIRED` "Turn on location to go online." then upserts `driver_status.online=true` with lat/lng, updates the store, writes `driver_location_log` `ONLINE`, throws `apiError(403, firstReason.message, firstReason.code)` with `details: reasons` when ineligible); `goOffline(driverId)` (refuses with 409 `ACTIVE_RIDE` while an active ride exists? No: going offline is always allowed; it just removes the store entry and pending offers are cancelled by Task 13); `ping(driverId, p)` (must be online, else 400 `DRIVER_OFFLINE`; updates the store; persists to `driver_status.lat/lng` at most every 60 s using `lastLocationAt`); `forceOffline(driverId, reason)` (sets online false, removes store entry, publishes bus event `{ type: 'status', data: { status: 'SUSPENDED'|'OFFLINE', reason } }`) — also exposed as the `DRIVER_OFFLINE_HOOK` implementation.
- `DriverEventsBus`: `publish(userId: string, event: { type: string; data: unknown }): void`, `stream(userId: string): Observable<{ type: string; data: unknown }>` backed by a `Map<string, Subject>`; `stream` completes cleanup when the last subscriber leaves.
- Modified `DriverService.setStatus(userId, online)` -> `online ? presence.goOnline(...)` requires location: the legacy `POST /driver/status` body only has `{ online }`, so keep it working by reading the last known location from the store (400 `LOCATION_REQUIRED` if none) while the new `POST /driver/go-online` takes `{ lat, lng, accuracy }`; `updateLocation(userId, lat, lng)` delegates to `presence.ping`. New routes in a `PresenceController`: `POST /driver/go-online`, `POST /driver/go-offline`, `GET /driver/eligibility` (returns `check(..., {requireOnline:false, requireLocation:false})` for the dashboard to show the exact reasons), `POST /driver/location` accepts the extended `UpdateLocationDto` (`lat, lng, accuracy?, heading?, speed?, timestamp?`).

- [ ] **Step 1: Write failing tests**
  - `eligibility.spec.ts`: a base snapshot that passes; then for each code one mutation that yields exactly that code as the first reason (suspended application, vehicle SUSPENDED, `category: 'car'` with `serviceType: 'bike'`, licence expiry yesterday, expired doc count 1, `online: false` with `requireOnline`, location 5 minutes old, `hasActiveRide`); legacy application with null licence passes.
  - `location.store.spec.ts`: `MemoryLocationStore.nearby` returns drivers within radius sorted ascending and excludes those beyond it; `remove` drops the driver.
  - `presence.integration.spec.ts`: seed an approved driver (use `ApplicationService` + admin `approve` from earlier tasks, or insert rows directly for speed), then: `goOnline` succeeds and flips `driver_status.online`; an unapproved driver gets 403 `APPLICATION_NOT_APPROVED`; after `suspend`, `goOnline` fails with `DRIVER_SUSPENDED` and an online driver is forced offline; going online while the licence expired yesterday fails `LICENCE_EXPIRED`; `ping` while offline fails `DRIVER_OFFLINE`.
- [ ] **Step 2: Run to verify failure** — `npm test -- eligibility location.store presence` -> FAIL.
- [ ] **Step 3: Implement** the files above. In `driver.module.ts` import `DriverDispatchModule`; `DriverService` injects `PresenceService`.
- [ ] **Step 4: Run to verify pass** — the same command -> PASS; then `npm test` for regressions.

### Task 13: Dispatch, offers and atomic acceptance

**Files:**
- Create: `driver-dispatch/dispatch.service.ts`, `offers.controller.ts`, `dispatch.sweeper.ts`, `driver-stream.controller.ts`
- Modify: `rides/rides.controller.ts` (`RidesService.create`, `accept`, `incoming`, `active`, `start`, `complete`, `cancel`), `rides/rides.module.ts` (import `DriverDispatchModule`)
- Test: `test/integration/dispatch.integration.spec.ts`

**Interfaces:**
- Config (read via `ConfigService` with defaults): `OFFER_TTL_SECONDS=15`, `OFFER_BATCH_SIZE=3`, `OFFER_MAX_ROUNDS=3`, `DISPATCH_RADIUS_KM=8`, `LOCATION_FRESH_SECONDS=90`.
- `DispatchService.start(rideId): Promise<void>` — loads the REQUESTED ride; `candidates = locationStore.nearby(pickupLat, pickupLng, radius, 30)`; skips drivers who already have a PENDING unexpired offer or an existing offer row for this ride; keeps those passing `eligibility.check(id, { serviceType: ride.service, requireOnline: true, requireLocation: true })`; takes `OFFER_BATCH_SIZE`; inserts `ride_offers` (round = previous max + 1, `expiresAt = now + TTL`, `pickupDistanceM`, `etaMin = etaMinutes(km)`) with `onConflictDoNothing` on `(ride_id, driver_id)`; publishes `{ type: 'offer', data: OfferView }` to each driver and `notifyUser(driver, { type: 'ride_offer', ... })`.
- `OfferView = { offerId, rideId, service, pickup: { label, lat, lng }, destination: { label, lat, lng }, distanceKm, fare, pickupDistanceKm, pickupEtaMin, expiresAt }` (fare and distance from the ride row; never trust client).
- `DispatchService.acceptRide(driverId: string, rideId: string): Promise<RideDto>` — the single accept path used by both `POST /driver/offers/:id/accept` and the legacy `RidesService.accept`:
  ```ts
  return this.db.transaction(async (tx) => {
    const [ride] = await tx.select().from(rides).where(eq(rides.id, rideId)).for('update');
    if (!ride || ride.status !== 'REQUESTED' || ride.driverId) apiError(409, 'This request was just taken by another driver.', 'ALREADY_TAKEN');
    await tx.insert(driverStatus).values({ userId: driverId }).onConflictDoNothing();
    const [ds] = await tx.select().from(driverStatus).where(eq(driverStatus.userId, driverId)).for('update');
    const elig = await this.eligibility.check(driverId, { serviceType: ride.service as never, requireOnline: true, requireLocation: false }, tx);
    if (!elig.eligible) apiError(403, elig.reasons[0].message, elig.reasons[0].code);
    // active-ride check is part of eligibility (ACTIVE_RIDE -> 409 DRIVER_BUSY mapping below)
    const [updated] = await tx.update(rides)
      .set({ driverId, vehicleId: ds.activeVehicleId, status: 'ACCEPTED', updatedAt: new Date() })
      .where(and(eq(rides.id, rideId), eq(rides.status, 'REQUESTED'), isNull(rides.driverId)))
      .returning();
    if (!updated) apiError(409, 'This request was just taken by another driver.', 'ALREADY_TAKEN');
    await tx.update(rideOffers).set({ status: 'ACCEPTED', respondedAt: new Date() }).where(and(eq(rideOffers.rideId, rideId), eq(rideOffers.driverId, driverId)));
    const cancelled = await tx.update(rideOffers).set({ status: 'CANCELLED', respondedAt: new Date() })
      .where(and(eq(rideOffers.rideId, rideId), eq(rideOffers.status, 'PENDING'), ne(rideOffers.driverId, driverId))).returning({ driverId: rideOffers.driverId });
    await tx.update(rideOffers).set({ status: 'CANCELLED', respondedAt: new Date() })
      .where(and(eq(rideOffers.driverId, driverId), eq(rideOffers.status, 'PENDING'), ne(rideOffers.rideId, rideId)));
    return { ride: updated, cancelled };
  }).then((r) => { r.cancelled.forEach((c) => this.bus.publish(c.driverId, { type: 'offer_cancelled', data: { rideId } })); return toDto(r.ride); });
  ```
  A unique-violation (`23505` on `rides_one_active_per_driver_idx`) is mapped to `apiError(409, 'Finish and settle your current trip before accepting another.', 'DRIVER_BUSY')`; an `ACTIVE_RIDE` eligibility reason is likewise mapped to 409 `DRIVER_BUSY`. Also writes `driver_location_log` `ACCEPTED` from the store position.
- `DispatchService.decline(driverId, offerId)`: `UPDATE ... SET status='DECLINED' WHERE id=? AND driver_id=? AND status='PENDING'`; 0 rows -> 409 "This offer is no longer available."; then `start(rideId)` again if no PENDING offers remain for the ride.
- `DispatchService.pending(driverId)`: PENDING, unexpired offers as `OfferView[]` (polling fallback).
- `DispatchSweeper` (`@Interval(5000)`): `UPDATE ride_offers SET status='EXPIRED' WHERE status='PENDING' AND expires_at < now() RETURNING ride_id, driver_id`; publish `offer_cancelled` to those drivers; for each affected ride still `REQUESTED` with no PENDING offers and `max(round) < OFFER_MAX_ROUNDS`, call `start(rideId)`. After the last round the ride stays `REQUESTED` (still visible through `GET /rides/incoming`), so behaviour never regresses. Also cancels PENDING offers whose ride is no longer `REQUESTED`.
- `RidesService` changes (minimal): inject `DispatchService`; after `create` inserts, call `void this.dispatch.start(row.id).catch(log)`; `accept(driverId, rideId)` -> `return this.dispatch.acceptRide(driverId, rideId)`; `incoming` uses `locationStore.get(driverId)` for the driver position and additionally requires `eligibility.check(...)` to be eligible (return `[]` otherwise); `active` reads driver lat/lng from `locationStore.get` falling back to `driverStatus`; `cancel` (customer) also cancels PENDING offers for that ride and publishes `offer_cancelled` plus `notifyUser(driver, ride_update "Ride cancelled")` when a driver was already assigned; `start`/`complete` write `driver_location_log` `STARTED`/`COMPLETED` best-effort.
- `OffersController` (`JwtAuthGuard + RolesGuard @Roles('driver')`): `GET /driver/offers/pending`, `POST /driver/offers/:id/accept`, `POST /driver/offers/:id/decline`. `accept` resolves the offer (must belong to the driver, PENDING, unexpired else 409 "This offer has expired.") then calls `acceptRide(driverId, offer.rideId)`.
- `DriverStreamController`: `@Sse('driver/stream')` guarded like above, returns `merge(bus.stream(user.id).pipe(map(e => ({ type: e.type, data: e.data }) as MessageEvent)), interval(25_000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent)))`.

- [ ] **Step 1: Write failing tests** (`dispatch.integration.spec.ts`), using helper `seedApprovedOnlineDriver(db, id, plate, lat, lng, category)` that inserts user, approved legacy-style application, approved active vehicle, `driver_status` online, and `MemoryLocationStore.update`:
  1. `start` offers a bike ride only to bike drivers and only the nearest `OFFER_BATCH_SIZE`; a suspended or offline driver and a car driver are skipped.
  2. `acceptRide` by driver A assigns the ride, marks A's offer ACCEPTED, cancels B's offer, and publishes `offer_cancelled` to B (capture with a fake bus).
  3. **Two drivers, one ride:** `await Promise.allSettled([acceptRide('A', ride), acceptRide('B', ride)])` -> exactly one fulfilled, the other rejected with `code 'ALREADY_TAKEN'`, and exactly one row in `rides` has a driver.
  4. **One driver, two rides:** driver A with two REQUESTED rides: `Promise.allSettled([acceptRide('A','r1'), acceptRide('A','r2')])` -> exactly one fulfilled and the loser rejected with `DRIVER_BUSY`; `SELECT count(*) FROM rides WHERE driver_id='A' AND status='ACCEPTED'` is 1. (On pglite the calls serialize, so this proves the check and the unique index; note in a comment that row-lock contention is exercised only against real Postgres.)
  5. Expiry: set `expiresAt` in the past, run `sweeper.run()` -> offer `EXPIRED` and a second-round offer created for the next-nearest driver.
  6. A suspended driver cannot accept an existing offer (`DRIVER_SUSPENDED`).
  7. `decline` leaves the ride REQUESTED and re-dispatches to the next driver.
  8. Customer cancel cancels all PENDING offers.
- [ ] **Step 2: Run to verify failure** — `npm test -- dispatch.integration` -> FAIL.
- [ ] **Step 3: Implement** the files and `RidesService` edits above. `RidesController`'s existing route paths do not change.
- [ ] **Step 4: Run to verify pass** — `npm test -- dispatch.integration rides` and the whole suite `npm test`.

### Task 14: Expiry job and legacy-route reconciliation

**Files:**
- Create: `driver-onboarding/expiry.service.ts`
- Modify: `driver-onboarding.module.ts` (provide it)
- Test: `test/integration/expiry.integration.spec.ts`

**Interfaces:** `ExpiryService.run(today?: string)` (`@Cron('0 2 * * *')`): for every `APPROVED` (non-legacy or legacy-with-data) application whose licence expiry `<= today` or which has a current required doc with `expiry_date <= today`: mark those docs `EXPIRED`, `APPROVED -> EXPIRED` through `assertTransition`, `users.kycStatus='PENDING'`? No: keep `users.kycStatus='APPROVED'` untouched (eligibility gates on application status), force the driver offline via `DRIVER_OFFLINE_HOOK`, add a `verification_reviews` row (`adminId: null`, `action: 'AUTO_EXPIRED'`), notify the driver ("A document has expired..."). Also mark ride offers cancelled for that driver.

- [ ] **Step 1: Write failing test**: approved driver with an insurance doc expiring `2026-09-20`; `run('2026-09-21')` -> application `EXPIRED`, doc `EXPIRED`, `driver_status.online=false`, `eligibility.check` returns `APPLICATION_NOT_APPROVED`; a driver whose docs are all in the future is untouched; after the driver uploads a new insurance with a future expiry and resubmits, the admin can approve again (`EXPIRED -> SUBMITTED -> APPROVED`).
- [ ] **Step 2-4:** FAIL, implement, PASS (`npm test -- expiry`).

### Task 15: Deployment configuration

**Files:**
- Modify: `server/.env.example`, `docker-compose.yml`, `nginx/` site config, `README.md` (env table only)

- [ ] **Step 1: Add env vars** to `server/.env.example`: `UPLOAD_PRIVATE_DIR=/app/private-uploads`, `SMS_PROVIDER=console`, `SPARROW_SMS_TOKEN=`, `SPARROW_SMS_FROM=`, `OFFER_TTL_SECONDS=15`, `OFFER_BATCH_SIZE=3`, `OFFER_MAX_ROUNDS=3`, `DISPATCH_RADIUS_KM=8`, `LOCATION_FRESH_SECONDS=90`, each with a one-line comment; note `REDIS_URL` now also backs live driver locations.
- [ ] **Step 2: docker-compose** — add a named volume `private_uploads` mounted at `/app/private-uploads` on the `api` service (keep the existing `uploads_data`).
- [ ] **Step 3: nginx** — for `location /driver/stream` set `proxy_buffering off; proxy_read_timeout 3600s; proxy_set_header Connection '';` and `proxy_http_version 1.1`.
- [ ] **Step 4: Verify** — `docker compose config` (if Docker is available) or a YAML lint, and `npm run build` in `server/`.

---

## Phase 2: Super-admin UI

Before starting, read `client/src/features/super-admin/SuperAdminLayout.tsx`, `pages/SuperAdminVehicles.tsx`, `pages/SuperAdminApprovals.tsx`, `useSuperAdminApi.ts`, and `components/shared/async-states.tsx` and copy their conventions (data hook, loading/empty/error/retry components, table styling, badge component, toaster).

### Task 16: Client API layer and types

**Files:**
- Modify: `client/src/api/client.ts` (add endpoint helpers), create `client/src/features/driver/onboarding/onboarding.types.ts`, `client/src/features/super-admin/applications.types.ts`

**Interfaces:** TypeScript mirrors of `ApplicationView`, `CurrentDocView`, `Requirement`, `EligibilityResult`, `OfferView`, admin `ApplicationListItem`, `ApplicationDetail`, `ApplicationStats`, plus a multipart helper `uploadFile(path, formData, onProgress?)` (XHR-based so upload progress works; reuses `authToken()` and the silent-refresh path by retrying once after a 401 refresh).

- [ ] **Step 1:** Add the helper and endpoint functions with the exact paths from Tasks 6, 9, 11, 12, 13.
- [ ] **Step 2: Verify** — `npm run build` in `client/` (type-check passes).

### Task 17: Super-admin applications list

**Files:**
- Create: `client/src/features/super-admin/pages/SuperAdminDriverApplications.tsx`
- Modify: `client/src/routes/index.tsx` (lazy route `/super-admin/driver-applications`), `SuperAdminLayout.tsx` (nav entry "Driver applications" with a pending-count badge)

**Behaviour:** six stat cards (Pending, Under review, Approved, Rejected, Resubmission, Suspended) that act as filters; search box (name, phone, application id, plate) debounced 300 ms; sort select (Newest, Oldest, Recently updated); table columns Driver, Phone, Driver ID, Vehicle, Plate, Type, Status badge, Submitted, "Docs pending"; row click opens the detail route; pagination; loading skeletons, empty state ("No applications match these filters."), error state with Retry.

- [ ] **Step 1:** Write `SuperAdminDriverApplications.test.tsx` (vitest + testing-library) with a mocked `fetch`: renders rows, clicking the "Pending" card refetches with `status=PENDING`, typing in search debounces one request, error state shows Retry.
- [ ] **Step 2:** Run `npm test -- SuperAdminDriverApplications` -> FAIL. Implement. Run -> PASS.

### Task 18: Super-admin application detail

**Files:**
- Create: `client/src/features/super-admin/pages/SuperAdminDriverApplicationDetail.tsx`, `client/src/features/super-admin/components/SecureImage.tsx` (fetches `/super-admin/files/:id` with the admin token, shows an object-URL preview, PDF opens in a new tab via blob URL, revokes URLs on unmount)
- Modify: `routes/index.tsx` (`/super-admin/driver-applications/:id`)

**Behaviour:** on mount call `POST /:id/start-review` (ignore errors) then load detail. One page, nine sections: Driver profile, Driving licence, Identity, Vehicle, Vehicle documents, Vehicle photos, Verification history, Admin notes, Timeline. Each requirement row shows label, required badge, status badge, expiry, Preview (opens `SecureImage` in a modal), Approve, Reject; Reject opens a dialog with a required textarea (button disabled until 3+ characters, inline error otherwise) and a "needs new upload" toggle (`kind`). Missing required items show as "Missing" rows. A sticky action bar has Approve application (disabled with the server `approvalGate.message` as tooltip/inline text when blocked), Request resubmission, Reject application (reason dialog), Suspend (scope radio Driver/Vehicle/Both + reason) or Reactivate depending on status. 409 responses (`APPROVAL_BLOCKED`, `INVALID_TRANSITION`) show the server message and reload the detail. Sends `expectedVersion` on approve.

- [ ] **Step 1:** Write `SuperAdminDriverApplicationDetail.test.tsx`: reject dialog blocks submit without a reason; approve button disabled and shows the gate message when blocked; approving a document calls `PATCH /documents/:id/approve` and refreshes.
- [ ] **Step 2-3:** FAIL, implement, PASS.

---

## Phase 3: Driver app UI

Before starting, read `features/auth/RegisterPage.tsx`, `LoginPage.tsx`, `features/driver/DriverDashboard.tsx`, `VehiclePage.tsx`, `DriverDocumentsPage.tsx`, `driver-portal.context.tsx`, `components/layout/driver-shell.tsx`, and the UI kit files `otp-input.tsx`, `phone-field.tsx`, `date-field.tsx`, `select-field.tsx`, `bottom-sheet.tsx`, `input.tsx`, `button.tsx`, `badge.tsx`. Use them; do not add new colours.

### Task 19: Registration and login for drivers

**Files:** Modify `features/auth/RegisterPage.tsx`, `LoginPage.tsx`, `stores/auth.store.ts` (only if needed), `routes/index.tsx`.

**Behaviour:** a driver registering now receives tokens (Task 7): sign them in and navigate to `/driver/onboarding` instead of showing the "awaiting approval" message (keep that message for the other partner roles). On login, a driver with `kycStatus PENDING|SUSPENDED` is signed in normally; the post-login redirect for drivers goes to `/driver/onboarding` when the application is not `APPROVED`, otherwise the existing driver home.

- [ ] **Step 1:** Extend the existing auth store spec (`auth.store.spec.ts`) or add a `RegisterPage` test: a mocked register response with tokens and `role: 'driver'` navigates to `/driver/onboarding`; a hotel response keeps the pending message.
- [ ] **Step 2-3:** FAIL, implement, PASS. Run `npm test` in `client/`.

### Task 20: Wizard shell, draft persistence and validation

**Files:**
- Create: `features/driver/onboarding/OnboardingPage.tsx`, `useOnboarding.ts`, `validation.ts`, `validation.spec.ts`, `FileUploader.tsx`, `StepShell.tsx`
- Modify: `routes/index.tsx` (`/driver/onboarding` under the driver role guard but **outside** the approved-only shell so a pending driver can reach it)

**Interfaces:**
- `validation.ts`: `validatePersonal(v)`, `validateLicence(v, today?)`, `validateVehicle(v, currentYear?)`, `validateFile(file, { imagesOnly, minWidth?, minHeight? }): Promise<string|null>` (type in JPG/PNG/WEBP/PDF, size <= 5 MB, and for profile photo min 200x200 measured with `createImageBitmap`/`Image`), each returning `Record<field, message>`. The licence message for expiry is exactly `Your driving licence has expired. Please upload a valid licence.`
- `useOnboarding()`: loads `GET /driver/application` (states: loading, error+retry, ready), exposes `view`, `saveProfile`, `saveVehicle`, `upload(docType, file, expiryDate?, onProgress)`, `remove(docId)`, `submit()`, and `refresh()`; mirrors unsaved form values to `localStorage` key `zz_driver_onboarding_draft_v1:<userId>` (try/catch) and restores them on mount so a refresh never loses typed data; server state wins for saved fields.
- `OnboardingPage`: 6-step progress bar `Phone → Personal → Licence → Vehicle → Documents → Review` (photos are part of the Documents step's second section so the visible progress matches the spec's short form; internally `currentStep` 1..8 maps to the spec steps), Back / Save & continue buttons (large touch targets, disabled + spinner while saving), inline errors, required asterisks, "Continue later" that just leaves (draft is saved server-side on every Save & continue). When status is not editable (`SUBMITTED|UNDER_REVIEW|APPROVED|SUSPENDED|REJECTED`), render the status view from Task 23 instead of the wizard.
- `FileUploader`: camera capture (`<input type="file" accept="image/*" capture="environment">` offered when `navigator.mediaDevices` exists), file picker, preview (object URL, revoked on unmount), progress bar, Retry on failure, Replace, Delete (only while DRAFT), shows rejection reason and "Upload new document" for rejected items.

- [ ] **Step 1: Write `validation.spec.ts`**: licence expiry in the past returns the exact message; personal requires all fields and a 7-15 digit emergency phone; vehicle year bounds and plate validity (reuse the same regex as the server, exported as a shared constant copied verbatim); file validator rejects `.gif`, >5 MB and undersized profile photos (stub `createImageBitmap`).
- [ ] **Step 2:** `npm test -- validation` -> FAIL. Implement. -> PASS.
- [ ] **Step 3:** Implement shell/hook/uploader; add a `useOnboarding` test that restores draft values from `localStorage` after a simulated remount.
- [ ] **Step 4:** `npm test -- onboarding` -> PASS; `npm run build`.

### Task 21: Wizard steps

**Files:** Create `features/driver/onboarding/steps/{PhoneStep,PersonalStep,LicenceStep,VehicleStep,DocumentsStep,ReviewStep}.tsx`.

**Behaviour:**
- `PhoneStep`: shows the masked account number; "Send code" (`POST /driver/otp/send`) then the existing `otp-input` (6 digits), 30 s resend countdown, friendly errors for 429 and invalid code; skipped (auto-advance) when `profile.phoneVerifiedAt` is set.
- `PersonalStep`: legal name, profile photo (`FileUploader` with `docType='profile_photo'`, images only, min 200x200), date of birth (`date-field`), gender (optional select), address, city, province (select of Nepal's 7 provinces), emergency contact name + phone, preferred language (select: नेपाली / English). Saves via `PUT /driver/application/profile`.
- `LicenceStep`: licence number, category select (A, B, C, K, and other), issuing authority, issue and expiry dates, front and back images (`licence_front`, `licence_back`), inline expired-licence error using the exact message, Save disabled while expired.
- `VehicleStep`: segmented control Bike / Car (from `GET /driver/requirements`-driven config where available; the two options are the only supported categories), dynamic fields: make, model, manufacture year, registration year, colour, fuel (petrol/diesel/electric/hybrid), plate (input auto-formats display, validates with the Nepal regex, shows "already registered" on 409), Car-only: body type (hatchback/sedan/SUV/other) sent as `serviceClass`, seats. Bike hides seats/body type.
- `DocumentsStep`: two sections built from `view.requirements` — documents (bluebook, insurance with required expiry `date-field`, road tax for cars, identity) and vehicle photos (angle labels from `label`, grid of `FileUploader`s). Required items show a red-free amber "Required" chip; optional items say "Optional". Progress "n of m required uploaded".
- `ReviewStep`: read-only summary of every section with an "Edit" link to each step, the list of `blockers` from the server (each linking to its step), a consent checkbox ("I confirm the information and documents are genuine"), and Submit (`POST /driver/application/submit`); on success show the Submission success screen with "Your application is submitted and waiting for review." and a button to the status page. Handles the 400 `SUBMIT_BLOCKED` response by showing its blockers.

- [ ] **Step 1:** For each step write one vitest + testing-library test using a mocked `useOnboarding`: PhoneStep sends and verifies; LicenceStep disables Save and shows the exact expired message for a past date; VehicleStep shows the car-only fields only for Car and shows the plate error for `1234`; DocumentsStep lists car requirements including road tax and bike requirements without it; ReviewStep disables Submit until the checkbox is ticked and there are no blockers.
- [ ] **Step 2:** `npm test -- steps` -> FAIL. Implement the steps. -> PASS. `npm run build`.

### Task 22: Application status, resubmission and go-online gating

**Files:**
- Create: `features/driver/onboarding/ApplicationStatusPage.tsx`, `features/driver/GoOnlineButton.tsx`
- Modify: `features/driver/DriverDashboard.tsx`, `features/driver/driver-portal.context.tsx` (only where it toggles online: use `POST /driver/go-online` with the current geolocation and surface server reasons), `routes/index.tsx` (`/driver/application` route and a redirect guard: a driver whose application status is not `APPROVED` and who opens any driver-only page is redirected to `/driver/onboarding`)

**Behaviour:** `ApplicationStatusPage` shows the current state with the server `statusMessage`, a timeline from `submittedAt`, and per status content: SUBMITTED/UNDER_REVIEW (calm waiting state, what happens next), RESUBMISSION_REQUIRED (list of rejected items each with the admin reason and an "Upload new document" button using `FileUploader`, plus a "Resubmit application" button enabled only when no rejected item remains without a newer pending replacement), REJECTED (reason, "Update and reapply" moves `REJECTED -> DRAFT` via a small `POST /driver/application/reopen` endpoint — add it to the server in Task 8's service and controller with `assertTransition('REJECTED','DRAFT')`), SUSPENDED (reason, contact support), EXPIRED (which document expired and an upload button), APPROVED (celebratory but restrained card, "Your ZamZam Driver account has been approved." and a Go online button). `GoOnlineButton` calls `GET /driver/eligibility` first and lists the blocking reasons in plain language when ineligible; requests browser location permission and, if denied, shows a message with steps to enable it; on success updates the portal context's online state.

- [ ] **Step 1:** Add the server `reopen` endpoint test to `driver-application.integration.spec.ts` (REJECTED -> DRAFT allowed for the owner, blocked from APPROVED) and implement it.
- [ ] **Step 2:** Client tests: status page renders the rejected-document reason and Upload button; GoOnlineButton shows reason messages from a mocked 403; location denied message.
- [ ] **Step 3:** FAIL, implement, PASS; `npm run build`.

### Task 23: Realtime offers in the driver app

**Files:**
- Create: `features/driver/offers/useDriverStream.ts`, `OfferSheet.tsx`, `offers.spec.ts`
- Modify: `features/driver/DriverDashboard.tsx` (mount the hook and sheet when online), `driver-portal.context.tsx`

**Interfaces:** `useDriverStream(enabled: boolean)` opens `fetch(API/driver/stream, { headers: { Authorization } })`, reads the body as a stream, parses `event:`/`data:` SSE frames, and exposes `{ offers: OfferView[], connected: boolean }`; handles `offer` (add), `offer_cancelled` (remove), `status` (if `SUSPENDED|OFFLINE` set the portal offline and toast the reason); reconnects with backoff (1s..15s) and, while disconnected, polls `GET /driver/offers/pending` every 5 s.

**OfferSheet** (bottom sheet): "New ride", pickup and destination labels, distance, estimated fare `NPR {fare}`, pickup ETA, a countdown ring computed from `expiresAt` (server time skew corrected using the `Date` header of the first response), Accept and Decline buttons (large), disabled while a request is in flight; on 409 `ALREADY_TAKEN`/expired show "This ride was taken by another driver." and dismiss; on accept success navigate to the existing current-trip page. Auto-dismisses at expiry. Only one offer is shown at a time (nearest expiry first).

- [ ] **Step 1:** Write `offers.spec.ts`: an SSE frame parser unit test (multi-line chunks split mid-frame produce the right events) and a countdown helper test (`secondsLeft(expiresAt, now, skew)` never negative).
- [ ] **Step 2-3:** FAIL, implement, PASS; `npm run build`.

---

## Phase 4: Verification

### Task 24: Full-flow verification and report

- [ ] **Step 1: Server suite** — `npm test` and `npm run test:e2e` in `server/` -> all pass; `npm run build` -> succeeds.
- [ ] **Step 2: Client suite** — `npm test` and `npm run build` in `client/` -> all pass.
- [ ] **Step 3: Migration on a real Postgres** — start the compose Postgres (or any local Postgres 16), set `DATABASE_URL`, run `npm run db:migrate` twice (second run is a no-op), then `psql` to confirm the seeded `document_requirements` rows and the two partial unique indexes exist.
- [ ] **Step 4: End-to-end walkthrough** using the running stack (`npm run start:dev` in `server/`, `npm run dev` in `client/`, `SMS_PROVIDER=console` so the OTP appears in the server log; seed the super admin with `npm run db:seed:superadmin`): register a driver -> OTP -> personal + photo -> licence -> bike -> documents + photos -> review -> submit (expect SUBMITTED) -> super-admin opens the application (UNDER_REVIEW), rejects one document with a reason -> request resubmission -> driver sees the reason, replaces it, resubmits -> admin approves every item and the application -> driver sees approval notification and Go online -> register a customer, request a bike ride near the driver -> driver receives the offer, accepts -> ride ACCEPTED -> start -> complete -> confirm cash -> driver back to ONLINE. Then suspend the driver from the admin page and confirm the driver is forced offline and cannot go online. Use the Playwright MCP tools for the browser steps and capture screenshots of the wizard, status page, admin list, admin detail and offer sheet at 390 px and 1280 px widths.
- [ ] **Step 5: Regression pass** — manually load the customer home, ride booking, and existing super-admin Vehicles page to confirm nothing else changed.
- [ ] **Step 6: Final report** — list files changed, DB changes, new APIs, env vars, migration commands, storage configuration, testing instructions, remaining production configuration (real Sparrow credentials and endpoint confirmation, Redis for multi-instance locations and a shared event bus if the API is ever scaled to more than one instance, migrating old public `/uploads/driver-documents` files), and the assumptions made (Nepal plate regex, legacy drivers grandfathered, submit lands in SUBMITTED until an admin opens it, image dimensions validated client-side).

---

## Self-Review Notes

- **Spec coverage:** OTP (T6, T21), profile/licence/vehicle/docs/photos (T8, T20-21), configurable requirements (T3, T8, T11), duplicate plates (T3, T4, T8), state machine (T2, T10), admin list/detail/review/approve/reject/resubmit/suspend/reactivate/notes/audit (T10, T11, T17, T18), notifications (T8, T10, T13, T14), secure documents (T5), eligibility (T12), location in Redis GEO (T12), offers with expiry and atomic assignment (T13), expiry handling (T14), no mock data (T3 seeds config only), deployment (T15), tests (every task), end-to-end (T24).
- **Deviations from the spec text, decided after reading the code:** vehicle photos share `application_documents` (docType `photo:*`) instead of separate `vehicle_photos` and `vehicle_photo_requirements` tables; OTP codes live in Postgres (`phone_otps`), not Redis; submit lands in `SUBMITTED` and moves to `UNDER_REVIEW` when an admin opens it; already-approved drivers are grandfathered (`is_legacy`) so nobody is locked out on deploy.
- **Type consistency:** `GateRequirement/GateDoc/GateProfile/GateVehicle` (T2) are consumed unchanged by `ApplicationService` (T8) and `AdminApplicationsService` (T10); `EligibilityService.check(driverId, opts, executor?)` (T12) is the only eligibility entry point used by `PresenceService` (T12) and `DispatchService` (T13); `DRIVER_OFFLINE_HOOK` (T10) is implemented by `PresenceService.forceOffline` (T12).
