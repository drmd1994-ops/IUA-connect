import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { NEWS_ACTIONS } from './news-workflow';
import { MAX_BODY_LENGTH } from './markdown';
import { SLUG_PATTERN } from './slug';

const TIERS = ['PUBLIC', 'MEMBERS', 'TYPES'] as const;
const STATUSES = ['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;

const translationInput = z.strictObject({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(1000).optional(),
  body: z.string().max(MAX_BODY_LENGTH).default(''),
  author: z.string().trim().max(200).optional(),
});

const reference = z.strictObject({
  title: z.string().trim().min(1).max(300),
  url: z.url({ protocol: /^https?$/ }).max(500),
});

/**
 * The whole editable item (create, and replace while it's a draft). At least one language; the
 * Hebrew text is required before the item can be submitted (it's the fallback, ADR 0005).
 */
export class NewsInputDto extends createZodDto(
  z
    .strictObject({
      slug: z.string().trim().max(120).regex(SLUG_PATTERN).optional(),
      categoryId: z.uuid().nullable().optional(),
      accessTier: z.enum(TIERS).default('PUBLIC'),
      /** The membership types allowed to read it, when accessTier is TYPES. */
      typeIds: z.array(z.uuid()).max(10).default([]),
      featuredImageFileId: z.uuid().nullable().optional(),
      attachmentFileIds: z.array(z.uuid()).max(20).default([]),
      tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
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

const fileView = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['IMAGE', 'DOCUMENT']),
  mimeType: z.string(),
  originalName: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});

const translationView = z.strictObject({
  title: z.string(),
  summary: nullableString(),
  body: z.string(),
  author: nullableString(),
});

export class AdminNewsDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    slug: nullableString(),
    status: z.enum(STATUSES),
    categoryId: z.uuid().nullable(),
    accessTier: z.enum(TIERS),
    typeIds: z.array(z.uuid()),
    featuredImage: fileView.nullable(),
    attachments: z.array(fileView),
    tags: z.array(z.string()),
    references: z.array(reference),
    translations: z.strictObject({
      he: translationView.optional(),
      en: translationView.optional(),
    }),
    publishAt: z.iso.datetime().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    sourceUrl: nullableString(),
    sourcePublishedAt: z.iso.datetime().nullable(),
    /** Set on a revision: the live item it will replace when published. */
    revisionOfId: z.uuid().nullable(),
    /** Set on a live item with a revision in progress. */
    revisionId: z.uuid().nullable(),
    authorUserId: z.uuid().nullable(),
    submittedBy: z.uuid().nullable(),
    /** Send it back as If-Match: "<version>" when saving. */
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
) {}

export class AdminNewsListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(STATUSES).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

export class AdminNewsListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        slug: nullableString(),
        status: z.enum(STATUSES),
        titleHe: nullableString(),
        titleEn: nullableString(),
        categoryId: z.uuid().nullable(),
        accessTier: z.enum(TIERS),
        revisionOfId: z.uuid().nullable(),
        revisionId: z.uuid().nullable(),
        submittedBy: z.uuid().nullable(),
        publishAt: z.iso.datetime().nullable(),
        publishedAt: z.iso.datetime().nullable(),
        updatedAt: z.iso.datetime(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class NewsTransitionDto extends createZodDto(
  z.strictObject({
    action: z.enum(NEWS_ACTIONS as [string, ...string[]]),
    /** Required to send back; shown to the editor. */
    comment: z.string().trim().max(1000).optional(),
    /** For SCHEDULE: when it goes live (ISO date-time; enter Israel time, sent as UTC). */
    publishAt: z.iso.datetime({ offset: true }).optional(),
  }),
) {}

export class NewsHistoryDto extends createZodDto(
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

// --- Categories -----------------------------------------------------------------------------

export class NewsCategoryDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    key: z.string(),
    nameHe: z.string(),
    nameEn: z.string(),
    sortOrder: z.number().int(),
    active: z.boolean(),
  }),
) {}

export class NewsCategoryListDto extends createZodDto(
  z.strictObject({ items: z.array(NewsCategoryDto.schema) }),
) {}

export class CreateNewsCategoryDto extends createZodDto(
  z.strictObject({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{2,64}$/),
    nameHe: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  }),
) {}

export class UpdateNewsCategoryDto extends createZodDto(
  z
    .strictObject({
      nameHe: z.string().trim().min(1).max(200).optional(),
      nameEn: z.string().trim().min(1).max(200).optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(),
      active: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' }),
) {}
