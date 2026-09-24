/** Mirrors server/src/modules/driver-onboarding (ApplicationView and friends). */

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "RESUBMISSION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED"
  | "EXPIRED";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "RESUBMISSION_REQUIRED";

export interface CurrentDoc {
  id: string;
  status: ReviewStatus;
  rejectionReason: string | null;
  expiryDate: string | null;
  fileId: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
}

export interface Requirement {
  id: string;
  docType: string;
  kind: "DOCUMENT" | "PHOTO";
  label: string;
  isRequired: boolean;
  requiresExpiry: boolean;
  subject: "DRIVER" | "VEHICLE";
  sortOrder: number;
  current: CurrentDoc | null;
}

export interface DriverProfile {
  userId: string;
  legalName: string | null;
  photoFileId: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  language: string | null;
  licenceNumber: string | null;
  licenceClass: string | null;
  licenceAuthority: string | null;
  licenceIssueDate: string | null;
  licenceExpiryDate: string | null;
  phoneVerifiedAt: string | null;
}

export interface ApplicationVehicle {
  id: string;
  category: "bike" | "car" | string;
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
}

export interface Blocker {
  code: string;
  message: string;
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
  profile: DriverProfile | null;
  vehicle: ApplicationVehicle | null;
  requirements: Requirement[];
  blockers: Blocker[];
  canSubmit: boolean;
  statusMessage: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: { code: string; message: string }[];
}

export interface OfferView {
  offerId: string;
  rideId: string;
  service: string;
  pickup: { label: string; lat: number | null; lng: number | null };
  destination: { label: string; lat: number | null; lng: number | null };
  distanceKm: number | null;
  fare: number;
  pickupDistanceKm: number;
  pickupEtaMin: number;
  expiresAt: string;
}

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Pending verification",
  UNDER_REVIEW: "Under review",
  RESUBMISSION_REQUIRED: "Changes needed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  EXPIRED: "Expired",
};
