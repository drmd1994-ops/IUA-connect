/**
 * What exam practice decides without the phone or the server: where the practice stands, the
 * score of this visit, and what is said about each option once the server has answered. The
 * right answer and the explanations arrive only in the reply to an answer.
 */

export type ExamState = 'loading' | 'asking' | 'answered' | 'none' | 'done';

/** After asking for the next question: one to answer, none at all, or all of them answered. */
export function stateAfterNext(hasQuestion: boolean, seenInVisit: number): ExamState {
  if (hasQuestion) return 'asking';
  return seenInVisit > 0 ? 'done' : 'none';
}

export interface Visit {
  answered: number;
  correct: number;
}

export function countAnswer(visit: Visit, correct: boolean): Visit {
  return { answered: visit.answered + 1, correct: visit.correct + (correct ? 1 : 0) };
}

/** What is said under an answer about saving: nothing, saved, or saved but not counted. */
export function savedNote(result: {
  saved: boolean;
  countsForScore: boolean;
}): 'savedNote' | 'repeatNote' | null {
  if (!result.saved) return null;
  return result.countsForScore ? 'savedNote' : 'repeatNote';
}

/** The marks an option carries after the answer: the right one, and the reader's own. */
export function optionMarks(
  option: { position: number; correct: boolean },
  chosenPosition: number,
): { right: boolean; yours: boolean; why: 'whyRight' | 'whyWrong' } {
  return {
    right: option.correct,
    yours: option.position === chosenPosition,
    why: option.correct ? 'whyRight' : 'whyWrong',
  };
}

/** The name of the place a link leads to ("youtube.com"), or the link itself when it has none. */
export function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:?#]+)/i.exec(url);
  return match?.[1]?.replace(/^www\./i, '') ?? url;
}

/** Minutes and seconds left, as a clock shows them (M23 mock exam). */
export function clock(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The share right, rounded; 0 for an exam with no questions. */
export function percent(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

/**
 * Which warning is due as the mock exam's clock runs down, once each: five minutes and one minute
 * before the end. Once the one-minute warning was given, the five-minute one is never said late.
 */
export function dueWarning(left: number, given: ReadonlySet<number>): 5 | 1 | null {
  if (left <= 0 || given.has(1)) return null;
  if (left <= 60_000) return 1;
  if (left <= 5 * 60_000 && !given.has(5)) return 5;
  return null;
}
