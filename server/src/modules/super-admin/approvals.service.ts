import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import {
  applicationDocuments,
  documentRequirements,
  driverApplications,
  driverDocuments,
  partnerDocuments,
  storedFiles,
  users,
  vehicles,
} from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { PARTNER_DOCUMENT_CATALOG, type PartnerType } from '../partner-documents/dto/partner-documents.dto';
import { evaluateBusinessGate } from './approval-gate';

export const BUSINESS_ROLES = ['hotel', 'restaurant', 'grocery', 'bus_operator', 'freight'] as const;
export const APPROVAL_ROLES = ['driver', ...BUSINESS_ROLES] as const;
export type ApprovalRole = (typeof APPROVAL_ROLES)[number];

/** The three tabs of the approvals inbox. */
export type ApprovalBucket = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Why an item is where it is: drives the label on the row. */
export type ApprovalStage =
  | 'AWAITING_DOCUMENTS'
  | 'IN_REVIEW'
  | 'READY_TO_APPROVE'
  | 'WAITING_ON_PARTNER'
  | 'VEHICLE_CHANGED'
  | 'APPROVED'
  | 'REJECTED';

export interface RecordDocument {
  id: string;
  source: 'partner' | 'application' | 'driver_legacy';
  label: string;
  /** Driver documents only: whether it belongs to the driver or the vehicle. */
  group: 'DRIVER' | 'VEHICLE' | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Public path under the API origin (partner and legacy driver documents). */
  fileUrl: string | null;
  /** Private stored-file id, fetched with the super-admin token (driver applications). */
  fileId: string | null;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  reviewNote: string | null;
}

interface Entry {
  userId: string;
  name: string;
  email: string;
  mobile: string | null;
  role: ApprovalRole;
  businessName: string | null;
  businessAddress: string | null;
  createdAt: string;
  submittedAt: string;
  bucket: ApprovalBucket;
  stage: ApprovalStage;
  applicationId: string | null;
  documents: RecordDocument[];
}

export interface ApprovalFilters {
  status?: ApprovalBucket;
  type?: string;
  q?: string;
}

