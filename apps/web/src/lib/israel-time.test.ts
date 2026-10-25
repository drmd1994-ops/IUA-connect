import { describe, expect, it } from 'vitest';
import { fromIsraelLocal, toIsraelLocal } from './israel-time';

describe('Israel time', () => {
  it('reads a winter time as UTC+2', () => {
    expect(fromIsraelLocal('2026-01-15T09:30')?.toISOString()).toBe('2026-01-15T07:30:00.000Z');
  });

  it('reads a summer time as UTC+3', () => {
    expect(fromIsraelLocal('2026-07-15T09:30')?.toISOString()).toBe('2026-07-15T06:30:00.000Z');
  });

  it('round-trips an instant', () => {
    const instant = new Date('2026-10-01T15:45:00.000Z');
    expect(fromIsraelLocal(toIsraelLocal(instant))?.toISOString()).toBe(instant.toISOString());
  });

  it('rejects text that is not a date-time', () => {
    expect(fromIsraelLocal('')).toBeNull();
    expect(fromIsraelLocal('tomorrow')).toBeNull();
  });

  it('takes the first of the hour that happens twice when summer time ends', () => {
    // 25 October 2026: at 02:00 summer time the clock goes back to 01:00.
    expect(fromIsraelLocal('2026-10-25T01:15')?.toISOString()).toBe('2026-10-24T22:15:00.000Z');
    expect(fromIsraelLocal('2026-10-25T00:30')?.toISOString()).toBe('2026-10-24T21:30:00.000Z');
    expect(fromIsraelLocal('2026-10-25T02:30')?.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('round-trips every minute of the night the clocks go back', () => {
    for (let t = Date.UTC(2026, 9, 24, 20); t < Date.UTC(2026, 9, 25, 2); t += 60_000) {
      const local = toIsraelLocal(new Date(t));
      expect(toIsraelLocal(fromIsraelLocal(local)!)).toBe(local);
    }
  });
});
