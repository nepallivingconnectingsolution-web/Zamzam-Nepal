import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import {
  applicationDocuments,
  documentRequirements,
  driverApplications,
  driverProfiles,
  driverStatus,
  rides,
  users,
  vehicles,
} from '../../database/schema';
import type { DbExecutor } from '../driver-onboarding/db-types';
import {
  DEFAULT_LOCATION_FRESH_MS,
  evaluateEligibility,
  type EligibilityOptions,
  type EligibilityResult,
  type EligibilitySnapshot,
} from './eligibility';
import { LOCATION_STORE, type LocationStore } from './location.store';

export const ACTIVE_RIDE_STATUSES = ['ACCEPTED', 'ONGOING', 'PAYMENT_PENDING'] as const;

export type CheckOptions = Omit<EligibilityOptions, 'now' | 'locationFreshMs'>;

const EMPTY: EligibilitySnapshot = {
  role: null,
  kycStatus: null,
  application: null,
  vehicle: null,
  licenceExpiryDate: null,
  expiredRequiredDocs: 0,
  online: false,
  lastLocationAt: null,
  hasActiveRide: false,
};

/**
 * isDriverEligibleForRide, in one place. Go-online, ride matching and offer
 * acceptance all call check(); none of them re-implements a rule. Pass the open
 * transaction as `executor` to evaluate against locked, consistent rows.
 */
@Injectable()
export class EligibilityService {
  private readonly freshMs: number;

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    @Inject(LOCATION_STORE) private readonly locations: LocationStore,
    @Optional() config?: ConfigService,
  ) {
    const seconds = Number(config?.get('LOCATION_FRESH_SECONDS'));
    this.freshMs = seconds > 0 ? seconds * 1000 : DEFAULT_LOCATION_FRESH_MS;
  }

  async check(driverId: string, opts: CheckOptions, executor: DbExecutor = this.db): Promise<EligibilityResult> {
    const snapshot = await this.snapshot(driverId, executor);
    return evaluateEligibility(snapshot, { ...opts, locationFreshMs: this.freshMs });
  }

  private async snapshot(driverId: string, db: DbExecutor): Promise<EligibilitySnapshot> {
    const [user] = await db
      .select({ role: users.role, kycStatus: users.kycStatus })
      .from(users)
      .where(eq(users.id, driverId))
      .limit(1);
    if (!user) return EMPTY;

    const [app] = await db
      .select({ id: driverApplications.id, status: driverApplications.status, isLegacy: driverApplications.isLegacy })
      .from(driverApplications)
      .where(eq(driverApplications.userId, driverId))
      .limit(1);

    const [ds] = await db
      .select({ online: driverStatus.online, activeVehicleId: driverStatus.activeVehicleId })
      .from(driverStatus)
      .where(eq(driverStatus.userId, driverId))
      .limit(1);

    let vehicle: typeof vehicles.$inferSelect | undefined;
    if (ds?.activeVehicleId) {
      [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, ds.activeVehicleId)).limit(1);
    }

    const [profile] = await db
      .select({ licenceExpiryDate: driverProfiles.licenceExpiryDate })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, driverId))
      .limit(1);

    // Only REQUIRED documents count: an expired optional one never blocks a driver.
    let expiredRequiredDocs = 0;
    if (app && vehicle) {
      const today = new Date().toISOString().slice(0, 10);
      const [row] = await db
        .select({ n: sql<number>`count(distinct ${applicationDocuments.id})` })
        .from(applicationDocuments)
        .innerJoin(
          documentRequirements,
          and(
            eq(documentRequirements.subject, applicationDocuments.subject),
            eq(documentRequirements.docType, applicationDocuments.docType),
            eq(documentRequirements.isRequired, true),
            or(eq(documentRequirements.vehicleType, ''), eq(documentRequirements.vehicleType, vehicle.category)),
          ),
        )
        .where(
          and(
            eq(applicationDocuments.applicationId, app.id),
            isNull(applicationDocuments.supersededById),
            lte(applicationDocuments.expiryDate, today),
          ),
        );
      expiredRequiredDocs = Number(row?.n ?? 0);
    }

    const [activeRide] = await db
      .select({ id: rides.id })
      .from(rides)
      .where(and(eq(rides.driverId, driverId), inArray(rides.status, [...ACTIVE_RIDE_STATUSES])))
      .limit(1);

    const position = await this.locations.get(driverId);

    return {
      role: user.role,
      kycStatus: user.kycStatus,
      application: app ? { status: app.status, isLegacy: app.isLegacy } : null,
      vehicle: vehicle
        ? { category: vehicle.category, verificationStatus: vehicle.verificationStatus, isActive: vehicle.isActive }
        : null,
      licenceExpiryDate: profile?.licenceExpiryDate ?? null,
      expiredRequiredDocs,
      online: ds?.online ?? false,
      lastLocationAt: position ? new Date(position.ts) : null,
      hasActiveRide: !!activeRide,
    };
  }
}
