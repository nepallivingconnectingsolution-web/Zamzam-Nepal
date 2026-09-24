import { evaluateBusinessGate } from '../../src/modules/super-admin/approval-gate';

describe('evaluateBusinessGate', () => {
  it('blocks a business that has uploaded nothing and names every required document', () => {
    const gate = evaluateBusinessGate('hotel', []);
    expect(gate.ok).toBe(false);
    expect(gate.blockers).toHaveLength(3);
    expect(gate.notUploaded).toHaveLength(3);
  });

  it('blocks while a required document is only PENDING, but counts it as uploaded', () => {
    const gate = evaluateBusinessGate('hotel', [
      { type: 'business_license', status: 'APPROVED' },
      { type: 'owner_id', status: 'APPROVED' },
      { type: 'property_ownership', status: 'PENDING' },
    ]);
    expect(gate.ok).toBe(false);
    expect(gate.blockers).toEqual(['Property ownership / lease']);
    expect(gate.notUploaded).toEqual([]);
  });

  it('treats a rejected (SUSPENDED) document as not uploaded', () => {
    const gate = evaluateBusinessGate('hotel', [
      { type: 'business_license', status: 'APPROVED' },
      { type: 'owner_id', status: 'SUSPENDED' },
      { type: 'property_ownership', status: 'APPROVED' },
    ]);
    expect(gate.ok).toBe(false);
    expect(gate.notUploaded).toEqual(["Owner's ID"]);
  });

  it('passes once every required document is APPROVED, ignoring optional ones', () => {
    const gate = evaluateBusinessGate('restaurant', [
      { type: 'business_license', status: 'APPROVED' },
      { type: 'owner_id', status: 'APPROVED' },
      // health_certificate is optional and still pending: must not block.
      { type: 'health_certificate', status: 'PENDING' },
    ]);
    expect(gate.ok).toBe(true);
    expect(gate.blockers).toEqual([]);
  });
});
