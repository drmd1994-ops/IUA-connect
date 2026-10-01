import { type QuestionDraft, questionProblem, score } from './exam-rules';

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
});
