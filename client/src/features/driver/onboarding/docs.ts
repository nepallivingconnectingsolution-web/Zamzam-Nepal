import type { ApplicationStatus, CurrentDoc, Requirement } from "./onboarding.types";

/** Mirrors the server: answers can be edited only in these states. */
const EDITABLE: ApplicationStatus[] = ["DRAFT", "RESUBMISSION_REQUIRED", "EXPIRED"];
/** A document in one of these states may be replaced even after submission. */
const REPLACEABLE = ["REJECTED", "EXPIRED", "RESUBMISSION_REQUIRED"];

export const isEditable = (status: ApplicationStatus | undefined) => !!status && EDITABLE.includes(status);

/** Would the server accept a new file for this slot right now? */
export function canChangeDoc(status: ApplicationStatus | undefined, current: CurrentDoc | null): boolean {
  if (isEditable(status)) return true;
  if (current) return REPLACEABLE.includes(current.status);
  return status === "SUBMITTED" || status === "UNDER_REVIEW"; // adding an optional document
}

export const needsNewUpload = (r: Requirement) => !!r.current && REPLACEABLE.includes(r.current.status);

export const requiredCount = (reqs: Requirement[]) => reqs.filter((r) => r.isRequired).length;
export const requiredDone = (reqs: Requirement[]) => reqs.filter((r) => r.isRequired && r.current).length;
