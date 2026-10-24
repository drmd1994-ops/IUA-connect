import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

export const AGE_RANGES = [
  'UNDER_18',
  'FROM_18_TO_39',
  'FROM_40_TO_64',
  'FROM_65_TO_79',
  'OVER_80',
] as const;
export const SEXES = ['FEMALE', 'MALE', 'NOT_STATED'] as const;
export const CASE_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'RETURNED',
  'PUBLISHED',
  'HIDDEN',
  'REMOVED',
] as const;
export const REVIEW_ACTIONS = [
  'APPROVE',
  'RETURN',
  'RESTORE',
  'REMOVE',
  'TAKE_BACK',
  'WEEK',
] as const;
export const MAX_PICTURES = 4;

const nameRef = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });
const subspecialtyRef = nameRef.extend({ key: z.string() });
const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null);

/**
 * The author as readers see them (owner answer §10.3: shown): name and mark. Never their
 * hospital: with the case, it could point to the patient (plan §4, no institution on a case).
 */
const authorSchema = z.strictObject({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  mark: z.enum(['STUDENT', 'RESIDENT']).nullable(),
});

export class CaseInputDto extends createZodDto(
  z
    .strictObject({
      subspecialtyId: z.uuid(),
      title: z.string().trim().min(1).max(200),
      ageRange: z.enum(AGE_RANGES),
      sex: z.enum(SEXES),
      history: z.string().trim().min(1).max(5000),
      examination: optionalText(3000),
      labs: optionalText(3000),
      imaging: optionalText(3000),
      pathology: optionalText(3000),
      management: optionalText(3000),
      question: z.string().trim().min(1).max(1000),
      /** The poll "What would you do?": none, or 2 to 4 options. */
      pollOptions: z.array(z.string().trim().min(1).max(200)).max(4).default([]),
      /** Pictures uploaded for cases, in order. */
      fileIds: z.array(z.uuid()).max(MAX_PICTURES).default([]),
      /** The author confirms the pictures show no name, number, date or face. */
      picturesConfirmed: z.boolean().default(false),
    })
    .refine((body) => body.pollOptions.length !== 1, {
      message: 'A poll has 2 to 4 options',
      path: ['pollOptions'],
    })
    .refine((body) => body.fileIds.length === 0 || body.picturesConfirmed, {
      message: 'Confirm the pictures show no name, number, date or face',
      path: ['picturesConfirmed'],
    }),
) {}

const pollSchema = z.strictObject({
  options: z.array(z.strictObject({ id: z.uuid(), text: z.string() })),
  /** Answers are taken while the case is published. */
  open: z.boolean(),
  mine: z.uuid().nullable(),
  /** Counts by option id, shown after answering; never who. */
  totals: z.record(z.string(), z.number().int()).nullable(),
  total: z.number().int(),
});

const summaryFields = {
  id: z.uuid(),
  title: z.string(),
  subspecialty: subspecialtyRef,
  ageRange: z.enum(AGE_RANGES),
  sex: z.enum(SEXES),
  question: z.string(),
  author: authorSchema.nullable(),
  status: z.enum(CASE_STATUSES),
  publishedAt: z.iso.datetime().nullable(),
  pictures: z.number().int(),
  comments: z.number().int(),
};
const caseSummary = z.strictObject(summaryFields);

export class CaseListDto extends createZodDto(
  z.strictObject({
    items: z.array(caseSummary),
    /** The case of the week, when there is one. */
    week: caseSummary.nullable(),
    /** The reader reviews cases in at least one subspecialty. */
    reviewer: z.boolean(),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class CaseListQueryDto extends createZodDto(
  z.strictObject({
    /** A subspecialty key. */
    subspecialty: z.string().trim().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  }),
) {}

export class MyCasesDto extends createZodDto(
  z.strictObject({ items: z.array(caseSummary.extend({ reviewNote: nullableString() })) }),
) {}

export class CaseDto extends createZodDto(
  caseSummary.extend({
    history: z.string(),
    examination: nullableString(),
    labs: nullableString(),
    imaging: nullableString(),
    pathology: nullableString(),
    management: nullableString(),
    fileIds: z.array(z.uuid()),
    poll: pollSchema.nullable(),
    discussion: z.strictObject({ communitySlug: z.string(), postId: z.uuid() }).nullable(),
    /** The case of the week now. */
    week: z.boolean(),
    /** Why it was returned or removed: for its author and reviewers. */
    reviewNote: nullableString(),
    mine: z.boolean(),
    /** The author may change it now (a draft, or returned). */
    canEdit: z.boolean(),
    /** The reader reviews cases of this subspecialty. */
    canReview: z.boolean(),
    /** Open reports, for reviewers. */
    reports: z.array(z.strictObject({ reason: z.string(), createdAt: z.iso.datetime() })),
    createdAt: z.iso.datetime(),
  }),
) {}

export class CasePollDto extends createZodDto(pollSchema) {}

export class CaseVoteDto extends createZodDto(z.strictObject({ optionId: z.uuid() })) {}

export class CaseReportInputDto extends createZodDto(
  z.strictObject({ reason: z.string().trim().min(1).max(1000) }),
) {}

export class CaseReviewInputDto extends createZodDto(
  z.strictObject({
    action: z.enum(REVIEW_ACTIONS),
    /** Required to return, take back or remove: the author is told. */
    note: z.string().trim().max(1000).optional(),
  }),
) {}

export class CaseQueueDto extends createZodDto(
  z.strictObject({
    items: z.array(
      caseSummary.extend({
        /** When it was sent for review, or first reported. */
        waitingSince: z.iso.datetime(),
        openReports: z.number().int(),
      }),
    ),
  }),
) {}

export class CaseHistoryDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        action: z.string(),
        fromStatus: z.enum(CASE_STATUSES).nullable(),
        toStatus: z.enum(CASE_STATUSES),
        actor: z.strictObject({ firstName: z.string(), lastName: z.string() }).nullable(),
        note: nullableString(),
        at: z.iso.datetime(),
      }),
    ),
  }),
) {}

export class CasePictureQueryDto extends createZodDto(
  z.strictObject({
    /** The author confirms the picture shows no name, number, date or face. */
    confirmed: z.literal('true'),
  }),
) {}
