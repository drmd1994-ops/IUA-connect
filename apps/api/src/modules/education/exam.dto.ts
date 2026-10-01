import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { LEVELS, STATUSES, TIERS } from './education.dto';
import { MAX_OPTIONS, MIN_OPTIONS } from './exam-rules';

const locale = z.enum(['he', 'en']);
const position = z.number().int().min(1).max(MAX_OPTIONS);
const subspecialty = z
  .strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() })
  .nullable();

// --- Admin ----------------------------------------------------------------------------------

const questionText = z.strictObject({
  /** The question as asked. */
  stem: z.string().trim().min(1).max(4000),
  /** A short summary of the topic, shown after the reader answers. */
  summary: z.string().trim().max(4000).default(''),
});

const optionText = z.strictObject({
  text: z.string().trim().min(1).max(1000),
  /** Why this option is right, or why it is wrong. */
  explanation: z.string().trim().max(4000).default(''),
});

/**
 * The whole question (create, and replace). A draft may be incomplete; before review it needs
 * its Hebrew text, one right option, and an explanation for every option.
 */
export class ExamQuestionInputDto extends createZodDto(
  z
    .strictObject({
      /** Leave out for all levels. */
      level: z.enum(LEVELS).nullable().optional(),
      subspecialtyId: z.uuid().nullable().optional(),
      accessTier: z.enum(TIERS).default('PUBLIC'),
      /** The membership types allowed to practise it, when accessTier is TYPES. */
      typeIds: z.array(z.uuid()).max(10).default([]),
      translations: z
        .strictObject({ he: questionText.optional(), en: questionText.optional() })
        .refine((t) => t.he || t.en, { message: 'At least one language' }),
      /** In the order shown. */
      options: z
        .array(
          z.strictObject({
            correct: z.boolean().default(false),
            translations: z
              .strictObject({ he: optionText.optional(), en: optionText.optional() })
              .refine((t) => t.he || t.en, { message: 'At least one language' }),
          }),
        )
        .min(MIN_OPTIONS)
        .max(MAX_OPTIONS),
    })
    .refine((body) => body.accessTier !== 'TYPES' || body.typeIds.length > 0, {
      message: 'Choose at least one membership type',
      path: ['typeIds'],
    })
    .refine((body) => body.options.filter((option) => option.correct).length <= 1, {
      message: 'Only one option can be the right one',
      path: ['options'],
    }),
) {}

const questionTextView = z.strictObject({ stem: z.string(), summary: z.string() });
const optionTextView = z.strictObject({ text: z.string(), explanation: z.string() });

export class AdminExamQuestionDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    status: z.enum(STATUSES),
    level: z.enum(LEVELS).nullable(),
    subspecialtyId: z.uuid().nullable(),
    accessTier: z.enum(TIERS),
    typeIds: z.array(z.uuid()),
    translations: z.strictObject({
      he: questionTextView.optional(),
      en: questionTextView.optional(),
    }),
    options: z.array(
      z.strictObject({
        position,
        correct: z.boolean(),
        translations: z.strictObject({
          he: optionTextView.optional(),
          en: optionTextView.optional(),
        }),
      }),
    ),
    authorUserId: z.uuid().nullable(),
    submittedBy: z.uuid().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    /** Send it back as If-Match: "<version>" when saving. */
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
) {}

export class AdminExamQuestionListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(STATUSES).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

export class AdminExamQuestionListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        status: z.enum(STATUSES),
        stemHe: nullableString(),
        stemEn: nullableString(),
        accessTier: z.enum(TIERS),
        submittedBy: z.uuid().nullable(),
        updatedAt: z.iso.datetime(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

// --- Practice -------------------------------------------------------------------------------

/** A comma-separated list of question IDs already seen in this visit (at most 200). */
const exclude = z
  .string()
  .max(200 * 37)
  .optional()
  .transform((value) => (value ? value.split(',').filter(Boolean) : []))
  .pipe(z.array(z.uuid()).max(200));

export class NextQuestionQueryDto extends createZodDto(
  z.strictObject({
    /** The reader's language; text without it falls back to Hebrew. */
    locale: locale.default('he'),
    level: z.enum(LEVELS).optional(),
    /** A subspecialty key. */
    subspecialty: z.string().max(64).optional(),
    exclude,
  }),
) {}

/** A question as asked: **without** the right answer, the explanations or the summary. */
const askedQuestion = z.strictObject({
  id: z.uuid(),
  stem: z.string(),
  options: z.array(z.strictObject({ position, text: z.string() })),
  level: z.enum(LEVELS).nullable(),
  subspecialty,
  /** The language of the text returned. */
  locale,
});

export class NextQuestionDto extends createZodDto(
  z.strictObject({
    /** Null when no question is left for these filters. */
    question: askedQuestion.nullable(),
    /** How many more questions match after this one. */
    remaining: z.number().int(),
  }),
) {}

export class AnswerInputDto extends createZodDto(
  z.strictObject({
    /** The position of the chosen option. */
    position,
    locale: locale.default('he'),
  }),
) {}

/** What the reader sees after answering. */
export class AnswerResultDto extends createZodDto(
  z.strictObject({
    correct: z.boolean(),
    chosenPosition: position,
    correctPosition: position,
    /** Every option with why it is right or wrong. */
    options: z.array(
      z.strictObject({
        position,
        text: z.string(),
        correct: z.boolean(),
        explanation: z.string(),
      }),
    ),
    /** A short summary of the topic. */
    summary: z.string(),
    /** True when the answer was stored (signed-in people only). */
    saved: z.boolean(),
    /** True when this was the first answer to the question: the one that counts for the score. */
    countsForScore: z.boolean(),
  }),
) {}

export class ExamResultsQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

export class ExamResultsDto extends createZodDto(
  z.strictObject({
    /** Questions answered; how many were right on the first attempt; the percentage. */
    answered: z.number().int(),
    correct: z.number().int(),
    percent: z.number().int().nullable(),
    /** One line per question, the most recently answered first. */
    items: z.array(
      z.strictObject({
        questionId: z.uuid(),
        stem: z.string(),
        firstCorrect: z.boolean(),
        attempts: z.number().int(),
        lastAnsweredAt: z.iso.datetime(),
      }),
    ),
  }),
) {}
