import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { CONTENT_SEARCH_TYPES } from './search-provider';

export const SEARCH_TYPES = [...CONTENT_SEARCH_TYPES, 'members'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
/** Results per type on the overview, and per page when one type is opened. */
export const SEARCH_PREVIEW_SIZE = 5;
export const SEARCH_PAGE_SIZE = 10;

const type = z.enum(SEARCH_TYPES);

export class SearchQueryDto extends createZodDto(
  z.strictObject({
    q: z.string().trim().min(2).max(100),
    /** Comma-separated; all types when left out. */
    types: z
      .string()
      .transform((value) => value.split(',').map((part) => part.trim()))
      .pipe(z.array(type).min(1).max(SEARCH_TYPES.length))
      .optional(),
    locale: z.enum(['he', 'en']).default('he'),
    /** With exactly one type: its further pages ("show more"). */
    page: z.coerce.number().int().min(1).max(100).default(1),
  }),
) {}

const hit = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  excerpt: nullableString(),
  /** A path inside the site, without the language prefix. */
  link: z.string(),
  /** The language of the title and excerpt. */
  locale: z.string(),
});

export class SearchResultsDto extends createZodDto(
  z.strictObject({
    /** One group per type asked for, in a fixed order; a type with nothing is left out. */
    groups: z.array(
      z.strictObject({
        type,
        total: z.number().int(),
        items: z.array(hit),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}
