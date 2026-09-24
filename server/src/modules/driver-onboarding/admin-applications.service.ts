import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import {
  applicationDocuments,
  auditLogs,
  driverApplications,
  driverProfiles,
  driverStatus,
  rideOffers,
  rides,
  storedFiles,
  users,
  vehicles,
  verificationReviews,
} from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import { assertTransition, type ApplicationStatus } from './application-state';
import { evaluateApprovalGate } from './application-gates';
import { currentDocFor, loadApplicationSnapshot, type AppRow } from './application-snapshot';
import type { DbExecutor, Tx } from './db-types';
import { DRIVER_OFFLINE_HOOK, type DriverOfflineHook } from './hooks';
import { normalizePlate } from './plate.util';
import { RequirementsService } from './requirements.service';

const ALL_STATUSES: ApplicationStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED',
];
/** Documents can be reviewed only while the application is open. */
const OPEN_FOR_REVIEW: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED'];
const ACTIVE_RIDE = ['ACCEPTED', 'ONGOING', 'PAYMENT_PENDING'] as const;
const NEEDS_NEW_UPLOAD = ['REJECTED', 'RESUBMISSION_REQUIRED', 'EXPIRED'];

export type DocDecision =
  | { action: 'approve' }
  | { action: 'reject'; reason: string; kind?: 'REJECTED' | 'RESUBMISSION_REQUIRED' };

export type SuspendScope = 'DRIVER' | 'VEHICLE' | 'BOTH';

export interface ListQuery {
  status?: string; // 'PENDING' means SUBMITTED
  q?: string;
  sort?: 'newest' | 'oldest' | 'updated';
  page?: number;
  limit?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const needReason = (reason: string | undefined, message: string) => {
  const r = (reason ?? '').trim();
  if (r.length < 3) apiError(400, message, 'REASON_REQUIRED');
  return r;
};

@Injectable()
export class AdminApplicationsService {
  private readonly logger = new Logger(AdminApplicationsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly requirements: RequirementsService,
    @Optional() @Inject(DRIVER_OFFLINE_HOOK) private readonly offlineHook?: DriverOfflineHook,
  ) {}

  /* ───────────────────────────── Reads ─────────────────────────────────── */

  async list(q: ListQuery) {
    const page = Math.max(Number(q.page) || 1, 1);
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);

    const conds = [];
    if (q.status) {
      const wanted = q.status === 'PENDING' ? 'SUBMITTED' : q.status;
      if (!ALL_STATUSES.includes(wanted as ApplicationStatus)) apiError(400, 'Unknown status filter.', 'BAD_FILTER');
      conds.push(eq(driverApplications.status, wanted as ApplicationStatus));
    } else {
      conds.push(ne(driverApplications.status, 'DRAFT')); // drafts are noise until submitted
    }

    const term = (q.q ?? '').trim();
    if (term) {
      const like = `%${escapeLike(term)}%`;
      const plate = normalizePlate(term);
      conds.push(
        or(
          ilike(users.name, like),
          ilike(driverProfiles.legalName, like),
          ilike(users.mobile, like),
          ilike(users.id, `${escapeLike(term)}%`),
          eq(driverApplications.id, term),
          plate.length >= 2 ? ilike(vehicles.plateNormalized, `%${plate}%`) : undefined,
        )!,
      );
    }
    const where = and(...conds);

    const submittedOrCreated = sql`coalesce(${driverApplications.submittedAt}, ${driverApplications.createdAt})`;
    const order =
      q.sort === 'oldest'
        ? [asc(submittedOrCreated), asc(driverApplications.id)]
        : q.sort === 'updated'
          ? [desc(driverApplications.updatedAt), desc(driverApplications.id)]
          : [desc(submittedOrCreated), desc(driverApplications.id)];

