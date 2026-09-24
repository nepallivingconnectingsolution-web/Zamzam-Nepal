import { apiError } from '../../common/exceptions';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'RESUBMISSION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'EXPIRED';

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

const words = (s: ApplicationStatus) => s.toLowerCase().replace(/_/g, ' ');

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    apiError(
      409,
      `This application is ${words(from)} and cannot move to ${words(to)}. Reload and try again.`,
      'INVALID_TRANSITION',
    );
  }
}
