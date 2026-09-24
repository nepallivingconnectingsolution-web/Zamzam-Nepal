import type { ApplicationStatus } from '../driver-onboarding/application-state';
import { SERVICE_CATEGORIES } from '../vehicles/vehicles.service';

export type EligibilityCode =
  | 'NOT_DRIVER'
  | 'APPLICATION_NOT_APPROVED'
  | 'APPLICATION_EXPIRED'
  | 'DRIVER_SUSPENDED'
  | 'NO_ACTIVE_VEHICLE'
  | 'VEHICLE_NOT_APPROVED'
  | 'VEHICLE_SUSPENDED'
  | 'VEHICLE_TYPE_MISMATCH'
  | 'LICENCE_EXPIRED'
  | 'DOCUMENT_EXPIRED'
  | 'DRIVER_OFFLINE'
  | 'LOCATION_STALE'
  | 'ACTIVE_RIDE';

export interface EligibilityReason {
  code: EligibilityCode;
  message: string;
}

export interface EligibilitySnapshot {
  role: string | null;
  kycStatus: string | null;
  application: { status: ApplicationStatus; isLegacy: boolean } | null;
  vehicle: { category: string; verificationStatus: string; isActive: boolean } | null;
  licenceExpiryDate: string | null;
  /** Current required documents whose expiry date has passed. */
  expiredRequiredDocs: number;
  online: boolean;
  lastLocationAt: Date | null;
  hasActiveRide: boolean;
}

export interface EligibilityOptions {
  serviceType?: 'taxi' | 'bike' | 'parcel';
  /** true for matching; false for the go-online check itself */
  requireOnline: boolean;
  requireLocation: boolean;
  now?: Date;
  locationFreshMs?: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: EligibilityReason[];
}

export const DEFAULT_LOCATION_FRESH_MS = 90_000;

const M = {
  NOT_DRIVER: 'This account is not a driver account.',
  APPLICATION_NOT_APPROVED: "Your driver application hasn't been approved yet.",
  APPLICATION_EXPIRED: 'A licence or document has expired. Upload a valid one to go online.',
  DRIVER_SUSPENDED: 'Your account is suspended. Contact support for help.',
  NO_ACTIVE_VEHICLE: 'You have no approved vehicle selected. Add one under Vehicle.',
  VEHICLE_NOT_APPROVED: 'Your vehicle is not approved yet.',
  VEHICLE_SUSPENDED: 'Your vehicle is suspended. Contact support for help.',
  VEHICLE_TYPE_MISMATCH: 'Your vehicle cannot serve this kind of request.',
  LICENCE_EXPIRED: 'Your driving licence has expired. Please upload a valid licence.',
  DOCUMENT_EXPIRED: 'One of your vehicle documents has expired. Upload a valid one.',
  DRIVER_OFFLINE: 'You are offline.',
  LOCATION_STALE: "We can't see your location. Turn on location and try again.",
  ACTIVE_RIDE: 'Finish your current trip first.',
} satisfies Record<EligibilityCode, string>;

/**
 * The one place that decides whether a driver may go online or receive a
 * ride. Pure: it works on a snapshot, so every rule is unit-testable and the
 * go-online endpoint and ride matching can never disagree. Reasons are listed
 * most important first.
 */
export function evaluateEligibility(s: EligibilitySnapshot, opts: EligibilityOptions): EligibilityResult {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const freshMs = opts.locationFreshMs ?? DEFAULT_LOCATION_FRESH_MS;
  const reasons: EligibilityReason[] = [];
  const add = (code: EligibilityCode) => reasons.push({ code, message: M[code] });

  if (s.role !== 'driver') add('NOT_DRIVER');

  const status = s.application?.status;
  if (status === 'SUSPENDED' || s.kycStatus === 'SUSPENDED') add('DRIVER_SUSPENDED');
  else if (status === 'EXPIRED') add('APPLICATION_EXPIRED');
  else if (status !== 'APPROVED') add('APPLICATION_NOT_APPROVED');

  const v = s.vehicle;
  if (!v) add('NO_ACTIVE_VEHICLE');
  else if (v.verificationStatus === 'SUSPENDED') add('VEHICLE_SUSPENDED');
  else if (v.verificationStatus !== 'APPROVED' || !v.isActive) add('VEHICLE_NOT_APPROVED');
  else if (opts.serviceType && !(SERVICE_CATEGORIES[opts.serviceType] ?? []).includes(v.category as never)) {
    add('VEHICLE_TYPE_MISMATCH');
  }

  // Drivers approved before onboarding existed have no licence date on file:
  // skip the check for them until they resubmit, but honour any date we do have.
  const isLegacy = s.application?.isLegacy ?? false;
  if (s.licenceExpiryDate ? s.licenceExpiryDate <= today : !isLegacy) add('LICENCE_EXPIRED');
  if (s.expiredRequiredDocs > 0) add('DOCUMENT_EXPIRED');

  if (opts.requireOnline && !s.online) add('DRIVER_OFFLINE');
  if (opts.requireLocation && (!s.lastLocationAt || now.getTime() - s.lastLocationAt.getTime() > freshMs)) {
    add('LOCATION_STALE');
  }
  if (s.hasActiveRide) add('ACTIVE_RIDE');

  return { eligible: reasons.length === 0, reasons };
}
