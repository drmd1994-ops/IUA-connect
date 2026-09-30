import { endOfYear, isExpired, isoDate, renewedEndDate, todayInIsrael } from './period';

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('membership period', () => {
  it('uses the date in Israel, not UTC', () => {
    // 22:30 UTC on 31 December is already 1 January in Israel (UTC+2 in winter).
    expect(isoDate(todayInIsrael(new Date('2026-12-31T22:30:00Z')))).toBe('2027-01-01');
    expect(isoDate(todayInIsrael(new Date('2026-07-01T20:59:00Z')))).toBe('2026-07-01');
    expect(isoDate(todayInIsrael(new Date('2026-07-01T21:00:00Z')))).toBe('2026-07-02');
  });

  it('ends a period on 31 December of the same year', () => {
    expect(isoDate(endOfYear(d('2026-09-29')))).toBe('2026-12-31');
    expect(isoDate(endOfYear(d('2026-12-31')))).toBe('2026-12-31');
  });

  it('renews for the next calendar year, or this year once lapsed', () => {
    expect(isoDate(renewedEndDate(d('2026-12-31'), d('2026-11-15')))).toBe('2027-12-31');
    expect(isoDate(renewedEndDate(d('2026-12-31'), d('2026-12-31')))).toBe('2027-12-31');
    expect(isoDate(renewedEndDate(d('2025-12-31'), d('2026-03-01')))).toBe('2026-12-31');
  });

  it('is expired only after the end date', () => {
    expect(isExpired(d('2026-12-31'), d('2026-12-31'))).toBe(false);
    expect(isExpired(d('2026-12-31'), d('2027-01-01'))).toBe(true);
  });
});
