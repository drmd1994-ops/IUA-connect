/**
 * Membership periods run by calendar year and end on 31 December (owner decision, 2026-09-29).
 * Dates are calendar dates in Israel; they are stored as `date` columns and handled here as
 * UTC-midnight Date objects, so no time zone shifts them.
 */
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

/** Today's date in Israel, as a UTC-midnight Date. */
export function todayInIsrael(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // "YYYY-MM-DD"
  return new Date(`${parts}T00:00:00.000Z`);
}

/** 31 December of the given date's year. */
export function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

/**
 * The end date after a renewal: the next calendar year after the current one, or, when the
 * membership has already lapsed, the end of this year.
 */
export function renewedEndDate(currentEnd: Date, today: Date): Date {
  if (currentEnd < today) return endOfYear(today);
  return new Date(Date.UTC(currentEnd.getUTCFullYear() + 1, 11, 31));
}

/** A membership is expired once its end date has passed (computed, never stored). */
export function isExpired(endDate: Date, today: Date): boolean {
  return endDate < today;
}

/** "YYYY-MM-DD" for a date column. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
