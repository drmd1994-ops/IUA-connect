import { type AskFacts, askProblem, expiredBefore, planStep } from './mentorship-rules';

const NOW = new Date('2026-10-23T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function facts(over: Partial<AskFacts> = {}): AskFacts {
  return {
    waiting: 0,
    openWithMentor: false,
    lastDeclinedAt: null,
    mentorActive: 0,
    mentorCapacity: 2,
    now: NOW,
    ...over,
  };
}

describe('asking a mentor', () => {
  it('lets a mentee ask', () => {
    expect(askProblem(facts())).toBeNull();
  });

  it('allows 3 requests waiting at a time, not a 4th', () => {
    expect(askProblem(facts({ waiting: 2 }))).toBeNull();
    expect(askProblem(facts({ waiting: 3 }))).toBe('mentorshipTooManyWaiting');
  });

  it('waits 30 days before asking the same mentor again after a decline', () => {
    const declined = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);
    expect(askProblem(facts({ lastDeclinedAt: declined(29) }))).toBe('mentorshipAskedRecently');
    expect(askProblem(facts({ lastDeclinedAt: declined(30) }))).toBeNull();
  });

  it('refuses a mentor at their limit of mentees', () => {
    expect(askProblem(facts({ mentorActive: 2, mentorCapacity: 2 }))).toBe('mentorFull');
    expect(askProblem(facts({ mentorActive: 1, mentorCapacity: 2 }))).toBeNull();
  });

  it('refuses a second request to the same mentor while one is open', () => {
    expect(askProblem(facts({ openWithMentor: true }))).toBe('mentorshipAlreadyOpen');
  });
});

describe('a request closing by itself', () => {
  it('closes after 30 days without an answer', () => {
    expect(expiredBefore(NOW)).toEqual(new Date(NOW.getTime() - 30 * DAY));
  });
});

describe('the steps of a mentorship', () => {
  it('lets the mentor accept or decline a waiting request', () => {
    expect(planStep('accept', 'PENDING', 'mentor')).toEqual({ ok: true, to: 'ACCEPTED' });
    expect(planStep('decline', 'PENDING', 'mentor')).toEqual({ ok: true, to: 'DECLINED' });
  });

  it('never lets the mentee answer their own request', () => {
    expect(planStep('accept', 'PENDING', 'mentee')).toEqual({
      ok: false,
      code: 'mentorshipActionNotAllowed',
    });
  });

  it('lets the mentee withdraw a waiting request, and not an answered one', () => {
    expect(planStep('withdraw', 'PENDING', 'mentee')).toEqual({ ok: true, to: 'WITHDRAWN' });
    expect(planStep('withdraw', 'DECLINED', 'mentee')).toEqual({
      ok: false,
      code: 'mentorshipNotWaiting',
    });
  });

  it('lets either side end an accepted mentorship', () => {
    expect(planStep('end', 'ACCEPTED', 'mentor')).toEqual({ ok: true, to: 'ENDED' });
    expect(planStep('end', 'ACCEPTED', 'mentee')).toEqual({ ok: true, to: 'ENDED' });
    expect(planStep('end', 'PENDING', 'mentee')).toEqual({
      ok: false,
      code: 'mentorshipNotActive',
    });
  });
});
