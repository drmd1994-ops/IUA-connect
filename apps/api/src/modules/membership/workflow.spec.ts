import { afterDecision, initialState, isOpen, stageOf } from './workflow';

describe('membership application workflow', () => {
  it('starts with the director when the type needs one and a director exists', () => {
    expect(
      initialState({ directorApproval: true, otherDirectors: 1, applicantIsDirector: false }),
    ).toEqual({ state: 'PENDING_DIRECTOR', flags: [] });
    // Another director decides when the applicant is one of several.
    expect(
      initialState({ directorApproval: true, otherDirectors: 1, applicantIsDirector: true }),
    ).toEqual({ state: 'PENDING_DIRECTOR', flags: [] });
  });

  it('skips the director for students', () => {
    expect(
      initialState({ directorApproval: false, otherDirectors: 2, applicantIsDirector: false }),
    ).toEqual({ state: 'PENDING_ADMIN', flags: [] });
  });

  it('sends the application to the admin, flagged, when no director can decide it', () => {
    expect(
      initialState({ directorApproval: true, otherDirectors: 0, applicantIsDirector: false }),
    ).toEqual({ state: 'PENDING_ADMIN', flags: ['NO_DIRECTOR'] });
    expect(
      initialState({ directorApproval: true, otherDirectors: 0, applicantIsDirector: true }),
    ).toEqual({ state: 'PENDING_ADMIN', flags: ['APPLICANT_IS_DIRECTOR'] });
  });

  it('moves through the stages', () => {
    expect(stageOf('PENDING_DIRECTOR')).toBe('DIRECTOR');
    expect(afterDecision('PENDING_DIRECTOR', 'APPROVE')).toBe('PENDING_ADMIN');
    expect(stageOf('PENDING_ADMIN')).toBe('ADMIN');
    expect(afterDecision('PENDING_ADMIN', 'APPROVE')).toBe('APPROVED');
    expect(afterDecision('PENDING_DIRECTOR', 'REJECT')).toBe('REJECTED');
    expect(afterDecision('PENDING_ADMIN', 'REJECT')).toBe('REJECTED');
  });

  it('allows no decision once closed', () => {
    for (const state of ['APPROVED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(isOpen(state)).toBe(false);
      expect(stageOf(state)).toBeNull();
      expect(() => afterDecision(state, 'APPROVE')).toThrow();
    }
  });
});
