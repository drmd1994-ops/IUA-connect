import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

const locale = z.enum(['he', 'en']);

export class PublicNewsQueryDto extends createZodDto(
  z.strictObject({
    /** The reader's language; items without it fall back to Hebrew. */
    locale: locale.default('he'),
    category: z.string().max(64).optional(),
    tag: z.string().max(60).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  }),
) {}

export class PublicNewsItemQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

const category = z
  .strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() })
  .nullable();

const summaryShape = z.strictObject({
  slug: z.string(),
  title: z.string(),
  summary: nullableString(),
  category,
  tags: z.array(z.string()),
  /** The original date for imported items, otherwise when it was published. */
  date: z.iso.datetime(),
  featuredImageFileId: z.uuid().nullable(),
  accessTier: z.enum(['PUBLIC', 'MEMBERS', 'TYPES']),
  /** Imported items: where the original was published. */
  sourceUrl: nullableString(),
  /** The language of the text returned. */
  locale,
  /** True when the requested language was missing and Hebrew is shown instead. */
  fallback: z.boolean(),
});

export class PublicNewsListDto extends createZodDto(
  z.strictObject({
    items: z.array(summaryShape),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class PublicNewsDto extends createZodDto(
  summaryShape.extend({
    /** Sanitised Markdown. */
    body: z.string(),
    author: nullableString(),
    archived: z.boolean(),
    attachments: z.array(
      z.strictObject({
        id: z.uuid(),
        originalName: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number().int(),
      }),
    ),
    references: z.array(z.strictObject({ title: z.string(), url: z.string() })),
  }),
) {}
