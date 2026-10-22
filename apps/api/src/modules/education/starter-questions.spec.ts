import { readStarterQuestions, rotate } from '../../../prisma/seed/demo-question-bank';
import { SUBSPECIALTIES } from '../../../prisma/seed/reference-data';
import { LEVELS } from './education.dto';
import { DIFFICULTIES } from './exam-import';
import { questionProblem } from './exam-rules';

/** The question bank's starter set (M23 plan §2, owner answer §10.1), checked as data. */
describe('the starter questions', () => {
  const questions = readStarterQuestions();

  it('are 100, about 9 for each of the 11 subspecialties', () => {
    expect(questions).toHaveLength(100);
    for (const { key } of SUBSPECIALTIES) {
      expect(questions.filter((q) => q.topic === key).length).toBeGreaterThanOrEqual(9);
    }
  });

  it('are complete in Hebrew and English, ready for review, with a level, difficulty and reference', () => {
    for (const question of questions) {
      expect(LEVELS).toContain(question.level);
      expect(DIFFICULTIES).toContain(question.difficulty);
      expect(question.references.length).toBeGreaterThan(0);
      for (const locale of ['he', 'en'] as const) {
        expect(question[locale].stem.trim()).not.toBe('');
        expect(question[locale].summary.trim()).not.toBe('');
      }
      const draft = {
        hebrewStem: true,
        hebrewSummary: true,
        options: question.options.map((option) => ({
          correct: option.correct,
          hebrewText: option.he.text.trim() !== '' && option.en.text.trim() !== '',
          hebrewExplanation:
            option.he.explanation.trim() !== '' && option.en.explanation.trim() !== '',
        })),
      };
      expect(questionProblem(draft)).toBeNull();
    }
  });

  it('put the right answer in every position in turn', () => {
    expect(rotate(['a', 'b', 'c', 'd'], 0)).toEqual(['a', 'b', 'c', 'd']);
    expect(rotate(['a', 'b', 'c', 'd'], 1)).toEqual(['d', 'a', 'b', 'c']);
    expect(rotate(['a', 'b', 'c', 'd'], 6)).toEqual(['c', 'd', 'a', 'b']);
    const positions = questions.map(
      (question, index) =>
        rotate(question.options, index).findIndex((option) => option.correct) + 1,
    );
    for (const position of [1, 2, 3, 4]) {
      expect(positions.filter((p) => p === position).length).toBe(25);
    }
  });
});
