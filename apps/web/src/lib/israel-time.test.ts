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
});
