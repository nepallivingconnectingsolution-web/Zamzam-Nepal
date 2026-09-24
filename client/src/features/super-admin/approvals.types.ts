/** Mirrors server/src/modules/super-admin/approvals.service.ts. */

export type ApprovalRole = "driver" | "hotel" | "restaurant" | "grocery" | "bus_operator" | "freight";
export type ApprovalBucket = "PENDING" | "APPROVED" | "REJECTED";
export type ApprovalStage =
  | "AWAITING_DOCUMENTS"
  | "IN_REVIEW"
  | "READY_TO_APPROVE"
  | "WAITING_ON_PARTNER"
  | "VEHICLE_CHANGED"
  | "APPROVED"
  | "REJECTED";

export const ROLE_LABEL: Record<ApprovalRole, string> = {
  driver: "Driver",
  hotel: "Hotel",
  restaurant: "Restaurant",
  grocery: "Grocery store",
  bus_operator: "Bus operator",
  freight: "Freight",
};

/** Roles that have a registration to review (everything except customers and admins). */
export const isPartnerRole = (role: string): role is ApprovalRole => role in ROLE_LABEL;

export const STAGE_LABEL: Record<ApprovalStage, string> = {
  AWAITING_DOCUMENTS: "Waiting for documents",
  IN_REVIEW: "Ready to review",
  READY_TO_APPROVE: "Ready to approve",
  WAITING_ON_PARTNER: "Waiting for changes",
  VEHICLE_CHANGED: "Vehicle changed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const STAGE_TONE: Record<ApprovalStage, "default" | "warning" | "success" | "danger" | "accent"> = {
  AWAITING_DOCUMENTS: "default",
  IN_REVIEW: "warning",
  READY_TO_APPROVE: "accent",
  WAITING_ON_PARTNER: "default",
  VEHICLE_CHANGED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export interface ApprovalItem {
  userId: string;
  name: string;
  role: ApprovalRole;
  businessName: string | null;
  mobile: string | null;
  email: string;
  submittedAt: string;
  status: ApprovalBucket;
  stage: ApprovalStage;
  applicationId: string | null;
  documents: { uploaded: number; pending: number; approved: number; rejected: number };
}

export interface ApprovalList {
  items: ApprovalItem[];
  counts: Record<ApprovalBucket, number>;
}

export interface RecordDocument {
  id: string;
  source: "partner" | "application" | "driver_legacy";
  label: string;
  group: "DRIVER" | "VEHICLE" | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  fileUrl: string | null;
  fileId: string | null;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  reviewNote: string | null;
}

export interface PartnerRecord {
  userId: string;
  name: string;
  role: ApprovalRole;
  businessName: string | null;
  businessAddress: string | null;
  mobile: string | null;
  email: string;
  registeredAt: string;
  status: ApprovalBucket;
  stage: ApprovalStage;
  applicationId: string | null;
  documents: RecordDocument[];
}

export interface PendingVehicle {
  id: string;
  category: string;
  makeModel: string;
  plateNumber: string;
  verificationStatus: string;
}

export interface BusinessDocument {
  id: string | null;
  type: string;
  label: string;
  hint: string;
  required: boolean;
  status: "NOT_UPLOADED" | "PENDING" | "APPROVED" | "SUSPENDED";
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  reviewNote: string | null;
  updatedAt: string | null;
}

export type ApprovalResolution =
  | { kind: "driver"; userId: string; applicationId: string; applicationStatus: string; pendingVehicles: PendingVehicle[] }
  | {
      kind: "business";
      user: {
        id: string;
        name: string;
        email: string;
        mobile: string | null;
        role: ApprovalRole;
        kycStatus: "PENDING" | "APPROVED" | "SUSPENDED";
        businessName: string | null;
        businessAddress: string | null;
        createdAt: string;
      };
      documents: BusinessDocument[];
      gate: { ok: boolean; message: string; blockers: string[]; notUploaded: string[] };
    };
