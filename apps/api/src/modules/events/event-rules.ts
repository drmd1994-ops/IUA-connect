/**
 * Event states (M5 plan §2.1, §3): DRAFT → PUBLISHED → CANCELLED. An event admin publishes
 * directly (no second reviewer). A cancelled event stays visible, marked as cancelled.
 */
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

export interface PublishCheck {
  status: EventStatus;
  startAt: Date | null;
  endAt: Date | null;
  hasHebrewTitle: boolean;
  registrationMode: 'INTERNAL' | 'EXTERNAL' | 'NONE';
  registrationUrl: string | null;
}

/** Why an event can't be published yet, as an error-detail code; null when it can. */
export function publishProblem(event: PublishCheck): string | null {
  if (event.status !== 'DRAFT') return 'eventNotDraft';
  if (!event.startAt || !event.endAt) return 'eventDatesRequired';
  if (event.endAt.getTime() <= event.startAt.getTime()) return 'eventEndBeforeStart';
  // Hebrew is the fallback language (ADR 0005), so it must exist before the event goes public.
  if (!event.hasHebrewTitle) return 'eventHebrewRequired';
  if (event.registrationMode === 'EXTERNAL' && !event.registrationUrl) {
    return 'eventRegistrationUrlRequired';
  }
  return null;
}

/** Only a published event can be cancelled, and a reason is required (registrants are told). */
export function cancelProblem(status: EventStatus, reason: string | undefined): string | null {
  if (status !== 'PUBLISHED') return 'eventNotPublished';
  if (!reason?.trim()) return 'eventCancelReasonRequired';
  return null;
}

/** "upcoming" events have not ended yet; "past" ones have. */
export function isPast(endAt: Date, now: Date): boolean {
  return endAt.getTime() <= now.getTime();
}
