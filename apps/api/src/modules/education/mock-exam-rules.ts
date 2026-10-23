/** Pure rules of the mock exam (M23 plan §2, §3, owner answer §10.4). */

export const MOCK_SIZES = [10, 25, 50] as const;
export const SECONDS_PER_QUESTION = 90;
/**
 * An answer sent in the last moment may arrive a little after the clock ran out. This much is
 * forgiven; nothing later counts.
 */
export const GRACE_SECONDS = 2;

/** When an exam of this many questions, started now, ends. */
export function endsAt(startedAt: Date, questions: number): Date {
  return new Date(startedAt.getTime() + questions * SECONDS_PER_QUESTION * 1000);
}

/** Whether an answer may still be given. */
export function acceptsAnswers(
  exam: { finishedAt: Date | null; endsAt: Date },
  now: Date,
): boolean {
  return !exam.finishedAt && now.getTime() <= exam.endsAt.getTime() + GRACE_SECONDS * 1000;
}

/** Whether the exam is over and only waits to be closed (its answers written and scored). */
export function overdue(exam: { finishedAt: Date | null; endsAt: Date }, now: Date): boolean {
  return !exam.finishedAt && now.getTime() > exam.endsAt.getTime() + GRACE_SECONDS * 1000;
}

/** Chooses up to `count` of the ids at random, in a random order (Fisher–Yates). */
export function sample<T>(items: readonly T[], count: number, random = Math.random): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}
