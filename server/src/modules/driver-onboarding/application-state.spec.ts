import { assertTransition, canTransition } from './application-state';

describe('application state machine', () => {
  it.each([
    ['DRAFT', 'SUBMITTED'],
    ['SUBMITTED', 'UNDER_REVIEW'],
    ['SUBMITTED', 'APPROVED'],
    ['UNDER_REVIEW', 'APPROVED'],
    ['UNDER_REVIEW', 'REJECTED'],
    ['UNDER_REVIEW', 'RESUBMISSION_REQUIRED'],
    ['RESUBMISSION_REQUIRED', 'SUBMITTED'],
    ['APPROVED', 'SUSPENDED'],
    ['APPROVED', 'EXPIRED'],
    ['SUSPENDED', 'APPROVED'],
    ['EXPIRED', 'SUBMITTED'],
    ['REJECTED', 'DRAFT'],
  ] as const)('%s -> %s is allowed', (a, b) => expect(canTransition(a, b)).toBe(true));

  it.each([
    ['DRAFT', 'APPROVED'],
    ['REJECTED', 'APPROVED'],
    ['APPROVED', 'DRAFT'],
    ['SUSPENDED', 'SUBMITTED'],
    ['EXPIRED', 'APPROVED'],
  ] as const)('%s -> %s is blocked', (a, b) => {
    expect(canTransition(a, b)).toBe(false);
    expect(() => assertTransition(a, b)).toThrow();
  });

  it('reports a 409 INVALID_TRANSITION with a readable message', () => {
    try {
      assertTransition('DRAFT', 'APPROVED');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getStatus()).toBe(409);
      expect(e.getResponse()).toMatchObject({ code: 'INVALID_TRANSITION' });
      expect(e.getResponse().message).toContain('draft');
    }
  });
});
