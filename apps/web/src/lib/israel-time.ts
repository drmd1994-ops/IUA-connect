const ZONE = 'Asia/Jerusalem';

/** The wall-clock time in Israel at an instant, as "YYYY-MM-DDTHH:mm" (a datetime-local value). */
export function toIsraelLocal(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * The instant of a wall-clock time in Israel ("YYYY-MM-DDTHH:mm"), whatever the browser's own
 * time zone, including across daylight-saving changes. Null when the text isn't a date-time.
 */
export function fromIsraelLocal(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const asUtc = new Date(`${local}:00.000Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  // Start from the same digits read as UTC, then remove Israel's offset at that moment. A second
  // pass settles times next to a clock change.
  let guess = asUtc.getTime();
  for (let pass = 0; pass < 2; pass++) {
    const shown = new Date(`${toIsraelLocal(new Date(guess))}:00.000Z`).getTime();
    guess -= shown - asUtc.getTime();
  }
  return new Date(guess);
}
