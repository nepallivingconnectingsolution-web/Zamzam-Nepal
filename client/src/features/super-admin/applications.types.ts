import type { ApplicationStatus, DriverProfile, ReviewStatus } from "@/features/driver/onboarding/onboarding.types";

/** Mirrors server/src/modules/driver-onboarding/admin-applications.service.ts. */

export type { ApplicationStatus, ReviewStatus };

export interface ApplicationListItem {
  applicationId: string;
  driverId: string;
  driverName: string;
  mobile: string | null;
  vehicle: { id: string; category: string; plateNumber: string; status: string } | null;
  status: ApplicationStatus;
  submittedAt: string | null;
  updatedAt: string;
  pendingDocs: number;
}

export interface ApplicationList {
  items: ApplicationListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ApplicationStats {
  pending: number;
  underReview: number;
  approved: number;
  rejected: number;
  resubmissionRequired: number;
  suspended: number;
  expired: number;
  draft: number;
}

export interface DocView {
  id: string;
  status: ReviewStatus;
  rejectionReason: string | null;
  expiryDate: string | null;
  fileId: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface AdminRequirement {
  id: string;
  docType: string;
  kind: "DOCUMENT" | "PHOTO";
  label: string;
  isRequired: boolean;
  requiresExpiry: boolean;
  subject: "DRIVER" | "VEHICLE";
  current: DocView | null;
  history: DocView[];
}

export interface ReviewRow {
  id: string;
  targetType: string;
  targetId: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  adminId: string | null;
  createdAt: string;
}

export interface ApplicationDetail {
  application: {
    id: string;
    status: ApplicationStatus;
    version: number;
    currentStep: number;
    isLegacy: boolean;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedBy: string | null;
    rejectionReason: string | null;
    suspensionReason: string | null;
  };
  driver: { id: string; name: string; email: string; mobile: string | null; kycStatus: string };
  profile: DriverProfile | null;
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
  requirements: AdminRequirement[];
  missing: string[];
  timeline: ReviewRow[];
  notes: ReviewRow[];
  approvalGate: { ok: boolean; message: string; blockers: { code: string; message: string }[] };
}

export const STATUS_TONE: Record<ApplicationStatus, "default" | "warning" | "success" | "danger" | "accent"> = {
  DRAFT: "default",
  SUBMITTED: "warning",
  UNDER_REVIEW: "accent",
  RESUBMISSION_REQUIRED: "danger",
  APPROVED: "success",
  REJECTED: "danger",
  SUSPENDED: "danger",
  EXPIRED: "danger",
};

export const DOC_TONE: Record<ReviewStatus, "default" | "warning" | "success" | "danger"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  EXPIRED: "danger",
  RESUBMISSION_REQUIRED: "danger",
};

/** Applications a reviewer can still act on. */
export const OPEN_STATUSES: ApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "RESUBMISSION_REQUIRED"];
