import { overlapping, placesLeft, registrationProblem } from './schedule-rules';

describe('schedule rules', () => {
  const slot = (id: string, from: number, to: number) => ({
    id,
    startAt: new Date(Date.UTC(2030, 0, 10, from)),
    endAt: new Date(Date.UTC(2030, 0, 10, to)),
  });

  it('flags sessions that overlap, on both sides', () => {
    const found = overlapping([slot('a', 8, 10), slot('b', 9, 11), slot('c', 12, 13)]);
    expect([...found].sort()).toEqual(['a', 'b']);
  });

  it('does not flag sessions that only touch', () => {
    expect(overlapping([slot('a', 8, 9), slot('b', 9, 10)]).size).toBe(0);
  });

  it('flags a session inside another, and several at once', () => {
    const found = overlapping([slot('long', 8, 12), slot('in', 9, 10), slot('late', 11, 13)]);
    expect([...found].sort()).toEqual(['in', 'late', 'long']);
  });

  it('handles an empty or single choice', () => {
    expect(overlapping([]).size).toBe(0);
    expect(overlapping([slot('a', 8, 9)]).size).toBe(0);
  });

  it('counts free places, never below zero', () => {
    expect(placesLeft(null, 500)).toBeNull();
    expect(placesLeft(40, 12)).toBe(28);
    expect(placesLeft(40, 40)).toBe(0);
    expect(placesLeft(40, 41)).toBe(0);
  });

  describe('registration window', () => {
    const start = new Date('2030-01-10T07:00:00Z');
    const open = { status: 'PUBLISHED', registrationMode: 'INTERNAL', startAt: start } as const;
    const before = new Date('2030-01-09T07:00:00Z');

    it('is open before a published in-app event starts', () => {
      expect(registrationProblem(open, before)).toBeNull();
    });

    it('closes when the event starts', () => {
      expect(registrationProblem(open, start)).toBe('registrationClosed');
    });

    it.each([
      ['a cancelled event', { ...open, status: 'CANCELLED' }, 'registrationClosed'],
      ['a draft', { ...open, status: 'DRAFT' }, 'registrationClosed'],
      [
        'registration on another site',
        { ...open, registrationMode: 'EXTERNAL' },
        'registrationNotInApp',
      ],
      ['no registration', { ...open, registrationMode: 'NONE' }, 'registrationNotInApp'],
    ] as const)('is closed for %s', (_name, event, code) => {
      expect(registrationProblem(event, before)).toBe(code);
    });
  });
});