    const rows = await this.db
      .select({
        app: driverApplications,
        userId: users.id,
        name: users.name,
        mobile: users.mobile,
        legalName: driverProfiles.legalName,
        vehicleId: vehicles.id,
        category: vehicles.category,
        plateNumber: vehicles.plateNumber,
        vehicleStatus: vehicles.verificationStatus,
      })
      .from(driverApplications)
      .innerJoin(users, eq(users.id, driverApplications.userId))
      .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .leftJoin(vehicles, eq(vehicles.id, driverApplications.vehicleId))
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(driverApplications)
      .innerJoin(users, eq(users.id, driverApplications.userId))
      .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .leftJoin(vehicles, eq(vehicles.id, driverApplications.vehicleId))
      .where(where);

    const ids = rows.map((r) => r.app.id);
    const pendingRows = ids.length
      ? await this.db
          .select({ applicationId: applicationDocuments.applicationId, n: count() })
          .from(applicationDocuments)
          .where(
            and(
              inArray(applicationDocuments.applicationId, ids),
              isNull(applicationDocuments.supersededById),
              eq(applicationDocuments.status, 'PENDING'),
            ),
          )
          .groupBy(applicationDocuments.applicationId)
      : [];
    const pending = new Map(pendingRows.map((p) => [p.applicationId, Number(p.n)]));

    return {
      items: rows.map((r) => ({
        applicationId: r.app.id,
        driverId: r.userId,
        driverName: r.legalName ?? r.name,
        mobile: r.mobile,
        vehicle: r.vehicleId ? { id: r.vehicleId, category: r.category!, plateNumber: r.plateNumber!, status: r.vehicleStatus! } : null,
        status: r.app.status,
        submittedAt: r.app.submittedAt ? r.app.submittedAt.toISOString() : null,
        updatedAt: r.app.updatedAt.toISOString(),
        pendingDocs: pending.get(r.app.id) ?? 0,
      })),
      total: Number(total),
      page,
      limit,
    };
  }

  async stats() {
    const rows = await this.db
      .select({ status: driverApplications.status, n: count() })
      .from(driverApplications)
      .groupBy(driverApplications.status);
    const n = (s: ApplicationStatus) => Number(rows.find((r) => r.status === s)?.n ?? 0);
    return {
      pending: n('SUBMITTED'),
      underReview: n('UNDER_REVIEW'),
      approved: n('APPROVED'),
      rejected: n('REJECTED'),
      resubmissionRequired: n('RESUBMISSION_REQUIRED'),
      suspended: n('SUSPENDED'),
      expired: n('EXPIRED'),
      draft: n('DRAFT'),
    };
  }

