import { israelMidnight } from './audit-log.service';

describe('when a day starts in Israel', () => {
  it('in winter (UTC+2) and summer (UTC+3)', () => {
    expect(israelMidnight('2026-01-15').toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(israelMidnight('2026-07-15').toISOString()).toBe('2026-07-14T21:00:00.000Z');
  });

  it('on the days the clocks change', () => {
    // Summer time ends on 25 October 2026 at 02:00: the day starts at 00:00 summer time.
    expect(israelMidnight('2026-10-25').toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(israelMidnight('2026-10-26').toISOString()).toBe('2026-10-25T22:00:00.000Z');
    // Summer time starts on 27 March 2026 at 02:00: the day starts at 00:00 winter time.
    expect(israelMidnight('2026-03-27').toISOString()).toBe('2026-03-26T22:00:00.000Z');
    expect(israelMidnight('2026-03-28').toISOString()).toBe('2026-03-27T21:00:00.000Z');
  });
});
