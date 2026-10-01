/** Pure rules of the exam question demo (M6 plan §2.10, §3). */

export interface QuestionDraft {
  /** Hebrew is the fallback language, so the Hebrew text must be complete before review. */
  hebrewStem: boolean;
  hebrewSummary: boolean;
  options: {
    correct: boolean;
    hebrewText: boolean;
    /** Why the option is right, or why it is wrong: every option needs one. */
    hebrewExplanation: boolean;
  }[];
}

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

/**
 * What a question still needs before it can be submitted for review, as an error-detail code;
 * null when it is ready.
 */
export function questionProblem(question: QuestionDraft): string | null {
  if (!question.hebrewStem) return 'examStemRequired';
  if (question.options.length < MIN_OPTIONS || question.options.length > MAX_OPTIONS) {
    return 'examOptionCount';
  }
  if (question.options.filter((option) => option.correct).length !== 1) {
    return 'examOneCorrectOption';
  }
  if (question.options.some((option) => !option.hebrewText)) return 'examOptionTextRequired';
  if (question.options.some((option) => !option.hebrewExplanation)) {
    return 'examExplanationRequired';
  }
  if (!question.hebrewSummary) return 'examSummaryRequired';
  return null;
}

export interface AnswerRecord {
  questionId: string;
  correct: boolean;
  /** True for the first answer to the question: the one that counts. */
  counts: boolean;
}

/**
 * A person's score: the questions they answered, and how many they got right on the first
 * attempt. Answering again is allowed and kept, but doesn't change the score.
 */
export function score(answers: readonly AnswerRecord[]): {
  answered: number;
  correct: number;
  percent: number | null;
} {
  const first = answers.filter((answer) => answer.counts);
  const answered = new Set(first.map((answer) => answer.questionId)).size;
  const correct = first.filter((answer) => answer.correct).length;
  return {
    answered,
    correct,
    percent: answered === 0 ? null : Math.round((correct / answered) * 100),
  };
}