  async detail(applicationId: string) {
    const app = await this.appOrFail(this.db, applicationId);
    const snap = await loadApplicationSnapshot(this.db, this.requirements, app);
    const [driver] = await this.db
      .select({ id: users.id, name: users.name, email: users.email, mobile: users.mobile, kycStatus: users.kycStatus })
      .from(users)
      .where(eq(users.id, app.userId))
      .limit(1);

    const allDocs = await this.db
      .select({ doc: applicationDocuments, file: storedFiles })
      .from(applicationDocuments)
      .innerJoin(storedFiles, eq(storedFiles.id, applicationDocuments.fileId))
      .where(eq(applicationDocuments.applicationId, app.id))
      .orderBy(desc(applicationDocuments.createdAt));

    const view = (r: { doc: typeof applicationDocuments.$inferSelect; file: typeof storedFiles.$inferSelect }) => ({
      id: r.doc.id,
      status: r.doc.status,
      rejectionReason: r.doc.rejectionReason,
      expiryDate: r.doc.expiryDate,
      fileId: r.file.id,
      originalName: r.file.originalName,
      mimeType: r.file.mimeType,
      uploadedAt: r.doc.createdAt.toISOString(),
      reviewedBy: r.doc.reviewedBy,
      reviewedAt: r.doc.reviewedAt ? r.doc.reviewedAt.toISOString() : null,
    });

    const scopeFor = (subject: 'DRIVER' | 'VEHICLE') => (subject === 'DRIVER' ? 'driver' : snap.vehicle?.id);
    const requirements = snap.requirements.map((r) => {
      const current = currentDocFor(snap, r);
      const history = allDocs
        .filter(
          (d) =>
            d.doc.docType === r.docType &&
            d.doc.subject === r.subject &&
            d.doc.scope === scopeFor(r.subject) &&
            d.doc.supersededById !== null,
        )
        .map(view);
      return { ...r, current: current ? view(current) : null, history };
    });

    const reviewRows = await this.db
      .select()
      .from(verificationReviews)
      .where(eq(verificationReviews.applicationId, app.id))
      .orderBy(asc(verificationReviews.createdAt));
    const shape = (r: typeof verificationReviews.$inferSelect) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      action: r.action,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      reason: r.reason,
      adminId: r.adminId,
      createdAt: r.createdAt.toISOString(),
    });

    return {
      application: {
        id: app.id,
        status: app.status,
        version: app.version,
        currentStep: app.currentStep,
        isLegacy: app.isLegacy,
        submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
        reviewedAt: app.reviewedAt ? app.reviewedAt.toISOString() : null,
        reviewedBy: app.reviewedBy,
        rejectionReason: app.rejectionReason,
        suspensionReason: app.suspensionReason,
      },
      driver,
      profile: snap.profile,
      vehicle: snap.vehicle,
      requirements,
      missing: requirements.filter((r) => r.isRequired && !r.current).map((r) => r.label),
      timeline: reviewRows.filter((r) => r.targetType !== 'NOTE').map(shape),
      notes: reviewRows.filter((r) => r.targetType === 'NOTE').map(shape),
      approvalGate: evaluateApprovalGate(snap.gateInput),
    };
  }

  /* ───────────────────────────── Actions ───────────────────────────────── */

  async startReview(adminId: string, applicationId: string): Promise<{ status: ApplicationStatus }> {
    const started = await this.db.transaction(async (tx) => {
      const app = await this.lock(tx, applicationId);
      if (app.status === 'UNDER_REVIEW') return false;
      assertTransition(app.status, 'UNDER_REVIEW');
      await this.setStatus(tx, app, 'UNDER_REVIEW');
      await this.record(tx, {
        adminId, app, target: 'APPLICATION', targetId: app.id, action: 'REVIEW_STARTED',
        audit: 'super_admin.driver_application.review_started', from: app.status, to: 'UNDER_REVIEW',
      });
      return true;
    });
    if (started) {
      const app = await this.appOrFail(this.db, applicationId);
      await this.tell(app.userId, 'Application under review', 'Our team has started reviewing your application.', app.id);
    }
    return { status: 'UNDER_REVIEW' };
  }

  async reviewDocument(adminId: string, docId: string, decision: DocDecision) {
    const reason = decision.action === 'reject'
      ? needReason(decision.reason, 'Give a reason so the driver knows what to fix.')
      : null;

    const [found] = await this.db
      .select({ doc: applicationDocuments, appId: driverApplications.id })
      .from(applicationDocuments)
      .innerJoin(driverApplications, eq(driverApplications.id, applicationDocuments.applicationId))
      .where(eq(applicationDocuments.id, docId))
      .limit(1);
    if (!found) apiError(404, 'Document not found.', 'NOT_FOUND');

    const newStatus = decision.action === 'approve' ? 'APPROVED' : (decision.kind ?? 'REJECTED');
    let userId = '';
    await this.db.transaction(async (tx) => {
      const app = await this.lock(tx, found.appId);
      userId = app.userId;
      if (!OPEN_FOR_REVIEW.includes(app.status)) {
        apiError(409, 'This application is not open for review.', 'NOT_OPEN');
      }
      const updated = await tx
        .update(applicationDocuments)
        .set({ status: newStatus, rejectionReason: reason, reviewedBy: adminId, reviewedAt: new Date() })
        .where(
          and(
            eq(applicationDocuments.id, docId),
            eq(applicationDocuments.status, 'PENDING'),
            isNull(applicationDocuments.supersededById),
          ),
        )
        .returning({ id: applicationDocuments.id });
      if (updated.length === 0) apiError(409, 'This document was already reviewed.', 'ALREADY_REVIEWED');

      // Touching a document means the application is being reviewed.
      if (app.status === 'SUBMITTED') {
        await this.setStatus(tx, app, 'UNDER_REVIEW');
        await this.record(tx, {
          adminId, app, target: 'APPLICATION', targetId: app.id, action: 'REVIEW_STARTED',
          audit: 'super_admin.driver_application.review_started', from: 'SUBMITTED', to: 'UNDER_REVIEW',
        });
      }
      await this.record(tx, {
        adminId, app, target: 'DOCUMENT', targetId: docId,
        action: decision.action === 'approve' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
        audit: decision.action === 'approve' ? 'super_admin.driver_document.approved' : 'super_admin.driver_document.rejected',
        auditTarget: 'application_document', from: 'PENDING', to: newStatus, reason,
      });
    });

    const label = await this.labelFor(found.doc.subject, found.doc.docType);
    if (decision.action === 'approve') {
      await this.tell(userId, 'Document approved', `Your ${label} was approved.`, found.appId);
    } else {
      await this.tell(
        userId,
        'Document rejected',
        `Your ${label} was rejected: ${reason!.replace(/[.\s]+$/, '')}. Please upload a new one.`,
        found.appId,
      );
    }
    return { ok: true as const, status: newStatus };
  }

  async approve(adminId: string, applicationId: string, expectedVersion?: number) {
    let userId = '';
    await this.db.transaction(async (tx) => {
      const app = await this.lock(tx, applicationId);
      userId = app.userId;
      if (expectedVersion !== undefined && expectedVersion !== app.version) {
        apiError(409, 'This application was updated by someone else. Reload and try again.', 'STALE');
      }
      assertTransition(app.status, 'APPROVED');

      const snap = await loadApplicationSnapshot(tx, this.requirements, app);
      const gate = evaluateApprovalGate(snap.gateInput);
      if (!gate.ok) apiError(409, gate.message, 'APPROVAL_BLOCKED');
      const vehicle = snap.vehicle!;

      const now = new Date();
      await tx
        .update(driverApplications)
        .set({
          status: 'APPROVED', reviewedBy: adminId, reviewedAt: now, rejectionReason: null,
          suspensionReason: null, version: app.version + 1, updatedAt: now,
        })
        .where(eq(driverApplications.id, app.id));
      await tx.update(users).set({ kycStatus: 'APPROVED', updatedAt: now }).where(eq(users.id, app.userId));
      await tx
        .update(vehicles)
        .set({ verificationStatus: 'APPROVED', isActive: true, updatedAt: now })
        .where(eq(vehicles.id, vehicle.id));
      await tx
        .insert(driverStatus)
        .values({ userId: app.userId, activeVehicleId: vehicle.id })
        .onConflictDoUpdate({ target: driverStatus.userId, set: { activeVehicleId: vehicle.id, updatedAt: now } });

      await this.record(tx, {
        adminId, app, target: 'APPLICATION', targetId: app.id, action: 'APPLICATION_APPROVED',
        audit: 'super_admin.driver_application.approved', from: app.status, to: 'APPROVED',
      });
      await this.record(tx, {
        adminId, app, target: 'VEHICLE', targetId: vehicle.id, action: 'VEHICLE_APPROVED',
        audit: 'super_admin.vehicle.approved', auditTarget: 'vehicle', from: vehicle.verificationStatus, to: 'APPROVED',
      });
    });
    await this.tell(userId, 'Application approved', 'Your ZamZam Driver account has been approved.', applicationId);
    await this.tell(userId, 'Vehicle approved', 'Your vehicle has been approved. You can go online now.', applicationId);
    return { ok: true as const, status: 'APPROVED' as const };
  }

  async reject(adminId: string, applicationId: string, reason: string) {
    const why = needReason(reason, 'Give a reason so the driver understands the decision.');
    let userId = '';
    await this.db.transaction(async (tx) => {
      const app = await this.lock(tx, applicationId);
      userId = app.userId;
      assertTransition(app.status, 'REJECTED');
      await this.setStatus(tx, app, 'REJECTED', { rejectionReason: why, reviewedBy: adminId, reviewedAt: new Date() });
      await this.record(tx, {
        adminId, app, target: 'APPLICATION', targetId: app.id, action: 'APPLICATION_REJECTED',
        audit: 'super_admin.driver_application.rejected', from: app.status, to: 'REJECTED', reason: why,
      });
    });
    await this.tell(userId, 'Application rejected', `Your application was rejected: ${why.replace(/[.\s]+$/, '')}.`, applicationId);
    return { ok: true as const, status: 'REJECTED' as const };
  }

  async requestResubmission(adminId: string, applicationId: string, reason?: string) {
    const note = (reason ?? '').trim() || null;
    let userId = '';
    let labels: string[] = [];
    await this.db.transaction(async (tx) => {
      const app = await this.lock(tx, applicationId);
      userId = app.userId;
      assertTransition(app.status, 'RESUBMISSION_REQUIRED');
      const snap = await loadApplicationSnapshot(tx, this.requirements, app);
      // Any rejected item counts, required or not: an admin may want a better insurance photo.
      labels = snap.requirements
        .filter((r) => {
          const cur = currentDocFor(snap, r);
          return cur && NEEDS_NEW_UPLOAD.includes(cur.doc.status);
        })
        .map((r) => r.label);
      if (labels.length === 0 && !note) {
        apiError(400, 'Reject at least one document or explain what needs to change.', 'NOTHING_TO_FIX');
      }
      await this.setStatus(tx, app, 'RESUBMISSION_REQUIRED', { rejectionReason: note, reviewedBy: adminId, reviewedAt: new Date() });
      await this.record(tx, {
        adminId, app, target: 'APPLICATION', targetId: app.id, action: 'RESUBMISSION_REQUESTED',
        audit: 'super_admin.driver_application.resubmission_requested', from: app.status, to: 'RESUBMISSION_REQUIRED', reason: note,
      });
    });
    const parts = [labels.length ? `Please update: ${labels.join(', ')}.` : '', note ? note.replace(/[.\s]+$/, '') + '.' : ''];
    await this.tell(userId, 'Resubmission required', parts.filter(Boolean).join(' '), applicationId);
    return { ok: true as const, status: 'RESUBMISSION_REQUIRED' as const };
  }

  async suspend(adminId: string, applicationId: string, input: { scope: SuspendScope; reason: string }) {
    const reason = needReason(input.reason, 'Give a reason for the suspension.');
    const { scope } = input;
    const doDriver = scope === 'DRIVER' || scope === 'BOTH';
    const doVehicle = scope === 'VEHICLE' || scope === 'BOTH';

    let userId = '';
    let activeRideId: string | null = null;
    await this.db.transaction(async (tx) => {
      const app = await this.lock(tx, applicationId);
      userId = app.userId;
      const suspendable: ApplicationStatus[] = doDriver ? ['APPROVED'] : ['APPROVED', 'SUSPENDED'];
      if (!suspendable.includes(app.status)) {
        apiError(409, 'Only approved drivers can be suspended.', 'NOT_APPROVED');
      }
      const now = new Date();

      if (doDriver) {
        assertTransition(app.status, 'SUSPENDED');
        await this.setStatus(tx, app, 'SUSPENDED', { suspensionReason: reason });
        await tx.update(users).set({ kycStatus: 'SUSPENDED', updatedAt: now }).where(eq(users.id, app.userId));
        await this.record(tx, {
          adminId, app, target: 'DRIVER', targetId: app.userId, action: 'DRIVER_SUSPENDED',
          audit: 'super_admin.driver.suspended', auditTarget: 'driver_application', from: app.status, to: 'SUSPENDED', reason,
        });
      }
      if (doVehicle && app.vehicleId) {
        const [veh] = await tx.select().from(vehicles).where(eq(vehicles.id, app.vehicleId)).limit(1);
        if (veh) {
          await tx.update(vehicles).set({ verificationStatus: 'SUSPENDED', updatedAt: now }).where(eq(vehicles.id, veh.id));
          await tx
            .update(driverStatus)
            .set({ activeVehicleId: null, updatedAt: now })
            .where(and(eq(driverStatus.userId, app.userId), eq(driverStatus.activeVehicleId, veh.id)));
          await this.record(tx, {
            adminId, app, target: 'VEHICLE', targetId: veh.id, action: 'VEHICLE_SUSPENDED',
            audit: 'super_admin.vehicle.suspended', auditTarget: 'vehicle', from: veh.verificationStatus, to: 'SUSPENDED', reason,
          });
        }
      }

      // Out of service immediately: offline, and no offers left to accept.
      await tx.update(driverStatus).set({ online: false, updatedAt: now }).where(eq(driverStatus.userId, app.userId));
      await tx
        .update(rideOffers)
        .set({ status: 'CANCELLED', respondedAt: now })
        .where(and(eq(rideOffers.driverId, app.userId), eq(rideOffers.status, 'PENDING')));

      // A trip in progress is never yanked away; support decides how it ends.
      const [ride] = await tx
        .select({ id: rides.id })
        .from(rides)
        .where(and(eq(rides.driverId, app.userId), inArray(rides.status, [...ACTIVE_RIDE])))
        .limit(1);
      activeRideId = ride?.id ?? null;
      if (activeRideId) {
        await tx.insert(auditLogs).values({
          id: id('audit'), actorId: adminId, actorType: 'super_admin',
          action: 'super_admin.driver.suspended_with_active_ride', targetType: 'ride', targetId: activeRideId,
          metadata: { driverId: app.userId, reason },
        });
      }
    });

    if (activeRideId) {
      await this.notifications.notify({
        type: 'system',
        title: 'Suspended driver has an active trip',
        message: 'A driver was suspended while on a trip. Contact them and the rider to resolve it.',
        entityType: 'ride',
        entityId: activeRideId,
      });
    }
    await this.forceOffline(userId, reason);
    await this.tell(userId, 'Account suspended', `Your account was suspended: ${reason.replace(/[.\s]+$/, '')}.`, applicationId);
    return { ok: true as const };
  }

  async reactivate(adminId: string, applicationId: string, input: { scope: SuspendScope }) {
    const { scope } = input;
    let userId = '';
    await this.db.transaction(async (tx) => {
      const app = await this.lock(tx, applicationId);
      userId = app.userId;
      const [veh] = app.vehicleId
        ? await tx.select().from(vehicles).where(eq(vehicles.id, app.vehicleId)).limit(1)
        : [];
      const driverSuspended = app.status === 'SUSPENDED';
      const vehicleSuspended = veh?.verificationStatus === 'SUSPENDED';

      const doDriver = (scope === 'DRIVER' || scope === 'BOTH') && driverSuspended;
      const doVehicle = (scope === 'VEHICLE' || scope === 'BOTH') && vehicleSuspended;
      if (!doDriver && !doVehicle) apiError(409, 'Nothing to reactivate: this account is not suspended.', 'NOT_SUSPENDED');

      const now = new Date();
      if (doDriver) {
        assertTransition(app.status, 'APPROVED');
        await this.setStatus(tx, app, 'APPROVED', { suspensionReason: null });
        await tx.update(users).set({ kycStatus: 'APPROVED', updatedAt: now }).where(eq(users.id, app.userId));
        await this.record(tx, {
          adminId, app, target: 'DRIVER', targetId: app.userId, action: 'DRIVER_REACTIVATED',
          audit: 'super_admin.driver.reactivated', auditTarget: 'driver_application', from: 'SUSPENDED', to: 'APPROVED',
        });
      }
      if (doVehicle && veh) {
        await tx.update(vehicles).set({ verificationStatus: 'APPROVED', updatedAt: now }).where(eq(vehicles.id, veh.id));
        await tx
          .insert(driverStatus)
          .values({ userId: app.userId, activeVehicleId: veh.id })
          .onConflictDoUpdate({
            target: driverStatus.userId,
            set: { activeVehicleId: sql`coalesce(${driverStatus.activeVehicleId}, ${veh.id})`, updatedAt: now },
          });
        await this.record(tx, {
          adminId, app, target: 'VEHICLE', targetId: veh.id, action: 'VEHICLE_REACTIVATED',
          audit: 'super_admin.vehicle.reactivated', auditTarget: 'vehicle', from: 'SUSPENDED', to: 'APPROVED',
        });
      }
    });
    await this.tell(userId, 'Account reactivated', 'Your account has been reactivated. You can go online again.', applicationId);
    return { ok: true as const };
  }

  async addNote(adminId: string, applicationId: string, text: string) {
    const body = (text ?? '').trim();
    if (body.length < 1 || body.length > 2000) apiError(400, 'Write a note between 1 and 2000 characters.', 'BAD_NOTE');
    const app = await this.appOrFail(this.db, applicationId);
    await this.db.transaction(async (tx) => {
      await this.record(tx, {
        adminId, app, target: 'NOTE', targetId: app.id, action: 'NOTE_ADDED',
        audit: 'super_admin.driver_application.note_added', reason: body,
      });
    });
    return { ok: true as const };
  }

  /* ───────────────────────────── Helpers ───────────────────────────────── */

  private async appOrFail(db: DbExecutor, applicationId: string): Promise<AppRow> {
    const [app] = await db.select().from(driverApplications).where(eq(driverApplications.id, applicationId)).limit(1);
    if (!app) apiError(404, 'Application not found.', 'NOT_FOUND');
    return app;
  }

  /** Row lock: two admins acting on the same application are serialized. */
  private async lock(tx: Tx, applicationId: string): Promise<AppRow> {
    const [app] = await tx.select().from(driverApplications).where(eq(driverApplications.id, applicationId)).for('update');
    if (!app) apiError(404, 'Application not found.', 'NOT_FOUND');
    return app;
  }

  private async setStatus(
    tx: Tx,
    app: AppRow,
    status: ApplicationStatus,
    extra: Partial<typeof driverApplications.$inferInsert> = {},
  ) {
    await tx
      .update(driverApplications)
      .set({ status, version: app.version + 1, updatedAt: new Date(), ...extra })
      .where(eq(driverApplications.id, app.id));
  }

  private async record(
    tx: Tx,
    p: {
      adminId: string;
      app: AppRow;
      target: 'APPLICATION' | 'DOCUMENT' | 'VEHICLE' | 'DRIVER' | 'NOTE';
      targetId: string;
      action: string;
      audit: string;
      auditTarget?: 'driver_application' | 'application_document' | 'vehicle';
      from?: string | null;
      to?: string | null;
      reason?: string | null;
    },
  ) {
    await tx.insert(verificationReviews).values({
      id: id('vr'),
      applicationId: p.app.id,
      targetType: p.target,
      targetId: p.targetId,
      action: p.action,
      fromStatus: p.from ?? null,
      toStatus: p.to ?? null,
      reason: p.reason ?? null,
      adminId: p.adminId,
    });
    await tx.insert(auditLogs).values({
      id: id('audit'),
      actorId: p.adminId,
      actorType: 'super_admin',
      action: p.audit,
      targetType: p.auditTarget ?? 'driver_application',
      targetId: p.targetId,
      metadata: { applicationId: p.app.id, from: p.from ?? null, to: p.to ?? null, reason: p.reason ?? null },
    });
  }

  private async labelFor(subject: 'DRIVER' | 'VEHICLE', docType: string): Promise<string> {
    const all = await this.requirements.listAll();
    return all.find((r) => r.subject === subject && r.docType === docType)?.label ?? docType.replace(/[:_]/g, ' ');
  }

  private tell(userId: string, title: string, message: string, applicationId: string) {
    return this.notifications.notifyUser(userId, {
      type: 'driver_application',
      title,
      message,
      entityType: 'driver_application',
      entityId: applicationId,
    });
  }

  private async forceOffline(driverId: string, reason: string) {
    try {
      await this.offlineHook?.onDriverForcedOffline(driverId, reason);
    } catch (err) {
      this.logger.error(`Could not push offline state to driver ${driverId}: ${(err as Error).message}`);
    }
  }
}
