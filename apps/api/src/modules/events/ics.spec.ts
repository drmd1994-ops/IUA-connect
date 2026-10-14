import { type CalendarEntry, buildCalendar, foldLine, icsDate, icsText } from './ics';

/** Reads a calendar back: unfolds the lines and splits the entries into property maps. */
function parse(ics: string): {
  calendar: Record<string, string>;
  events: Record<string, string>[];
} {
  const lines = ics
    .replace(/\r\n[ \t]/g, '')
    .split('\r\n')
    .filter(Boolean);
  const calendar: Record<string, string> = {};
  const events: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    const colon = line.indexOf(':');
    const [name, value] = [line.slice(0, colon), line.slice(colon + 1)];
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      events.push(current!);
      current = null;
    } else if (current) current[name] = value;
    else calendar[name] = value;
  }
  return { calendar, events };
}

const unescape = (value: string) => value.replace(/\\n/g, '\n').replace(/\\([\\;,])/g, '$1');

describe('ICS writer', () => {
  const entry: CalendarEntry = {
    uid: 'event-0190a1b2@iua-connect',
    title: 'הכנס השנתי, 2030; מושב פתיחה',
    startAt: new Date('2030-01-10T07:00:00.000Z'),
    endAt: new Date('2030-01-10T15:30:00.000Z'),
    description: 'שורה ראשונה\nשורה שנייה עם \\ לוכסן',
    location: 'מרכז הכנסים לדוגמה, אילת',
    url: 'https://example.test/he/events/הכנס-השנתי',
    geo: { lat: 29.5577, lng: 34.9519 },
    updatedAt: new Date('2029-12-01T10:00:00.000Z'),
  };

  it('writes UTC dates in the basic format', () => {
    expect(icsDate(new Date('2030-01-10T07:00:00.000Z'))).toBe('20300110T070000Z');
    // 09:00 in Israel in winter (UTC+2) and 10:00 in summer (UTC+3) are both 07:00 UTC.
    expect(icsDate(new Date('2030-07-10T10:00:00+03:00'))).toBe('20300710T070000Z');
  });

  it('escapes text values', () => {
    expect(icsText('a,b;c\\d\ne\r\nf')).toBe('a\\,b\\;c\\\\d\\ne\\nf');
  });

  it('folds long lines at 75 octets without splitting a Hebrew letter', () => {
    const folded = foldLine(`SUMMARY:${'א'.repeat(100)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
      // No replacement characters: every line is whole UTF-8 on its own.
      expect(Buffer.from(line, 'utf8').toString('utf8')).toBe(line);
    }
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'א'.repeat(100)}`);
  });

  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('builds a calendar that reads back with the same values', () => {
    const ics = buildCalendar('Med Connect', [entry]);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    // Only CRLF line endings.
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }

    const { calendar, events } = parse(ics);
    expect(calendar).toMatchObject({ VERSION: '2.0', METHOD: 'PUBLISH' });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({
      UID: 'event-0190a1b2@iua-connect',
      DTSTAMP: '20291201T100000Z',
      DTSTART: '20300110T070000Z',
      DTEND: '20300110T153000Z',
      GEO: '29.5577;34.9519',
      URL: entry.url,
      STATUS: 'CONFIRMED',
    });
    expect(unescape(event!.SUMMARY!)).toBe(entry.title);
    expect(unescape(event!.DESCRIPTION!)).toBe(entry.description);
    expect(unescape(event!.LOCATION!)).toBe(entry.location);
  });

  it('marks a cancelled entry, and leaves out what is missing', () => {
    const ics = buildCalendar('x', [
      { ...entry, cancelled: true, description: null, location: null, url: null, geo: null },
    ]);
    const [event] = parse(ics).events;
    expect(event!.STATUS).toBe('CANCELLED');
    expect(Object.keys(event!)).toEqual([
      'UID',
      'DTSTAMP',
      'DTSTART',
      'DTEND',
      'SUMMARY',
      'STATUS',
    ]);
  });

  it('keeps the same UID on every download', () => {
    const first = parse(buildCalendar('x', [entry])).events[0]!.UID;
    const second = parse(buildCalendar('x', [{ ...entry, title: 'Renamed' }])).events[0]!.UID;
    expect(second).toBe(first);
  });

  it('writes several entries, and an empty calendar', () => {
    expect(parse(buildCalendar('x', [entry, { ...entry, uid: 'b' }])).events).toHaveLength(2);
    expect(parse(buildCalendar('x', [])).events).toEqual([]);
  });
});
