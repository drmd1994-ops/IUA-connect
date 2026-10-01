import { type PublishCheck, cancelProblem, isPast, publishProblem } from './event-rules';

describe('event rules', () => {
  const ready: PublishCheck = {
    status: 'DRAFT',
    startAt: new Date('2027-03-01T07:00:00Z'),
    endAt: new Date('2027-03-01T15:00:00Z'),
    hasHebrewTitle: true,
    registrationMode: 'INTERNAL',
    registrationUrl: null,
  };

  it('publishes a complete draft', () => {
    expect(publishProblem(ready)).toBeNull();
  });

  it.each([
    ['an event that is already published', { status: 'PUBLISHED' }, 'eventNotDraft'],
    ['a cancelled event', { status: 'CANCELLED' }, 'eventNotDraft'],
    ['a draft without dates', { startAt: null, endAt: null }, 'eventDatesRequired'],
    ['an end before the start', { endAt: new Date('2027-03-01T06:00:00Z') }, 'eventEndBeforeStart'],
    ['a draft without a Hebrew title', { hasHebrewTitle: false }, 'eventHebrewRequired'],
    [
      'external registration without a link',
      { registrationMode: 'EXTERNAL' },
      'eventRegistrationUrlRequired',
    ],
  ] as const)('refuses %s', (_name, change, code) => {
    expect(publishProblem({ ...ready, ...change })).toBe(code);
  });

  it('accepts external registration with a link', () => {
    expect(
      publishProblem({
        ...ready,
        registrationMode: 'EXTERNAL',
        registrationUrl: 'https://tickets.example.test/e',
      }),
    ).toBeNull();
  });

  it('cancels only a published event, with a reason', () => {
    expect(cancelProblem('PUBLISHED', 'The venue closed')).toBeNull();
    expect(cancelProblem('PUBLISHED', '  ')).toBe('eventCancelReasonRequired');
    expect(cancelProblem('PUBLISHED', undefined)).toBe('eventCancelReasonRequired');
    expect(cancelProblem('DRAFT', 'x')).toBe('eventNotPublished');
    expect(cancelProblem('CANCELLED', 'x')).toBe('eventNotPublished');
  });

  it('counts an event as past once it has ended', () => {
    const end = new Date('2027-03-01T15:00:00Z');
    expect(isPast(end, new Date('2027-03-01T14:59:59Z'))).toBe(false);
    expect(isPast(end, new Date('2027-03-01T15:00:00Z'))).toBe(true);
  });
});
