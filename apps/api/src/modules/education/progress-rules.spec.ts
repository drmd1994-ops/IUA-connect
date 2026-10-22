import { byTopic, byWeek, isWeak, percentOf, weekOf } from './progress-rules';

describe('progress in the question bank', () => {
  const day = (date: string) => new Date(`${date}T12:00:00Z`);

  it('calls a topic weak from 5 answered with less than 60% right', () => {
    expect(isWeak(4, 0)).toBe(false);
    expect(isWeak(5, 2)).toBe(true); // 40%
    expect(isWeak(5, 3)).toBe(false); // exactly 60%
    expect(isWeak(10, 5)).toBe(true); // 50%
    expect(percentOf(0, 0)).toBeNull();
    expect(percentOf(2, 3)).toBe(67);
  });

  it('counts each topic, with questions without one apart', () => {
    // A worked example: stones 3 of 5 right; oncology 1 of 5; one question with no topic.
    const answers = [
      ...[true, true, true, false, false].map((correct) => ({ topic: 'stones', correct })),
      ...[true, false, false, false, false].map((correct) => ({ topic: 'oncology', correct })),
      { topic: null, correct: true },
    ].map((answer) => ({ ...answer, at: day('2026-10-20') }));
    const topics = byTopic(answers);
    expect(topics.get('stones')).toEqual({ answered: 5, correct: 3 });
    expect(topics.get('oncology')).toEqual({ answered: 5, correct: 1 });
    expect(topics.get(null)).toEqual({ answered: 1, correct: 1 });
    expect(isWeak(5, 3)).toBe(false);
    expect(isWeak(5, 1)).toBe(true);
  });

  it('starts weeks on Sunday and shows the last twelve, empty ones included', () => {
    expect(weekOf(day('2026-10-23'))).toBe('2026-10-18'); // a Friday
    expect(weekOf(day('2026-10-18'))).toBe('2026-10-18'); // a Sunday
    const weeks = byWeek(
      [
        { topic: null, correct: true, at: day('2026-10-19') },
        { topic: null, correct: false, at: day('2026-10-23') },
        { topic: null, correct: true, at: day('2026-10-05') },
        { topic: null, correct: true, at: day('2025-01-01') }, // too old to show
      ],
      day('2026-10-23'),
    );
    expect(weeks).toHaveLength(12);
    expect(weeks[0]!.start).toBe('2026-08-02');
    expect(weeks[11]).toEqual({ start: '2026-10-18', answered: 2, correct: 1 });
    expect(weeks[9]).toEqual({ start: '2026-10-04', answered: 1, correct: 1 });
    expect(weeks[10]).toEqual({ start: '2026-10-11', answered: 0, correct: 0 });
  });
});
