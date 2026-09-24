export interface GateRequirement {
  docType: string;
  kind: 'DOCUMENT' | 'PHOTO';
  label: string;
  isRequired: boolean;
  requiresExpiry: boolean;
  subject: 'DRIVER' | 'VEHICLE';
}

export type GateDocStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'RESUBMISSION_REQUIRED';

/** Current (non-superseded) rows only. */
export interface GateDoc {
  docType: string;
  subject: 'DRIVER' | 'VEHICLE';
  status: GateDocStatus;
  expiryDate: string | null;
}

export interface GateProfile {
  legalName?: string | null;
  photoFileId?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  licenceNumber?: string | null;
  licenceClass?: string | null;
  licenceAuthority?: string | null;
  licenceIssueDate?: string | null;
  licenceExpiryDate?: string | null;
  phoneVerifiedAt?: Date | string | null;
}

export type GateVehicle = {
  category: string;
  plateNumber: string;
  make?: string | null;
  model?: string | null;
  manufactureYear?: number | null;
  color?: string | null;
} | null;

export interface GateBlocker {
  code: string;
  message: string;
}

export interface GateResult {
  ok: boolean;
  blockers: GateBlocker[];
  message: string;
}

export interface GateInput {
  profile: GateProfile | null;
  vehicle: GateVehicle;
  requirements: GateRequirement[];
  docs: GateDoc[];
  today?: string;
}

export const LICENCE_EXPIRED_MESSAGE = 'Your driving licence has expired. Please upload a valid licence.';

const REPLACEABLE: GateDocStatus[] = ['REJECTED', 'EXPIRED', 'RESUBMISSION_REQUIRED'];

const isoToday = () => new Date().toISOString().slice(0, 10);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const docLabel = (docType: string) => docType.replace(/[:_]/g, ' ');

/** Profile / licence / vehicle / expiry problems shared by both gates. */
function baseChecks(input: GateInput): GateBlocker[] {
  const today = input.today ?? isoToday();
  const p = input.profile;
  const blockers: GateBlocker[] = [];

  if (!p?.phoneVerifiedAt) {
    blockers.push({ code: 'PHONE_NOT_VERIFIED', message: 'Verify your mobile number with the OTP first.' });
  }

  const personal: (keyof GateProfile)[] = [
    'legalName', 'photoFileId', 'dateOfBirth', 'address', 'city', 'province',
    'emergencyContactName', 'emergencyContactPhone',
  ];
  if (!p || personal.some((k) => !p[k])) {
    blockers.push({ code: 'PROFILE_INCOMPLETE', message: 'Complete your personal information, including a profile photo.' });
  }

  const licence: (keyof GateProfile)[] = [
    'licenceNumber', 'licenceClass', 'licenceAuthority', 'licenceIssueDate', 'licenceExpiryDate',
  ];
  if (!p || licence.some((k) => !p[k])) {
    blockers.push({ code: 'LICENCE_INCOMPLETE', message: 'Complete your driving licence details.' });
  } else if (p.licenceExpiryDate! <= today) {
    blockers.push({ code: 'LICENCE_EXPIRED', message: LICENCE_EXPIRED_MESSAGE });
  }

  const v = input.vehicle;
  if (!v) {
    blockers.push({ code: 'NO_VEHICLE', message: 'Add your vehicle details.' });
  } else if (!v.plateNumber || !v.make || !v.model || !v.manufactureYear || !v.color) {
    blockers.push({ code: 'VEHICLE_INCOMPLETE', message: 'Complete your vehicle details.' });
  }

  for (const d of input.docs) {
    if (d.expiryDate && d.expiryDate <= today) {
      blockers.push({ code: 'DOCUMENT_EXPIRED', message: `Your ${docLabel(d.docType)} has expired. Upload a valid one.` });
    }
  }
  return blockers;
}

function findCurrent(input: GateInput, r: GateRequirement) {
  return input.docs.find((d) => d.docType === r.docType && d.subject === r.subject);
}

export function evaluateSubmitGate(input: GateInput): GateResult {
  const blockers = baseChecks(input);
  for (const r of input.requirements.filter((x) => x.isRequired)) {
    const cur = findCurrent(input, r);
    if (!cur) {
      blockers.push({ code: 'DOCUMENT_MISSING', message: `Upload your ${r.label}.` });
    } else if (REPLACEABLE.includes(cur.status)) {
      blockers.push({ code: 'DOCUMENT_REJECTED', message: `Replace the rejected ${r.label} first.` });
    } else if (r.requiresExpiry && !cur.expiryDate) {
      blockers.push({ code: 'EXPIRY_REQUIRED', message: `Enter the expiry date for your ${r.label}.` });
    }
  }
  return { ok: blockers.length === 0, blockers, message: blockers[0]?.message ?? '' };
}

/** How each base problem reads inside "Application cannot be approved because ...". */
const APPROVAL_PHRASES: Record<string, string> = {
  PHONE_NOT_VERIFIED: 'the phone number is not verified',
  PROFILE_INCOMPLETE: 'the driver profile is incomplete',
  LICENCE_INCOMPLETE: 'the licence details are incomplete',
  LICENCE_EXPIRED: 'the driving licence has expired',
  NO_VEHICLE: 'no vehicle is registered',
  VEHICLE_INCOMPLETE: 'the vehicle details are incomplete',
  DOCUMENT_EXPIRED: 'a document has expired',
};

export function evaluateApprovalGate(input: GateInput): GateResult {
  const base = baseChecks(input);
  let pending = 0;
  let missing = 0;
  let rejected = 0;
  for (const r of input.requirements.filter((x) => x.isRequired)) {
    const cur = findCurrent(input, r);
    if (!cur) missing++;
    else if (cur.status === 'PENDING') pending++;
    else if (cur.status !== 'APPROVED') rejected++;
  }

  const blockers: GateBlocker[] = [...base];
  const parts: string[] = [];
  const add = (code: string, n: number, one: string, many: string) => {
    if (!n) return;
    const text = `${n} required ${plural(n, one, many)}`;
    parts.push(text);
    blockers.push({ code, message: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` });
  };
  add('DOCUMENTS_PENDING', pending, 'document is still pending', 'documents are still pending');
  add('DOCUMENTS_REJECTED', rejected, 'document was rejected', 'documents were rejected');
  add('DOCUMENTS_MISSING', missing, 'document is missing', 'documents are missing');

  const seen = new Set<string>();
  for (const b of base) {
    const phrase = APPROVAL_PHRASES[b.code];
    if (phrase && !seen.has(phrase)) {
      seen.add(phrase);
      parts.push(phrase);
    }
  }

  const ok = parts.length === 0;
  return {
    ok,
    blockers,
    message: ok ? '' : `Application cannot be approved because ${parts.join(' and ')}.`,
  };
}
