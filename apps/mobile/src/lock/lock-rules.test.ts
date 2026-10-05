import { describe, expect, it } from 'vitest';
import { RELOCK_AFTER_MS, shouldLock } from './lock-rules';

describe('locking the app again', () => {
  it('locks after a minute in the background, not after a moment', () => {
    const now = 1_000_000;
    expect(shouldLock(now - RELOCK_AFTER_MS, now)).toBe(true);
    expect(shouldLock(now - 10 * RELOCK_AFTER_MS, now)).toBe(true);
    expect(shouldLock(now - 5_000, now)).toBe(false);
  });

  it('does not lock when the app never went to the background', () => {
    expect(shouldLock(null, 1_000_000)).toBe(false);
  });
});