const MAX_ROWS = 500;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const humanize = (docType: string) => {
  const t = docType.replace(/^photo:/, '').replace(/[_:]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const isApprovalRole = (r: string): r is ApprovalRole => (APPROVAL_ROLES as readonly string[]).includes(r);
const isBusinessRole = (r: string): r is PartnerType => (BUSINESS_ROLES as readonly string[]).includes(r);

/**
 * One inbox for every registration a super admin has to decide on: drivers and
 * every kind of business. It reads from the existing tables (users, driver
 * applications, partner documents) and owns no data of its own, so the detailed
 * per-driver review and the per-document decisions keep their existing
 * endpoints.
 */
@Injectable()
export class ApprovalsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  /** The inbox: filtered items plus a count per tab (counted before the status filter). */
  async list(filters: ApprovalFilters) {
    const entries = await this.load(filters);
    const counts: Record<ApprovalBucket, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const e of entries) counts[e.bucket] += 1;

    const bucket = filters.status ?? 'PENDING';
    const items = entries
      .filter((e) => e.bucket === bucket)
      .map((e) => {
        const docs = e.documents;
        return {
          userId: e.userId,
          name: e.name,
          role: e.role,
          businessName: e.businessName,
          mobile: e.mobile,
          email: e.email,
          submittedAt: e.submittedAt,
          status: e.bucket,
          stage: e.stage,
          applicationId: e.applicationId,
          documents: {
            uploaded: docs.length,
            pending: docs.filter((d) => d.status === 'PENDING').length,
            approved: docs.filter((d) => d.status === 'APPROVED').length,
            rejected: docs.filter((d) => d.status === 'REJECTED').length,
          },
        };
      });

    return { items, counts };
  }

  /** Partner Docs: every partner with their details and all their documents. */
  async records(filters: ApprovalFilters) {
    const entries = await this.load(filters);
    const items = entries
      .filter((e) => !filters.status || e.bucket === filters.status)
      .map((e) => ({
        userId: e.userId,
        name: e.name,
        role: e.role,
        businessName: e.businessName,
        businessAddress: e.businessAddress,
        mobile: e.mobile,
        email: e.email,
        registeredAt: e.createdAt,
        status: e.bucket,
        stage: e.stage,
        applicationId: e.applicationId,
        documents: e.documents,
      }));
    return { items };
  }

  /**
   * What the review page for one registration should render. A driver is handed
   * off to the application review (its own endpoints); a business gets its
   * details, documents and the approval gate right here.
   */
  async resolve(userId: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u || !isApprovalRole(u.role)) apiError(404, 'Registration not found.');

    if (u.role === 'driver') {
      const [app] = await this.db
        .select({ id: driverApplications.id, status: driverApplications.status })
        .from(driverApplications)
        .where(eq(driverApplications.userId, userId))
        .limit(1);
      if (!app) apiError(404, 'This driver has not started an application yet.');

      // Vehicles the driver added or edited after approval sit at PENDING and
      // are not part of the application snapshot, so surface them separately.
      const pendingVehicles = await this.db
        .select({
          id: vehicles.id,
          category: vehicles.category,
          makeModel: vehicles.makeModel,
          plateNumber: vehicles.plateNumber,
          verificationStatus: vehicles.verificationStatus,
        })
        .from(vehicles)
        .where(and(eq(vehicles.driverId, userId), eq(vehicles.isActive, true), eq(vehicles.verificationStatus, 'PENDING')));

      return { kind: 'driver' as const, userId, applicationId: app.id, applicationStatus: app.status, pendingVehicles };
    }

    if (!isBusinessRole(u.role)) apiError(404, 'Registration not found.');
    const role: PartnerType = u.role;
    const rows = await this.db.select().from(partnerDocuments).where(eq(partnerDocuments.partnerId, userId));
    const byType = new Map(rows.map((r) => [r.type, r]));

    const documents = PARTNER_DOCUMENT_CATALOG[role].map((spec) => {
      const row = byType.get(spec.type);
      return {
        id: row?.id ?? null,
        type: spec.type,
        label: spec.label,
        hint: spec.hint,
        required: spec.required,
        status: row ? row.status : ('NOT_UPLOADED' as const),
        fileUrl: row?.fileUrl ?? null,
        fileName: row?.fileName ?? null,
        mimeType: row?.mimeType ?? null,
        reviewNote: row?.reviewNote ?? null,
        updatedAt: row ? row.updatedAt.toISOString() : null,
      };
    });

    return {
      kind: 'business' as const,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        role,
        kycStatus: u.kycStatus,
        businessName: u.businessName,
        businessAddress: u.businessAddress,
        createdAt: u.createdAt.toISOString(),
      },
      documents,
      gate: evaluateBusinessGate(role, rows.map((r) => ({ type: r.type, status: r.status }))),
    };
  }

  /* ───────────────────────────── internals ─────────────────────────────── */

  private async load(filters: ApprovalFilters): Promise<Entry[]> {
    const roles = filters.type && isApprovalRole(filters.type) ? [filters.type] : [...APPROVAL_ROLES];
    const conds = [inArray(users.role, roles)];
    const term = filters.q?.trim();
    if (term) {
      const like = `%${escapeLike(term)}%`;
      conds.push(
        or(ilike(users.name, like), ilike(users.email, like), ilike(users.mobile, like), ilike(users.businessName, like))!,
      );
    }

    const people = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        role: users.role,
        kycStatus: users.kycStatus,
        businessName: users.businessName,
        businessAddress: users.businessAddress,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conds))
      .orderBy(desc(users.createdAt))
      .limit(MAX_ROWS);
    if (people.length === 0) return [];

    const businessIds = people.filter((p) => isBusinessRole(p.role)).map((p) => p.id);
    const driverIds = people.filter((p) => p.role === 'driver').map((p) => p.id);

    const [partnerDocs, apps, legacyDocs, pendingVehicles, requirementLabels] = await Promise.all([
      businessIds.length
        ? this.db.select().from(partnerDocuments).where(inArray(partnerDocuments.partnerId, businessIds))
        : Promise.resolve([]),
      driverIds.length
        ? this.db.select().from(driverApplications).where(inArray(driverApplications.userId, driverIds))
        : Promise.resolve([]),
      driverIds.length
        ? this.db.select().from(driverDocuments).where(inArray(driverDocuments.driverId, driverIds))
        : Promise.resolve([]),
      driverIds.length
        ? this.db
            .select({ driverId: vehicles.driverId })
            .from(vehicles)
            .where(and(inArray(vehicles.driverId, driverIds), eq(vehicles.isActive, true), eq(vehicles.verificationStatus, 'PENDING')))
        : Promise.resolve([]),
      driverIds.length
        ? this.db.select({ docType: documentRequirements.docType, label: documentRequirements.label }).from(documentRequirements)
        : Promise.resolve([]),
    ]);

    const appIds = apps.map((a) => a.id);
    const appDocs = appIds.length
      ? await this.db
          .select({ doc: applicationDocuments, file: storedFiles })
          .from(applicationDocuments)
          .innerJoin(storedFiles, eq(storedFiles.id, applicationDocuments.fileId))
          .where(and(inArray(applicationDocuments.applicationId, appIds), isNull(applicationDocuments.supersededById)))
      : [];

    const labelFor = new Map<string, string>();
    for (const r of requirementLabels) if (!labelFor.has(r.docType)) labelFor.set(r.docType, r.label);

    const partnerDocsBy = groupBy(partnerDocs, (d) => d.partnerId);
    const legacyBy = groupBy(legacyDocs, (d) => d.driverId);
    const appByUser = new Map(apps.map((a) => [a.userId, a]));
    const appDocsBy = groupBy(appDocs, (d) => d.doc.applicationId);
    const driversWithPendingVehicle = new Set(pendingVehicles.map((v) => v.driverId));

    const entries: Entry[] = [];
    for (const p of people) {
      if (!isApprovalRole(p.role)) continue;
      const base = {
        userId: p.id,
        name: p.name,
        email: p.email,
        mobile: p.mobile,
        role: p.role,
        businessName: p.businessName,
        businessAddress: p.businessAddress,
        createdAt: p.createdAt.toISOString(),
      };

      if (isBusinessRole(p.role)) {
        const rows = partnerDocsBy.get(p.id) ?? [];
        const catalog = PARTNER_DOCUMENT_CATALOG[p.role];
        const documents: RecordDocument[] = rows.map((r) => ({
          id: r.id,
          source: 'partner',
          label: catalog.find((c) => c.type === r.type)?.label ?? humanize(r.type),
          group: null,
          status: r.status === 'SUSPENDED' ? 'REJECTED' : r.status,
          fileUrl: r.fileUrl,
          fileId: null,
          fileName: r.fileName,
          mimeType: r.mimeType,
          uploadedAt: r.updatedAt.toISOString(),
          reviewNote: r.reviewNote,
        }));

        const gate = evaluateBusinessGate(p.role, rows.map((r) => ({ type: r.type, status: r.status })));
        const bucket: ApprovalBucket = p.kycStatus === 'APPROVED' ? 'APPROVED' : p.kycStatus === 'SUSPENDED' ? 'REJECTED' : 'PENDING';
        const stage: ApprovalStage =
          bucket === 'APPROVED'
            ? 'APPROVED'
            : bucket === 'REJECTED'
              ? 'REJECTED'
              : gate.ok
                ? 'READY_TO_APPROVE'
                : rows.some((r) => r.status === 'PENDING')
                  ? 'IN_REVIEW'
                  : 'AWAITING_DOCUMENTS';

        entries.push({ ...base, bucket, stage, applicationId: null, submittedAt: p.createdAt.toISOString(), documents });
        continue;
      }

      // Driver.
      const app = appByUser.get(p.id);
      if (!app || app.status === 'DRAFT') continue; // nothing to decide yet

      const docs: RecordDocument[] = (appDocsBy.get(app.id) ?? []).map(({ doc, file }) => ({
        id: doc.id,
        source: 'application',
        label: labelFor.get(doc.docType) ?? humanize(doc.docType),
        group: doc.subject,
        status: doc.status === 'APPROVED' ? 'APPROVED' : doc.status === 'PENDING' ? 'PENDING' : 'REJECTED',
        fileUrl: null,
        fileId: file.id,
        fileName: file.originalName,
        mimeType: file.mimeType,
        uploadedAt: doc.createdAt.toISOString(),
        reviewNote: doc.rejectionReason,
      }));
      for (const l of legacyBy.get(p.id) ?? []) {
        docs.push({
          id: l.id,
          source: 'driver_legacy',
          label: humanize(l.type),
          group: 'DRIVER',
          status: l.status === 'SUSPENDED' ? 'REJECTED' : l.status,
          fileUrl: l.fileUrl,
          fileId: null,
          fileName: l.fileName,
          mimeType: l.mimeType,
          uploadedAt: l.updatedAt.toISOString(),
          reviewNote: l.reviewNote,
        });
      }

      let bucket: ApprovalBucket;
      let stage: ApprovalStage;
      switch (app.status) {
        case 'SUBMITTED':
        case 'UNDER_REVIEW':
          bucket = 'PENDING';
          stage = 'IN_REVIEW';
          break;
        case 'RESUBMISSION_REQUIRED':
          bucket = 'PENDING';
          stage = 'WAITING_ON_PARTNER';
          break;
        case 'APPROVED':
          if (driversWithPendingVehicle.has(p.id)) {
            bucket = 'PENDING';
            stage = 'VEHICLE_CHANGED';
          } else {
            bucket = 'APPROVED';
            stage = 'APPROVED';
          }
          break;
        default: // REJECTED, SUSPENDED, EXPIRED
          bucket = 'REJECTED';
          stage = 'REJECTED';
      }

      entries.push({
        ...base,
        bucket,
        stage,
        applicationId: app.id,
        submittedAt: (app.submittedAt ?? app.createdAt).toISOString(),
        documents: docs,
      });
    }
    return entries;
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
