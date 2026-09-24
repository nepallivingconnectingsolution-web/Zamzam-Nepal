import { HttpException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import {
  applicationDocuments,
  driverApplications,
  driverProfiles,
  users,
  vehicles,
  verificationReviews,
} from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import { DEFAULT_MAX_WEIGHT_KG } from '../vehicles/vehicles.service';
import { assertTransition, type ApplicationStatus } from './application-state';
import { evaluateSubmitGate, type GateBlocker, type GateDocStatus } from './application-gates';
import { assertPlateUsable } from './plate.check';
import { currentDocFor, loadApplicationSnapshot, type AppRow, type ProfileRow, type VehicleRow } from './application-snapshot';
import { normalizePlate } from './plate.util';
import { RequirementsService, type Requirement } from './requirements.service';
import { StorageService } from './files/storage.service';
import type { SaveProfileDto, SaveVehicleDto } from './dto/application.dto';


/** The driver can edit their answers only in these states. */
const EDITABLE: ApplicationStatus[] = ['DRAFT', 'RESUBMISSION_REQUIRED', 'EXPIRED'];
/** A current document in one of these states may be replaced even after submission. */
const REPLACEABLE: GateDocStatus[] = ['REJECTED', 'EXPIRED', 'RESUBMISSION_REQUIRED'];

export interface CurrentDocView {
  id: string;
  status: GateDocStatus;
  rejectionReason: string | null;
  expiryDate: string | null;
  fileId: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
}

export interface ApplicationView {
  application: {
    id: string;
    status: ApplicationStatus;
    currentStep: number;
    version: number;
    rejectionReason: string | null;
    suspensionReason: string | null;
    submittedAt: string | null;
    isLegacy: boolean;
  };
  profile: ProfileRow | null;
  vehicle: {
    id: string;
    category: string;
    plateNumber: string;
    make: string | null;
    model: string | null;
    manufactureYear: number | null;
    registrationYear: number | null;
    color: string | null;
    fuelType: string | null;
    serviceClass: string | null;
    seats: number;
    verificationStatus: string;
  } | null;
  requirements: (Requirement & { current: CurrentDocView | null })[];
  blockers: GateBlocker[];
  canSubmit: boolean;
  statusMessage: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const sentence = (s: string) => s.trim().replace(/[.\s]+$/, '');

@Injectable()
export class ApplicationService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly requirements: RequirementsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ───────────────────────────── Reads ─────────────────────────────────── */

  async getOrCreate(userId: string): Promise<ApplicationView> {
    return this.buildView(await this.ensureApplication(userId));
  }

  private async ensureApplication(userId: string): Promise<AppRow> {
    const find = async () =>
      (await this.db.select().from(driverApplications).where(eq(driverApplications.userId, userId)).limit(1))[0];
    const existing = await find();
    if (existing) return existing;
    await this.db.insert(driverApplications).values({ id: id('app'), userId }).onConflictDoNothing();
    return (await find())!;
  }

  private async buildView(app: AppRow): Promise<ApplicationView> {
    const snap = await loadApplicationSnapshot(this.db, this.requirements, app);
    const { profile, vehicle } = snap;

    const withCurrent = snap.requirements.map((r) => {
      const row = currentDocFor(snap, r);
      const current: CurrentDocView | null = row
        ? {
            id: row.doc.id,
            status: row.doc.status,
            rejectionReason: row.doc.rejectionReason,
            expiryDate: row.doc.expiryDate,
            fileId: row.file.id,
            originalName: row.file.originalName,
            mimeType: row.file.mimeType,
            uploadedAt: row.doc.createdAt.toISOString(),
          }
        : null;
      return { ...r, current };
    });

    const gate = evaluateSubmitGate(snap.gateInput);

    return {
      application: {
        id: app.id,
        status: app.status,
        currentStep: app.currentStep,
        version: app.version,
        rejectionReason: app.rejectionReason,
        suspensionReason: app.suspensionReason,
        submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
        isLegacy: app.isLegacy,
      },
      profile: profile ?? null,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            category: vehicle.category,
            plateNumber: vehicle.plateNumber,
            make: vehicle.make,
            model: vehicle.model,
            manufactureYear: vehicle.manufactureYear,
            registrationYear: vehicle.registrationYear,
            color: vehicle.color,
            fuelType: vehicle.fuelType,
            serviceClass: vehicle.serviceClass,
            seats: vehicle.seats,
            verificationStatus: vehicle.verificationStatus,
          }
        : null,
      requirements: withCurrent,
      blockers: gate.blockers,
      canSubmit: EDITABLE.includes(app.status) && gate.ok,
      statusMessage: this.statusMessage(app, withCurrent),
    };
  }

  private statusMessage(app: AppRow, reqs: { label: string; current: CurrentDocView | null }[]): string {
    switch (app.status) {
      case 'DRAFT':
        return 'Finish your application to start driving with ZamZam.';
      case 'SUBMITTED':
        return 'Your application is submitted and waiting for review.';
      case 'UNDER_REVIEW':
        return 'Your application is under review.';
      case 'RESUBMISSION_REQUIRED': {
        const bad = reqs.find((r) => r.current && REPLACEABLE.includes(r.current.status));
        if (bad?.current?.rejectionReason) {
          return `Your ${bad.label} was rejected: ${sentence(bad.current.rejectionReason)}. Please upload a new one.`;
        }
        if (bad) return `Your ${bad.label} needs to be replaced. Please upload a new one.`;
        return app.rejectionReason
          ? `Some items need to be updated: ${sentence(app.rejectionReason)}.`
          : 'Some items need to be updated.';
      }
      case 'APPROVED':
        return 'Your ZamZam Driver account has been approved.';
      case 'REJECTED':
        return app.rejectionReason
          ? `Your application was rejected: ${sentence(app.rejectionReason)}.`
          : 'Your application was rejected.';
      case 'SUSPENDED':
        return app.suspensionReason
          ? `Your account is suspended: ${sentence(app.suspensionReason)}.`
          : 'Your account is suspended.';
      case 'EXPIRED':
        return 'A licence or document has expired. Upload a valid one to continue.';
    }
  }

  private assertEditable(status: ApplicationStatus) {
    if (!EDITABLE.includes(status)) {
      apiError(
        409,
        'Your application is with our team, so it is locked for now. You can edit it again if we ask for changes.',
        'LOCKED',
      );
    }
  }

  /* ───────────────────────────── Writes ────────────────────────────────── */

  async saveProfile(userId: string, dto: SaveProfileDto): Promise<ApplicationView> {
    const app = await this.ensureApplication(userId);
    this.assertEditable(app.status);

    const [existing] = await this.db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId)).limit(1);

    if (dto.dateOfBirth) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      if (dto.dateOfBirth > cutoff.toISOString().slice(0, 10)) {
        apiError(400, 'You must be at least 18 years old to drive with ZamZam.', 'UNDERAGE');
      }
    }
    const issue = dto.licenceIssueDate ?? existing?.licenceIssueDate;
    const expiry = dto.licenceExpiryDate ?? existing?.licenceExpiryDate;
    if (issue && expiry && expiry <= issue) {
      apiError(400, 'The licence expiry date must be after its issue date.', 'LICENCE_DATES');
    }

    const { currentStep, ...fields } = dto;
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const now = new Date();
    await this.db
      .insert(driverProfiles)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: driverProfiles.userId, set: { ...set, updatedAt: now } });

    if (currentStep) {
      await this.db
        .update(driverApplications)
        .set({ currentStep, updatedAt: now })
        .where(eq(driverApplications.id, app.id));
    }
    return this.getOrCreate(userId);
  }

  async saveVehicle(userId: string, dto: SaveVehicleDto): Promise<ApplicationView> {
    const app = await this.ensureApplication(userId);
    this.assertEditable(app.status);

    const displayPlate = dto.plateNumber.trim().toUpperCase();
    const ownActive = (cond: ReturnType<typeof eq>) =>
      this.db
        .select()
        .from(vehicles)
        .where(and(cond, eq(vehicles.driverId, userId), eq(vehicles.isActive, true)))
        .limit(1);

    let vehicle: VehicleRow | undefined;
    if (app.vehicleId) [vehicle] = await ownActive(eq(vehicles.id, app.vehicleId));
    if (!vehicle) {
      // A vehicle this driver registered through the older single-form flow: adopt it.
      [vehicle] = await ownActive(eq(vehicles.plateNormalized, normalizePlate(displayPlate)));
    }

    const plateNormalized = await assertPlateUsable(this.db, dto.category, displayPlate, vehicle?.id);
    const fields = {
      category: dto.category,
      make: dto.make,
      model: dto.model,
      makeModel: `${dto.make} ${dto.model}`,
      plateNumber: displayPlate,
      plateNormalized,
      color: dto.color,
      manufactureYear: dto.manufactureYear,
      registrationYear: dto.registrationYear ?? null,
      fuelType: dto.fuelType ?? null,
      serviceClass: dto.serviceClass || null,
      seats: dto.seats ?? (dto.category === 'bike' ? 1 : 4),
    };

    let vehicleId: string;
    if (vehicle) {
      const identityChanged = plateNormalized !== vehicle.plateNormalized || dto.category !== vehicle.category;
      await this.db
        .update(vehicles)
        .set({
          ...fields,
          ...(identityChanged ? { verificationStatus: 'PENDING' as const } : {}),
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, vehicle.id));
      vehicleId = vehicle.id;
    } else {
      vehicleId = id('veh');
      try {
        await this.db.insert(vehicles).values({
          id: vehicleId,
          driverId: userId,
          ...fields,
          maxWeightKg: DEFAULT_MAX_WEIGHT_KG[dto.category],
        });
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          apiError(409, 'A vehicle with this number plate is already registered.', 'PLATE_TAKEN');
        }
        throw err;
      }
    }

    await this.db
      .update(driverApplications)
      .set({ vehicleId, updatedAt: new Date() })
      .where(eq(driverApplications.id, app.id));
    return this.getOrCreate(userId);
  }

  async uploadFile(
    userId: string,
    input: { docType: string; expiryDate?: string; file: Express.Multer.File },
  ): Promise<ApplicationView> {
    const app = await this.ensureApplication(userId);
    const { docType, expiryDate, file } = input;

    if (docType === 'profile_photo') {
      this.assertEditable(app.status);
      const saved = await this.storage.save(userId, file, { imagesOnly: true });
      const [prev] = await this.db.select({ f: driverProfiles.photoFileId }).from(driverProfiles).where(eq(driverProfiles.userId, userId)).limit(1);
      const now = new Date();
      await this.db
        .insert(driverProfiles)
        .values({ userId, photoFileId: saved.id })
        .onConflictDoUpdate({ target: driverProfiles.userId, set: { photoFileId: saved.id, updatedAt: now } });
      if (prev?.f && prev.f !== saved.id) await this.storage.remove(prev.f).catch(() => undefined);
      return this.getOrCreate(userId);
    }

    let vehicle: VehicleRow | null = null;
    if (app.vehicleId) {
      [vehicle = null] = await this.db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, app.vehicleId), eq(vehicles.isActive, true)))
        .limit(1);
    }
    const reqs = await this.requirements.forVehicle(vehicle?.category ?? null, vehicle?.serviceClass ?? null);
    const req = reqs.find((r) => r.docType === docType);
    if (!req) {
      const needsVehicle = (await this.requirements.listAll()).some((r) => r.docType === docType && r.subject === 'VEHICLE');
      apiError(
        400,
        needsVehicle && !vehicle
          ? 'Add your vehicle details before uploading vehicle documents.'
          : 'That document is not needed for your application.',
        needsVehicle && !vehicle ? 'NO_VEHICLE' : 'UNKNOWN_DOCUMENT',
      );
    }

    const scope = req.subject === 'DRIVER' ? 'driver' : vehicle!.id;
    const [current] = await this.db
      .select()
      .from(applicationDocuments)
      .where(
        and(
          eq(applicationDocuments.applicationId, app.id),
          eq(applicationDocuments.scope, scope),
          eq(applicationDocuments.docType, docType),
          isNull(applicationDocuments.supersededById),
        ),
      )
      .limit(1);

    const canWrite = current
      ? EDITABLE.includes(app.status) || REPLACEABLE.includes(current.status)
      : EDITABLE.includes(app.status) || app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW';
    if (!canWrite) {
      apiError(
        409,
        'This document has already been submitted. You can replace it if we ask for a new one.',
        'LOCKED',
      );
    }

    if (req.requiresExpiry) {
      if (!expiryDate) apiError(400, `Enter the expiry date for your ${req.label}.`, 'EXPIRY_REQUIRED');
      if (expiryDate <= today()) {
        apiError(400, `This ${req.label} has already expired. Upload a valid one.`, 'DOCUMENT_EXPIRED');
      }
    }

    const saved = await this.storage.save(userId, file, { imagesOnly: req.kind === 'PHOTO' });
    const newId = id('adoc');
    try {
      await this.db.transaction(async (tx) => {
        // Supersede first: the partial unique index allows only one current row per document.
        if (current) {
          await tx.update(applicationDocuments).set({ supersededById: newId }).where(eq(applicationDocuments.id, current.id));
        }
        await tx.insert(applicationDocuments).values({
          id: newId,
          applicationId: app.id,
          subject: req.subject,
          scope,
          vehicleId: req.subject === 'VEHICLE' ? vehicle!.id : null,
          docType,
          fileId: saved.id,
          expiryDate: expiryDate ?? null,
        });
      });
    } catch (err) {
      await this.storage.remove(saved.id).catch(() => undefined);
      if ((err as { code?: string }).code === '23505') {
        apiError(409, 'This document was just updated. Reload and try again.', 'CONFLICT');
      }
      throw err;
    }
    return this.getOrCreate(userId);
  }

  async deleteFile(userId: string, docId: string): Promise<ApplicationView> {
    const app = await this.ensureApplication(userId);
    if (app.status !== 'DRAFT') {
      apiError(409, 'You can only remove uploads while your application is a draft.', 'LOCKED');
    }
    const [doc] = await this.db
      .select()
      .from(applicationDocuments)
      .where(
        and(
          eq(applicationDocuments.id, docId),
          eq(applicationDocuments.applicationId, app.id),
          isNull(applicationDocuments.supersededById),
        ),
      )
      .limit(1);
    if (!doc) apiError(404, 'Document not found.', 'NOT_FOUND');

    await this.db.delete(applicationDocuments).where(eq(applicationDocuments.id, doc.id));
    await this.storage.remove(doc.fileId).catch(() => undefined);
    return this.getOrCreate(userId);
  }

  async submit(userId: string): Promise<ApplicationView> {
    const app = await this.ensureApplication(userId);
    assertTransition(app.status, 'SUBMITTED');

    const view = await this.buildView(app);
    if (view.blockers.length > 0) {
      throw new HttpException(
        { message: view.blockers[0].message, code: 'SUBMIT_BLOCKED', details: view.blockers },
        400,
      );
    }

    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(driverApplications)
        .where(eq(driverApplications.id, app.id))
        .for('update');
      assertTransition(locked.status, 'SUBMITTED');
      await tx
        .update(driverApplications)
        .set({
          status: 'SUBMITTED',
          submittedAt: now,
          version: locked.version + 1,
          rejectionReason: null,
          currentStep: 8,
          updatedAt: now,
        })
        .where(eq(driverApplications.id, app.id));
      await tx.insert(verificationReviews).values({
        id: id('vr'),
        applicationId: app.id,
        targetType: 'APPLICATION',
        targetId: app.id,
        action: locked.status === 'DRAFT' ? 'SUBMITTED' : 'RESUBMITTED',
        fromStatus: locked.status,
        toStatus: 'SUBMITTED',
      });
    });

    const [user] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    await this.notifications.notifyUser(userId, {
      type: 'driver_application',
      title: 'Application submitted',
      message: 'We received your application and will review it shortly.',
      entityType: 'driver_application',
      entityId: app.id,
    });
    await this.notifications.notify({
      type: 'partner_registration',
      title: 'Driver application submitted',
      message: `${view.profile?.legalName ?? user?.name ?? 'A driver'} submitted an application for review.`,
      entityType: 'driver_application',
      entityId: app.id,
    });
    return this.getOrCreate(userId);
  }

  /** A rejected applicant starts over from their existing answers. */
  async reopen(userId: string): Promise<ApplicationView> {
    const app = await this.ensureApplication(userId);
    assertTransition(app.status, 'DRAFT');
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(driverApplications).where(eq(driverApplications.id, app.id)).for('update');
      assertTransition(locked.status, 'DRAFT');
      await tx
        .update(driverApplications)
        .set({ status: 'DRAFT', rejectionReason: null, currentStep: 1, version: locked.version + 1, updatedAt: now })
        .where(eq(driverApplications.id, app.id));
      await tx.insert(verificationReviews).values({
        id: id('vr'),
        applicationId: app.id,
        targetType: 'APPLICATION',
        targetId: app.id,
        action: 'REOPENED',
        fromStatus: locked.status,
        toStatus: 'DRAFT',
      });
    });
    return this.getOrCreate(userId);
  }
}
