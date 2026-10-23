import { type AskFacts, askProblem, isStale, planStep } from './research-rules';

const NOW = new Date('2026-10-24T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function facts(over: Partial<AskFacts> = {}): AskFacts {
  return {
    taking: true,
    ownProject: false,
    openWithProject: false,
    lastDeclinedAt: null,
    waiting: 0,
    now: NOW,
    ...over,
  };
}

describe('asking to join a research project', () => {
  it('lets a person ask', () => {
    expect(askProblem(facts())).toBeNull();
  });

  it('refuses the lead, a closed project, and a second open request', () => {
    expect(askProblem(facts({ ownProject: true }))).toBe('researchOwnProject');
    expect(askProblem(facts({ taking: false }))).toBe('researchNotTaking');
    expect(askProblem(facts({ openWithProject: true }))).toBe('researchAlreadyOpen');
  });

  it('waits 30 days after a decline, and allows 5 waiting requests', () => {
    const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
    expect(askProblem(facts({ lastDeclinedAt: ago(29) }))).toBe('researchAskedRecently');
    expect(askProblem(facts({ lastDeclinedAt: ago(30) }))).toBeNull();
    expect(askProblem(facts({ waiting: 4 }))).toBeNull();
    expect(askProblem(facts({ waiting: 5 }))).toBe('researchTooManyWaiting');
  });
});

describe('the steps of a request', () => {
  it('lets the lead accept or decline, and the asker withdraw', () => {
    expect(planStep('accept', 'PENDING', 'lead')).toEqual({ ok: true, to: 'ACCEPTED' });
    expect(planStep('decline', 'PENDING', 'lead')).toEqual({ ok: true, to: 'DECLINED' });
    expect(planStep('withdraw', 'PENDING', 'asker')).toEqual({ ok: true, to: 'WITHDRAWN' });
  });

  it('refuses the wrong side and an answered request', () => {
    expect(planStep('accept', 'PENDING', 'asker')).toEqual({
      ok: false,
      code: 'researchActionNotAllowed',
    });
    expect(planStep('decline', 'ACCEPTED', 'lead')).toEqual({
      ok: false,
      code: 'researchNotWaiting',
    });
  });
});

describe('a project going stale', () => {
  it('is marked a year after it was last confirmed', () => {
    expect(isStale(new Date(NOW.getTime() - 364 * DAY), NOW)).toBe(false);
    expect(isStale(new Date(NOW.getTime() - 365 * DAY), NOW)).toBe(true);
  });
});
