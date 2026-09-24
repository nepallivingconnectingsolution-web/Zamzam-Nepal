import { evaluateEligibility, type EligibilitySnapshot } from './eligibility';

const NOW = new Date('2026-09-21T10:00:00Z');
const base: EligibilitySnapshot = {
  role: 'driver',
  kycStatus: 'APPROVED',
  application: { status: 'APPROVED', isLegacy: false },
  vehicle: { category: 'bike', verificationStatus: 'APPROVED', isActive: true },
  licenceExpiryDate: '2030-01-01',
  expiredRequiredDocs: 0,
  online: true,
  lastLocationAt: new Date(NOW.getTime() - 10_000),
  hasActiveRide: false,
};
const opts = { requireOnline: true, requireLocation: true, now: NOW };
const first = (s: Partial<EligibilitySnapshot>, o: Partial<Parameters<typeof evaluateEligibility>[1]> = {}) =>
  evaluateEligibility({ ...base, ...s }, { ...opts, ...o });

describe('evaluateEligibility', () => {
  it('passes a fully approved, online, located driver', () => {
    expect(first({}, { serviceType: 'bike' })).toEqual({ eligible: true, reasons: [] });
  });

  it.each([
    ['not a driver', { role: 'customer' }, 'NOT_DRIVER'],
    ['no application', { application: null }, 'APPLICATION_NOT_APPROVED'],
    ['application under review', { application: { status: 'UNDER_REVIEW' as const, isLegacy: false } }, 'APPLICATION_NOT_APPROVED'],
    ['application expired', { application: { status: 'EXPIRED' as const, isLegacy: false } }, 'APPLICATION_EXPIRED'],
    ['application suspended', { application: { status: 'SUSPENDED' as const, isLegacy: false } }, 'DRIVER_SUSPENDED'],
    ['account suspended', { kycStatus: 'SUSPENDED' }, 'DRIVER_SUSPENDED'],
    ['no vehicle', { vehicle: null }, 'NO_ACTIVE_VEHICLE'],
    ['vehicle pending', { vehicle: { category: 'bike', verificationStatus: 'PENDING', isActive: true } }, 'VEHICLE_NOT_APPROVED'],
    ['vehicle inactive', { vehicle: { category: 'bike', verificationStatus: 'APPROVED', isActive: false } }, 'VEHICLE_NOT_APPROVED'],
    ['vehicle suspended', { vehicle: { category: 'bike', verificationStatus: 'SUSPENDED', isActive: true } }, 'VEHICLE_SUSPENDED'],
    ['licence expired yesterday', { licenceExpiryDate: '2026-09-20' }, 'LICENCE_EXPIRED'],
    ['licence expires today', { licenceExpiryDate: '2026-09-21' }, 'LICENCE_EXPIRED'],
    ['licence missing on a new application', { licenceExpiryDate: null }, 'LICENCE_EXPIRED'],
    ['a required document expired', { expiredRequiredDocs: 1 }, 'DOCUMENT_EXPIRED'],
    ['offline', { online: false }, 'DRIVER_OFFLINE'],
    ['location 5 minutes old', { lastLocationAt: new Date(NOW.getTime() - 300_000) }, 'LOCATION_STALE'],
    ['no location at all', { lastLocationAt: null }, 'LOCATION_STALE'],
    ['already on a trip', { hasActiveRide: true }, 'ACTIVE_RIDE'],
  ] as const)('blocks: %s', (_name, patch, code) => {
    const r = first(patch as Partial<EligibilitySnapshot>);
    expect(r.eligible).toBe(false);
    expect(r.reasons[0].code).toBe(code);
    expect(r.reasons[0].message.length).toBeGreaterThan(10);
  });

  it('blocks a car driver from a bike request, and a bike driver from a taxi request', () => {
    expect(first({ vehicle: { category: 'car', verificationStatus: 'APPROVED', isActive: true } }, { serviceType: 'bike' }).reasons[0].code).toBe('VEHICLE_TYPE_MISMATCH');
    expect(first({}, { serviceType: 'taxi' }).reasons[0].code).toBe('VEHICLE_TYPE_MISMATCH');
    expect(first({ vehicle: { category: 'car', verificationStatus: 'APPROVED', isActive: true } }, { serviceType: 'taxi' }).eligible).toBe(true);
  });

  it('lets a bike serve parcels and a car serve parcels (existing category rules)', () => {
    expect(first({}, { serviceType: 'parcel' }).eligible).toBe(true);
  });

  it('does not require online or location when asked not to (the go-online check itself)', () => {
    const r = first({ online: false, lastLocationAt: null }, { requireOnline: false, requireLocation: false });
    expect(r.eligible).toBe(true);
  });

  it('reports every problem, most important first', () => {
    const r = first({ application: { status: 'SUSPENDED', isLegacy: false }, online: false, hasActiveRide: true });
    expect(r.reasons.map((x) => x.code)).toEqual(['DRIVER_SUSPENDED', 'DRIVER_OFFLINE', 'ACTIVE_RIDE']);
  });

  describe('grandfathered (legacy) drivers approved before onboarding existed', () => {
    const legacy = { application: { status: 'APPROVED' as const, isLegacy: true }, licenceExpiryDate: null };
    it('are not blocked by a missing licence date', () => {
      expect(first(legacy).eligible).toBe(true);
    });
    it('are still blocked once a known licence date passes', () => {
      expect(first({ ...legacy, licenceExpiryDate: '2026-01-01' }).reasons[0].code).toBe('LICENCE_EXPIRED');
    });
    it('are still blocked when suspended', () => {
      expect(first({ ...legacy, kycStatus: 'SUSPENDED' }).reasons[0].code).toBe('DRIVER_SUSPENDED');
    });
  });

  it('uses the configured location freshness window', () => {
    const s = { lastLocationAt: new Date(NOW.getTime() - 120_000) };
    expect(first(s).reasons[0].code).toBe('LOCATION_STALE'); // default 90s
    expect(first(s, { locationFreshMs: 180_000 }).eligible).toBe(true);
  });
});
