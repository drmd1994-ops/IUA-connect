import { LOCKOUT_POLICY, lockoutMinutes } from './users.service';

describe('lockout backoff', () => {
  it('locks for 15 minutes the first time, doubling after each further lock', () => {
    expect(lockoutMinutes(0)).toBe(15);
    expect(lockoutMinutes(1)).toBe(30);
    expect(lockoutMinutes(2)).toBe(60);
    expect(lockoutMinutes(3)).toBe(120);
  });

  it('never exceeds 24 hours', () => {
    expect(lockoutMinutes(7)).toBe(LOCKOUT_POLICY.maxMinutes);
    expect(lockoutMinutes(50)).toBe(24 * 60);
  });

  it('locks after five consecutive failures', () => {
    expect(LOCKOUT_POLICY.maxFailedAttempts).toBe(5);
  });
});
