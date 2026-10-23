import {
  type QuestionDraft,
  questionProblem,
  questionStatistics,
  referencesOf,
  score,
  wrongNow,
} from './exam-rules';

describe('exam question rules', () => {
  const option = (correct = false) => ({ correct, hebrewText: true, hebrewExplanation: true });
  const ready: QuestionDraft = {
    hebrewStem: true,
    hebrewSummary: true,
    options: [option(true), option(), option(), option()],
  };

  it('accepts a complete question', () => {
    expect(questionProblem(ready)).toBeNull();
    expect(questionProblem({ ...ready, options: [option(true), option()] })).toBeNull();
  });

  it.each([
    ['no Hebrew question text', { hebrewStem: false }, 'examStemRequired'],
    ['one option only', { options: [option(true)] }, 'examOptionCount'],
    ['seven options', { options: [option(true), ...Array(6).fill(option())] }, 'examOptionCount'],
    ['no right option', { options: [option(), option()] }, 'examOneCorrectOption'],
    ['two right options', { options: [option(true), option(true)] }, 'examOneCorrectOption'],
    [
      'an option without text',
      { options: [option(true), { ...option(), hebrewText: false }] },
      'examOptionTextRequired',
    ],
    [
      'a wrong option without an explanation',
      { options: [option(true), { ...option(), hebrewExplanation: false }] },
      'examExplanationRequired',
    ],
    [
      'the right option without an explanation',
      { options: [{ ...option(true), hebrewExplanation: false }, option()] },
      'examExplanationRequired',
    ],
    ['no topic summary', { hebrewSummary: false }, 'examSummaryRequired'],
  ] as const)('refuses %s', (_name, change, code) => {
    expect(questionProblem({ ...ready, ...change } as QuestionDraft)).toBe(code);
  });

  describe('score', () => {
    it('is empty before anything is answered', () => {
      expect(score([])).toEqual({ answered: 0, correct: 0, percent: null });
    });

    it('counts the first answer to each question only', () => {
      expect(
        score([
          { questionId: 'a', correct: false, counts: true },
          { questionId: 'a', correct: true, counts: false }, // tried again: kept, not counted
          { questionId: 'b', correct: true, counts: true },
          { questionId: 'c', correct: true, counts: true },
        ]),
      ).toEqual({ answered: 3, correct: 2, percent: 67 });
    });

    it('reaches 100 and 0', () => {
      expect(score([{ questionId: 'a', correct: true, counts: true }]).percent).toBe(100);
      expect(score([{ questionId: 'a', correct: false, counts: true }]).percent).toBe(0);
    });
  });

  it('lists a question as wrong while its latest answer is wrong', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 23, 10, minute));
    expect(
      wrongNow([
        { questionId: 'a', correct: false, at: at(1) },
        { questionId: 'a', correct: true, at: at(2) },
        { questionId: 'b', correct: true, at: at(1) },
        { questionId: 'b', correct: false, at: at(3) },
        { questionId: 'c', correct: false, at: at(5) },
      ]).sort(),
    ).toEqual(['b', 'c']);
  });

  it('reads stored references, leaving out anything malformed', () => {
    expect(
      referencesOf([
        { title: 'A', url: 'https://x.test' },
        { title: 'B' },
        { url: 'x' },
        'y',
        null,
      ]),
    ).toEqual([{ title: 'A', url: 'https://x.test' }, { title: 'B' }]);
    expect(referencesOf(null)).toEqual([]);
  });

  it('withholds every statistic until five people answered', () => {
    const four = [1, 1, 2, 3].map((position) => ({ position, correct: position === 1 }));
    expect(questionStatistics(four, [1, 2, 3, 4])).toEqual({
      answered: null,
      percentCorrect: null,
      options: [1, 2, 3, 4].map((position) => ({ position, chosen: null })),
    });
    const five = [...four, { position: 1, correct: true }];
    expect(questionStatistics(five, [1, 2, 3, 4])).toEqual({
      answered: 5,
      percentCorrect: 60,
      options: [
        { position: 1, chosen: 3 },
        { position: 2, chosen: 1 },
        { position: 3, chosen: 1 },
        { position: 4, chosen: 0 },
      ],
    });
  });
});
