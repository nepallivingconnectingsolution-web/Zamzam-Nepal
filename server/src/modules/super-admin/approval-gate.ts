import { PARTNER_DOCUMENT_CATALOG, type PartnerType } from '../partner-documents/dto/partner-documents.dto';

export interface GateDoc {
  type: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
}

export interface BusinessGate {
  ok: boolean;
  message: string;
  /** Labels of required documents that are not APPROVED yet (missing, pending or rejected). */
  blockers: string[];
  /** Labels of required documents with no usable upload (missing or rejected). */
  notUploaded: string[];
}

/**
 * Whether a business may be approved. Every REQUIRED document must be
 * uploaded and individually APPROVED, the same standard a driver's application
 * is held to. Optional documents never block.
 *
 * Deliberately stricter than the publish gate in
 * PartnerDocumentsService.assertRequiredDocsUploaded, which only needs an
 * upload: that gate keeps an already-approved partner productive while a
 * replacement document waits for review, whereas this one is the reviewer's
 * own decision to trust the business in the first place.
 */
export function evaluateBusinessGate(role: PartnerType, docs: GateDoc[]): BusinessGate {
  const required = PARTNER_DOCUMENT_CATALOG[role].filter((d) => d.required);
  const approved = new Set(docs.filter((d) => d.status === 'APPROVED').map((d) => d.type));
  const usable = new Set(docs.filter((d) => d.status !== 'SUSPENDED').map((d) => d.type));

  const blockers = required.filter((d) => !approved.has(d.type)).map((d) => d.label);
  const notUploaded = required.filter((d) => !usable.has(d.type)).map((d) => d.label);

  return {
    ok: blockers.length === 0,
    message:
      blockers.length === 0
        ? 'Every required document is verified.'
        : `Verify these documents before approving: ${blockers.join(', ')}.`,
    blockers,
    notUploaded,
  };
}
