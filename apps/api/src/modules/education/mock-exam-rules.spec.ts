import { acceptsAnswers, endsAt, overdue, sample } from './mock-exam-rules';

describe('mock exam rules', () => {
  const start = new Date(Date.UTC(2026, 9, 23, 10, 0, 0));
  const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

  it('gives 90 seconds a question', () => {
    expect(endsAt(start, 10)).toEqual(at(900));
    expect(endsAt(start, 50)).toEqual(at(4500));
  });

  it('takes answers until the end and two seconds after, never once finished', () => {
    const exam = { finishedAt: null, endsAt: at(900) };
    expect(acceptsAnswers(exam, at(900))).toBe(true);
    expect(acceptsAnswers(exam, at(902))).toBe(true);
    expect(acceptsAnswers(exam, at(902.001))).toBe(false);
    expect(overdue(exam, at(902))).toBe(false);
    expect(overdue(exam, at(903))).toBe(true);
    const finished = { finishedAt: at(100), endsAt: at(900) };
    expect(acceptsAnswers(finished, at(101))).toBe(false);
    expect(overdue(finished, at(1000))).toBe(false);
  });

  it('chooses at most the number asked for, each once', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `q${i}`);
    const chosen = sample(ids, 10);
    expect(chosen).toHaveLength(10);
    expect(new Set(chosen).size).toBe(10);
    expect(chosen.every((id) => ids.includes(id))).toBe(true);
    expect(sample(ids.slice(0, 3), 10)).toHaveLength(3);
    expect(sample([], 10)).toEqual([]);
  });
});
