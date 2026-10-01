import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableNumber, nullableString } from '../../common/dto/nullable-string';
import { MAX_BODY_LENGTH, SLUG_PATTERN } from '../news';
import { EDUCATION_ACTIONS } from './education-workflow';

export const TIERS = ['PUBLIC', 'MEMBERS', 'TYPES'] as const;
export const STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export const TYPES = [
  'VIDEO',
  'ARTICLE',
  'PDF',
  'PRESENTATION',
  'PODCAST',
  'WEBINAR',
  'SURGICAL_VIDEO',
  'CASE',
  'COURSE',
] as const;
export const LEVELS = ['STUDENT', 'RESIDENT', 'FELLOW', 'SPECIALIST', 'EXPERT'] as const;
const VIDEO_STATUSES = ['NONE', 'EXTERNAL', 'PENDING_PROVIDER'] as const;
const locale = z.enum(['he', 'en']);
const httpUrl = z.url({ protocol: /^https?$/ }).max(500);

const translationInput = z.strictObject({
  title: z.string().trim().min(1).max(300),
  /** Markdown: the description, or the whole text of an article or case. Sanitised on save. */
  description: z.string().max(MAX_BODY_LENGTH).default(''),
  /** The byline as shown. */
  author: z.string().trim().max(200).optional(),
});

const reference = z.strictObject({
  title: z.string().trim().min(1).max(300),
  url: httpUrl,
});

/** The whole editable item (create, and replace). The type is fixed once the item exists. */
export class EducationInputDto extends createZodDto(
  z
    .strictObject({
      type: z.enum(TYPES),
      slug: z.string().trim().max(120).regex(SLUG_PATTERN).optional(),
      /** Leave out for all levels. */
      level: z.enum(LEVELS).nullable().optional(),
      subspecialtyId: z.uuid().nullable().optional(),
      durationMinutes: z.number().int().min(1).max(100_000).nullable().optional(),
      /** Shown only; CME tracking is Phase 2. */
      cmePoints: z.number().min(0).max(999.99).multipleOf(0.01).nullable().optional(),
      /** Videos, webinars and podcasts: where the recording is hosted. */
      externalUrl: httpUrl.nullable().optional(),
      /** A video that has no link yet. */
      videoPending: z.boolean().default(false),
      accessTier: z.enum(TIERS).default('PUBLIC'),
      /** The membership types allowed to read it, when accessTier is TYPES. */
      typeIds: z.array(z.uuid()).max(10).default([]),
      coverFileId: z.uuid().nullable().optional(),
      /** Documents and presentations: the files; other types: optional attachments. */
      fileIds: z.array(z.uuid()).max(20).default([]),
      references: z.array(reference).max(20).default([]),
      translations: z
        .strictObject({ he: translationInput.optional(), en: translationInput.optional() })
        .refine((t) => t.he || t.en, { message: 'At least one language' }),
    })
    .refine((body) => body.accessTier !== 'TYPES' || body.typeIds.length > 0, {
      message: 'Choose at least one membership type',
      path: ['typeIds'],
    }),
) {}

export class EducationTransitionDto extends createZodDto(
  z.strictObject({
    action: z.enum(EDUCATION_ACTIONS as [string, ...string[]]),
    /** Required to send back; shown to the editor. */
    comment: z.string().trim().max(1000).optional(),
  }),
) {}

const fileView = z.strictObject({
  id: z.uuid(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});

const translationView = z.strictObject({
  title: z.string(),
  description: z.string(),
  author: nullableString(),
});

export class AdminEducationDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    slug: z.string(),
    type: z.enum(TYPES),
    status: z.enum(STATUSES),
    level: z.enum(LEVELS).nullable(),
    subspecialtyId: z.uuid().nullable(),
    durationMinutes: z.number().int().nullable(),
    cmePoints: nullableNumber(),
    externalUrl: nullableString(),
    videoStatus: z.enum(VIDEO_STATUSES),
    accessTier: z.enum(TIERS),
    typeIds: z.array(z.uuid()),
    cover: fileView.nullable(),
    files: z.array(fileView),
    references: z.array(reference),
    translations: z.strictObject({
      he: translationView.optional(),
      en: translationView.optional(),
    }),
    /** For a course: its lessons, in order. Empty for other types. */
    lessonIds: z.array(z.uuid()),
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

export class AdminEducationListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(STATUSES).optional(),
    type: z.enum(TYPES).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

export class AdminEducationListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        slug: z.string(),
        type: z.enum(TYPES),
        status: z.enum(STATUSES),
        titleHe: nullableString(),
        titleEn: nullableString(),
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

export class EducationHistoryDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        action: z.string(),
        fromStatus: z.enum(STATUSES).nullable(),
        toStatus: z.enum(STATUSES),
        actorUserId: z.uuid().nullable(),
        comment: nullableString(),
        at: z.iso.datetime(),
      }),
    ),
  }),
) {}

/** The lessons of a course, in order (replaces the list). */
export class CourseLessonsDto extends createZodDto(
  z.strictObject({ lessonIds: z.array(z.uuid()).max(100) }),
) {}

// --- Public ---------------------------------------------------------------------------------

export class PublicEducationQueryDto extends createZodDto(
  z.strictObject({
    /** The reader's language; items without it fall back to Hebrew. */
    locale: locale.default('he'),
    type: z.enum(TYPES).optional(),
    level: z.enum(LEVELS).optional(),
    /** A subspecialty key. */
    subspecialty: z.string().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  }),
) {}

export class PublicEducationItemQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

const publicSummary = z.strictObject({
  slug: z.string(),
  type: z.enum(TYPES),
  title: z.string(),
  author: nullableString(),
  level: z.enum(LEVELS).nullable(),
  subspecialty: z
    .strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() })
    .nullable(),
  durationMinutes: z.number().int().nullable(),
  cmePoints: nullableNumber(),
  coverFileId: z.uuid().nullable(),
  publishedAt: z.iso.datetime(),
  accessTier: z.enum(TIERS),
  /** The language of the text returned. */
  locale,
  /** True when the requested language was missing and another is shown instead. */
  fallback: z.boolean(),
});

export class PublicEducationListDto extends createZodDto(
  z.strictObject({
    items: z.array(publicSummary),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class PublicEducationDto extends createZodDto(
  publicSummary.extend({
    /** Sanitised Markdown. */
    description: z.string(),
    archived: z.boolean(),
    externalUrl: nullableString(),
    videoStatus: z.enum(VIDEO_STATUSES),
    files: z.array(fileView),
    references: z.array(z.strictObject({ title: z.string(), url: z.string() })),
    /**
     * For a course: its published lessons, in order. A lesson the reader may not see is listed
     * as locked, without its details, so the numbering stays whole.
     */
    lessons: z.array(
      z.strictObject({
        position: z.number().int(),
        locked: z.boolean(),
        slug: nullableString(),
        type: z.enum(TYPES).nullable(),
        title: nullableString(),
        durationMinutes: z.number().int().nullable(),
      }),
    ),
  }),
) {}
