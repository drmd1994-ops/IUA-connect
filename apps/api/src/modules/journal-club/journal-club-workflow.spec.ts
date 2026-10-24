import { monthStart, planJournalClubTransition, showsTotals } from './journal-club-workflow';

describe('journal club review (M31)', () => {
  const base = { submittedBy: 'writer', actorUserId: 'other', canEdit: true };

  it('lets an editor submit a draft, and another publish it', () => {
    expect(planJournalClubTransition('SUBMIT', { ...base, status: 'DRAFT' })).toEqual({
      ok: true,
      to: 'IN_REVIEW',
    });
    expect(planJournalClubTransition('PUBLISH', { ...base, status: 'IN_REVIEW' })).toEqual({
      ok: true,
      to: 'PUBLISHED',
    });
  });

  it('never lets the one who submitted it publish it', () => {
    expect(
      planJournalClubTransition('PUBLISH', {
        ...base,
        status: 'IN_REVIEW',
        actorUserId: 'writer',
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN', code: 'ownSubmission' });
  });

  it('refuses someone who is not an editor for the subspecialty', () => {
    expect(
      planJournalClubTransition('SUBMIT', { ...base, status: 'DRAFT', canEdit: false }),
    ).toMatchObject({ ok: false, code: 'journalClubNotAllowed' });
  });

  it('asks for a comment when sending back, and refuses a step from the wrong state', () => {
    expect(planJournalClubTransition('SEND_BACK', { ...base, status: 'IN_REVIEW' })).toMatchObject({
      ok: false,
      code: 'commentRequired',
    });
    expect(planJournalClubTransition('ARCHIVE', { ...base, status: 'DRAFT' })).toMatchObject({
      ok: false,
      code: 'journalClubTransitionNotAllowed',
    });
  });

  it('shows the poll totals after answering, or once archived', () => {
    expect(showsTotals('PUBLISHED', false)).toBe(false);
    expect(showsTotals('PUBLISHED', true)).toBe(true);
    expect(showsTotals('ARCHIVED', false)).toBe(true);
  });

  it('reads a month as its first day', () => {
    expect(monthStart('2026-10')?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(monthStart('2026-13')).toBeNull();
    expect(monthStart('October')).toBeNull();
  });
});
