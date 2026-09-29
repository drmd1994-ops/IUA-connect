/**
 * The application workflow (ARCHITECTURE.md §7, D3):
 *   PENDING_DIRECTOR → PENDING_ADMIN → APPROVED, or REJECTED at either stage, or WITHDRAWN.
 * Types without a director step (students) start at PENDING_ADMIN. So does an application whose
 * department has no director who could decide it, flagged for the admin.
 */
export type State = 'PENDING_DIRECTOR' | 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type Stage = 'DIRECTOR' | 'ADMIN';
export type Outcome = 'APPROVE' | 'REJECT';
export type Flag = 'NO_DIRECTOR' | 'APPLICANT_IS_DIRECTOR';

export const OPEN_STATES: readonly State[] = ['PENDING_DIRECTOR', 'PENDING_ADMIN'];

export function isOpen(state: State): boolean {
  return OPEN_STATES.includes(state);
}

export interface StartInput {
  /** The membership type goes through the department director. */
  directorApproval: boolean;
  /** Directors of the chosen department, other than the applicant. */
  otherDirectors: number;
  /** The applicant is a director of the chosen department. */
  applicantIsDirector: boolean;
}

export function initialState(input: StartInput): { state: State; flags: Flag[] } {
  if (!input.directorApproval) return { state: 'PENDING_ADMIN', flags: [] };
  if (input.otherDirectors > 0) return { state: 'PENDING_DIRECTOR', flags: [] };
  return {
    state: 'PENDING_ADMIN',
    flags: [input.applicantIsDirector ? 'APPLICANT_IS_DIRECTOR' : 'NO_DIRECTOR'],
  };
}

/** Which stage decides an application in this state (null once it's closed). */
export function stageOf(state: State): Stage | null {
  if (state === 'PENDING_DIRECTOR') return 'DIRECTOR';
  if (state === 'PENDING_ADMIN') return 'ADMIN';
  return null;
}

/** The state after a decision. Throws for a state no stage can decide (a programming error). */
export function afterDecision(state: State, outcome: Outcome): State {
  const stage = stageOf(state);
  if (!stage) throw new Error(`No decision is possible in state ${state}`);
  if (outcome === 'REJECT') return 'REJECTED';
  return stage === 'DIRECTOR' ? 'PENDING_ADMIN' : 'APPROVED';
}
