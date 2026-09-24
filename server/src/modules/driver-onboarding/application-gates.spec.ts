import { evaluateApprovalGate, evaluateSubmitGate, type GateDoc, type GateRequirement } from './application-gates';

const req = (docType: string, over: Partial<GateRequirement> = {}): GateRequirement => ({
  docType, kind: 'DOCUMENT', label: docType, isRequired: true, requiresExpiry: false, subject: 'VEHICLE', ...over,
});
const doc = (docType: string, status: GateDoc['status'] = 'PENDING', over: Partial<GateDoc> = {}): GateDoc => ({
  docType, subject: 'VEHICLE', status, expiryDate: null, ...over,
});
const profile = {
  legalName: 'Ram Thapa', photoFileId: 'f1', dateOfBirth: '1995-02-01', address: 'Kathmandu', city: 'Kathmandu',
  province: 'Bagmati', emergencyContactName: 'Sita', emergencyContactPhone: '9800000000', licenceNumber: 'L-1',
  licenceClass: 'A', licenceAuthority: 'DoTM', licenceIssueDate: '2020-01-01', licenceExpiryDate: '2030-01-01',
  phoneVerifiedAt: new Date(),
};
const vehicle = { category: 'bike', plateNumber: 'BA1KHA1234', make: 'Bajaj', model: 'Pulsar', manufactureYear: 2020, color: 'Black' };
const requirements = [req('bluebook'), req('insurance', { requiresExpiry: true }), req('photo:front', { kind: 'PHOTO' })];
const today = '2026-09-21';

describe('evaluateSubmitGate', () => {
  it('passes with a complete draft', () => {
    const r = evaluateSubmitGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook'), doc('insurance', 'PENDING', { expiryDate: '2027-01-01' }), doc('photo:front')],
    });
    expect(r.ok).toBe(true);
  });
  it('blocks an expired licence with the exact user message', () => {
    const r = evaluateSubmitGate({ profile: { ...profile, licenceExpiryDate: '2026-01-01' }, vehicle, requirements, today, docs: [] });
    expect(r.blockers.map((b) => b.code)).toContain('LICENCE_EXPIRED');
    expect(r.blockers.find((b) => b.code === 'LICENCE_EXPIRED')!.message).toBe(
      'Your driving licence has expired. Please upload a valid licence.',
    );
  });
  it('blocks when phone is not verified, a doc is missing, or a doc has expired', () => {
    const r = evaluateSubmitGate({
      profile: { ...profile, phoneVerifiedAt: null }, vehicle, requirements, today,
      docs: [doc('insurance', 'PENDING', { expiryDate: '2026-01-01' })],
    });
    const codes = r.blockers.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['PHONE_NOT_VERIFIED', 'DOCUMENT_MISSING', 'DOCUMENT_EXPIRED']));
  });
  it('blocks when no vehicle is registered', () => {
    const r = evaluateSubmitGate({ profile, vehicle: null, requirements, today, docs: [] });
    expect(r.blockers.map((b) => b.code)).toContain('NO_VEHICLE');
  });
  it('requires an expiry date when the requirement demands one', () => {
    const r = evaluateSubmitGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook'), doc('insurance'), doc('photo:front')],
    });
    expect(r.blockers.map((b) => b.code)).toContain('EXPIRY_REQUIRED');
  });
  it('blocks resubmission while a rejected document has no replacement', () => {
    const r = evaluateSubmitGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'REJECTED'), doc('insurance', 'PENDING', { expiryDate: '2027-01-01' }), doc('photo:front')],
    });
    expect(r.blockers.map((b) => b.code)).toContain('DOCUMENT_REJECTED');
  });
});

describe('evaluateApprovalGate', () => {
  it('reports pending documents with the spec message', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'APPROVED'), doc('insurance', 'PENDING', { expiryDate: '2027-01-01' }), doc('photo:front', 'PENDING')],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Application cannot be approved because 2 required documents are still pending.');
  });
  it('uses singular wording for one pending document', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'APPROVED'), doc('insurance', 'APPROVED', { expiryDate: '2027-01-01' }), doc('photo:front', 'PENDING')],
    });
    expect(r.message).toBe('Application cannot be approved because 1 required document is still pending.');
  });
  it('passes when every required item is APPROVED', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'APPROVED'), doc('insurance', 'APPROVED', { expiryDate: '2027-01-01' }), doc('photo:front', 'APPROVED')],
    });
    expect(r.ok).toBe(true);
    expect(r.message).toBe('');
  });
  it('ignores optional requirements', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, today, requirements: [req('bluebook'), req('pollution', { isRequired: false })],
      docs: [doc('bluebook', 'APPROVED')],
    });
    expect(r.ok).toBe(true);
  });
  it('counts rejected and missing separately', () => {
    const r = evaluateApprovalGate({
      profile, vehicle, requirements, today,
      docs: [doc('bluebook', 'REJECTED')],
    });
    expect(r.message).toBe(
      'Application cannot be approved because 1 required document was rejected and 2 required documents are missing.',
    );
  });
  it('also blocks on an expired licence', () => {
    const r = evaluateApprovalGate({
      profile: { ...profile, licenceExpiryDate: '2026-01-01' }, vehicle, today,
      requirements: [req('bluebook')], docs: [doc('bluebook', 'APPROVED')],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Application cannot be approved because the driving licence has expired.');
  });
});
