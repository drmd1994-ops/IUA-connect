/**
 * When reminders go out (M5 plan §2.7, §11.4): a week before the event and a day before.
 *
 * - A reminder is due from its time until the next one's time (the week reminder until a day
 *   before; the day reminder until the event starts). If the job was down, it is sent late
 *   inside that window, and not at all after it.
 * - Someone who got their place after a reminder's time doesn't get that reminder: they have
 *   just been told about the event by the registration email.
 */
export type ReminderKind = 'WEEK' | 'DAY';

const HOUR = 60 * 60 * 1000;
const LEAD: Record<ReminderKind, number> = { WEEK: 7 * 24 * HOUR, DAY: 24 * HOUR };

/** The first moment and the last moment (exclusive) at which this reminder may be sent. */
export function reminderWindow(kind: ReminderKind, startAt: Date): { from: Date; until: Date } {
  const start = startAt.getTime();
  return {
    from: new Date(start - LEAD[kind]),
    until: new Date(kind === 'WEEK' ? start - LEAD.DAY : start),
  };
}

/** The reminders to send to one registered person now. */
export function dueReminders(input: {
  startAt: Date;
  /** When the person got their place (registered, or promoted from the waiting list). */
  placedAt: Date;
  now: Date;
  sent: readonly ReminderKind[];
}): ReminderKind[] {
  return (['WEEK', 'DAY'] as const).filter((kind) => {
    if (input.sent.includes(kind)) return false;
    const { from, until } = reminderWindow(kind, input.startAt);
    const now = input.now.getTime();
    return (
      now >= from.getTime() && now < until.getTime() && input.placedAt.getTime() <= from.getTime()
    );
  });
}

/** How far ahead the job needs to look for events: the longest lead time. */
export const LONGEST_LEAD_MS = LEAD.WEEK;
