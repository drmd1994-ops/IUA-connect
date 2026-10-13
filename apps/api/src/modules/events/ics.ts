/**
 * A small iCalendar (RFC 5545) writer for event and schedule downloads (M5 plan §2.5). Written by
 * hand, so no library is added. Times are written in UTC, which every calendar app converts to
 * the reader's own time zone.
 */
export interface CalendarEntry {
  /** Stable across downloads, so re-importing updates the entry instead of duplicating it. */
  uid: string;
  title: string;
  startAt: Date;
  endAt: Date;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  geo?: { lat: number; lng: number } | null;
  cancelled?: boolean;
  /** When the entry last changed. */
  updatedAt: Date;
}

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

/** `20300110T070000Z` */
export function icsDate(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Escapes a text value: backslash, semicolon, comma and line breaks (RFC 5545 §3.3.11). */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a content line so no line is longer than 75 octets (RFC 5545 §3.1). Continuation lines
 * start with a space. A multi-byte character (Hebrew) is never split.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    // Continuation lines carry a leading space, which counts toward their length.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** A complete calendar file. */
export function buildCalendar(name: string, entries: readonly CalendarEntry[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Med Connect//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
  ];
  for (const entry of entries) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsText(entry.uid)}`,
      `DTSTAMP:${icsDate(entry.updatedAt)}`,
      `DTSTART:${icsDate(entry.startAt)}`,
      `DTEND:${icsDate(entry.endAt)}`,
      `SUMMARY:${icsText(entry.title)}`,
    );
    if (entry.description) lines.push(`DESCRIPTION:${icsText(entry.description)}`);
    if (entry.location) lines.push(`LOCATION:${icsText(entry.location)}`);
    if (entry.geo) lines.push(`GEO:${entry.geo.lat};${entry.geo.lng}`);
    // A URL is a URI value, not text: it is written as it is.
    if (entry.url) lines.push(`URL:${entry.url}`);
    lines.push(`STATUS:${entry.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
