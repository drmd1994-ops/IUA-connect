/**
 * A person's progress in the question bank (M23 plan §2, owner answer §10.4), from first answers
 * only: answering a question again never changes it.
 */

/** A topic is weak when at least this many of its questions were answered … */
export const WEAK_MIN_ANSWERED = 5;
/** … and fewer than this share of them right. */
export const WEAK_BELOW_PERCENT = 60;
/** The weeks shown, this one included. */
export const PROGRESS_WEEKS = 12;

export interface FirstAnswer {
  /** The question's subspecialty key; null for a question with none. */
  topic: string | null;
  correct: boolean;
  at: Date;
}

export const percentOf = (correct: number, answered: number): number | null =>
  answered === 0 ? null : Math.round((correct / answered) * 100);

export function isWeak(answered: number, correct: number): boolean {
  return answered >= WEAK_MIN_ANSWERED && (correct / answered) * 100 < WEAK_BELOW_PERCENT;
}

/** Answered and right, per topic. */
export function byTopic(
  answers: readonly FirstAnswer[],
): Map<string | null, { answered: number; correct: number }> {
  const topics = new Map<string | null, { answered: number; correct: number }>();
  for (const answer of answers) {
    const topic = topics.get(answer.topic) ?? { answered: 0, correct: 0 };
    topic.answered += 1;
    if (answer.correct) topic.correct += 1;
    topics.set(answer.topic, topic);
  }
  return topics;
}

/** The Sunday (UTC) that starts the week of this moment, as YYYY-MM-DD. */
export function weekOf(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day.toISOString().slice(0, 10);
}

/** Answered and right in each of the last weeks, the oldest first; weeks without answers too. */
export function byWeek(
  answers: readonly FirstAnswer[],
  now: Date,
  weeks = PROGRESS_WEEKS,
): { start: string; answered: number; correct: number }[] {
  const starts: string[] = [];
  const first = new Date(`${weekOf(now)}T00:00:00Z`);
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - i * 7);
    starts.push(start.toISOString().slice(0, 10));
  }
  const counts = new Map(starts.map((start) => [start, { start, answered: 0, correct: 0 }]));
  for (const answer of answers) {
    const week = counts.get(weekOf(answer.at));
    if (!week) continue;
    week.answered += 1;
    if (answer.correct) week.correct += 1;
  }
  return [...counts.values()];
}
