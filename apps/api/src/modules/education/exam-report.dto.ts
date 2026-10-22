import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

export const REPORT_REASONS = ['WRONG_ANSWER', 'UNCLEAR', 'OUTDATED', 'TYPO', 'OTHER'] as const;
const STATUS = z.enum(['OPEN', 'RESOLVED', 'DISMISSED']);
const locale = z.enum(['he', 'en']);

export class ExamReportInputDto extends createZodDto(
  z
    .strictObject({
      reason: z.enum(REPORT_REASONS),
      /** What is wrong, in the reader's words. Needed when the reason is OTHER. */
      text: z.string().trim().max(1000).default(''),
    })
    .refine((body) => body.reason !== 'OTHER' || body.text.length > 0, {
      message: 'Say what is wrong',
      path: ['text'],
    }),
) {}

export class ExamReportCreatedDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}

export class MyExamReportListDto extends createZodDto(
  z.strictObject({
    /** The newest first. */
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        questionId: z.uuid(),
        stem: z.string(),
        reason: z.enum(REPORT_REASONS),
        text: z.string(),
        status: STATUS,
        createdAt: z.iso.datetime(),
        handledAt: z.iso.datetime().nullable(),
        /** What the reviewer answered. */
        response: nullableString(),
      }),
    ),
  }),
) {}

export class MyExamReportQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

export class AdminExamReportQueryDto extends createZodDto(
  z.strictObject({
    status: STATUS.default('OPEN'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

/** A report as reviewers see it: never who sent it. */
export class AdminExamReportListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        questionId: z.uuid(),
        stemHe: nullableString(),
        stemEn: nullableString(),
        questionStatus: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']),
        reason: z.enum(REPORT_REASONS),
        text: z.string(),
        status: STATUS,
        createdAt: z.iso.datetime(),
        handledAt: z.iso.datetime().nullable(),
        response: nullableString(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class ExamReportDecisionDto extends createZodDto(
  z.strictObject({
    /** RESOLVED: the question was corrected or taken down. DISMISSED: it stays as it is. */
    outcome: z.enum(['RESOLVED', 'DISMISSED']),
    /** What the reader is told. */
    response: z.string().trim().min(1).max(1000),
  }),
) {}

/**
 * How readers answered a question (M23 plan §2, §3): first answers only, one per person. No
 * number is given until at least 5 people answered, so nobody can be picked out; never who.
 */
export class ExamQuestionStatisticsDto extends createZodDto(
  z.strictObject({
    /** Null below 5 people. */
    answered: z.number().int().nullable(),
    percentCorrect: z.number().int().nullable(),
    /** How many chose each option; null below 5 people. */
    options: z.array(
      z.strictObject({ position: z.number().int(), chosen: z.number().int().nullable() }),
    ),
    /** The fewest people a number is shown for. */
    shownFrom: z.number().int(),
    openReports: z.number().int(),
  }),
) {}
