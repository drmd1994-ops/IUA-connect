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

export interface QuestionReference {
  title: string;
  url?: string;
}

/** The references stored on a question (JSON), as shown. Anything malformed is left out. */
export function referencesOf(value: unknown): QuestionReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const { title, url } = item as Record<string, unknown>;
    if (typeof title !== 'string' || !title) return [];
    return [typeof url === 'string' && url ? { title, url } : { title }];
  });
}

/** "Reviewed by … on …", from the columns the publish step fills; null before it is published. */
export function reviewerView(row: {
  reviewerNameHe: string | null;
  reviewerNameEn: string | null;
  reviewedAt: Date | null;
}): { nameHe: string | null; nameEn: string | null; at: string } | null {
  if (!row.reviewedAt) return null;
  return {
    nameHe: row.reviewerNameHe,
    nameEn: row.reviewerNameEn,
    at: row.reviewedAt.toISOString(),
  };
}

/** Practice leaves out a question the person answered right within this many days (M23 §2). */
export const RIGHT_RECENTLY_DAYS = 30;

/**
 * "The ones I got wrong": the questions whose latest answer was wrong. Answering one right later
 * takes it off the list.
 */
export function wrongNow(
  answers: readonly { questionId: string; correct: boolean; at: Date }[],
): string[] {
  const latest = new Map<string, { correct: boolean; at: Date }>();
  for (const answer of answers) {
    const seen = latest.get(answer.questionId);
    if (!seen || answer.at > seen.at) latest.set(answer.questionId, answer);
  }
  return [...latest].filter(([, answer]) => !answer.correct).map(([questionId]) => questionId);
}

/** Staff see no number about a question until at least this many people answered it (M23). */
export const STATISTICS_FROM = 5;

/**
 * How people answered a question, from first answers (one per person). Below STATISTICS_FROM
 * people every number is withheld, so nobody's answer can be worked out.
 */
export function questionStatistics(
  firstAnswers: readonly { position: number; correct: boolean }[],
  optionPositions: readonly number[],
): {
  answered: number | null;
  percentCorrect: number | null;
  options: { position: number; chosen: number | null }[];
} {
  const enough = firstAnswers.length >= STATISTICS_FROM;
  const correct = firstAnswers.filter((answer) => answer.correct).length;
  return {
    answered: enough ? firstAnswers.length : null,
    percentCorrect: enough ? Math.round((correct / firstAnswers.length) * 100) : null,
    options: optionPositions.map((position) => ({
      position,
      chosen: enough ? firstAnswers.filter((answer) => answer.position === position).length : null,
    })),
  };
}
