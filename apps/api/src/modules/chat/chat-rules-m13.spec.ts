import { parseRange } from '../files/files.controller';
import { activityLabel, attachmentsAllowed } from './chat-rules';

describe('chat rules for groups, activity and files (M13)', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const ago = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  it('says when a person was last around without ever giving a time', () => {
    expect(activityLabel(true, null, now)).toBe('online');
    // Online wins over whatever was recorded.
    expect(activityLabel(true, ago(500), now)).toBe('online');
    expect(activityLabel(false, ago(0.1), now)).toBe('today');
    expect(activityLabel(false, ago(23), now)).toBe('today');
    expect(activityLabel(false, ago(25), now)).toBe('week');
    expect(activityLabel(false, ago(24 * 6), now)).toBe('week');
    expect(activityLabel(false, ago(24 * 8), now)).toBe('earlier');
    // Nothing is known about someone who never opened chat.
    expect(activityLabel(false, null, now)).toBeNull();
  });

  it('lets a message carry three files, one video at most', () => {
    expect(attachmentsAllowed([])).toBe(true);
    expect(attachmentsAllowed(['IMAGE', 'DOCUMENT', 'VIDEO'])).toBe(true);
    expect(attachmentsAllowed(['IMAGE', 'IMAGE', 'IMAGE'])).toBe(true);
    expect(attachmentsAllowed(['VIDEO', 'VIDEO'])).toBe(false);
    expect(attachmentsAllowed(['IMAGE', 'IMAGE', 'IMAGE', 'IMAGE'])).toBe(false);
  });

  it('reads one byte range of a file, and anything else as the whole file', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
    // Past the end is cut to the end.
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
    // The last bytes.
    expect(parseRange('bytes=-50', 1000)).toEqual({ start: 950, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
    for (const header of [
      undefined,
      '',
      'bytes=-',
      'bytes=-0',
      'bytes=1000-',
      'bytes=200-100',
      'bytes=0-10,20-30',
      'items=0-10',
      'bytes=a-b',
    ]) {
      expect(parseRange(header, 1000)).toBeUndefined();
    }
    expect(parseRange('bytes=0-', 0)).toBeUndefined();
  });
});
