/** Pure rules for registration and the personal schedule (M5 plan §2.3, §2.4, §3). */

export interface Slot {
  id: string;
  startAt: Date;
  endAt: Date;
}

/**
 * The sessions that overlap another chosen session. Sessions that only touch (one ends as the
 * next begins) don't overlap.
 */
export function overlapping(slots: readonly Slot[]): Set<string> {
  const sorted = [...slots].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const found = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      // Sorted by start: once one starts at or after this one's end, the rest do too.
      if (sorted[j]!.startAt.getTime() >= sorted[i]!.endAt.getTime()) break;
      found.add(sorted[i]!.id);
      found.add(sorted[j]!.id);
    }
  }
  return found;
}

/** Free places for in-app registration; null means unlimited. Never negative. */
export function placesLeft(capacity: number | null, registered: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - registered);
}

export interface RegistrationWindow {
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  registrationMode: 'INTERNAL' | 'EXTERNAL' | 'NONE';
  startAt: Date | null;
}

/**
 * Why someone can't register (or cancel) in the app right now, as an error-detail code; null
 * when they can. Registration closes when the event starts.
 */
export function registrationProblem(event: RegistrationWindow, now: Date): string | null {
  if (event.registrationMode !== 'INTERNAL') return 'registrationNotInApp';
  if (event.status !== 'PUBLISHED' || !event.startAt) return 'registrationClosed';
  if (now.getTime() >= event.startAt.getTime()) return 'registrationClosed';
  return null;
}
