import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { JOURNAL_CLUB_ACTIONS, POLL_ANSWERS } from './journal-club-workflow';

const STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const nameRef = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });
const subspecialtyRef = nameRef.extend({ key: z.string() });

/** A named author as members see them: name, student or resident mark, hospital. */
const authorSchema = z.strictObject({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  mark: z.enum(['STUDENT', 'RESIDENT']).nullable(),
  hospital: nameRef.nullable(),
});

const articleFields = {
  articleTitle: z.string(),
  articleAuthors: z.string(),
  journal: nullableString(),
  year: z.number().int().nullable(),
  doi: nullableString(),
  pmid: nullableString(),
};

const pollSchema = z.strictObject({
  /** Answers are taken while the entry is published; an archived entry's poll is closed. */
  open: z.boolean(),
  /** The reader's own answer. */
  mine: z.enum(POLL_ANSWERS).nullable(),
  /** Shown after answering, or once archived; counts only, never who. */
  totals: z
    .strictObject({
      YES: z.number().int(),
      PERHAPS: z.number().int(),
      NO: z.number().int(),
      total: z.number().int(),
    })
    .nullable(),
});

// --- Members ----------------------------------------------------------------------------------

export class JournalClubListQueryDto extends createZodDto(
  z.strictObject({
    /** A subspecialty key. */
    subspecialty: z.string().trim().max(64).optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  }),
) {}

const entrySummary = z.strictObject({
  id: z.uuid(),
  /** "YYYY-MM". */
  month: z.string(),
  locale: z.enum(['he', 'en']),
  ...articleFields,
  subspecialty: subspecialtyRef,
  excerpt: z.string(),
  archived: z.boolean(),
});

export class JournalClubListDto extends createZodDto(
  z.strictObject({
    items: z.array(entrySummary),
    /** The newest published entry, shown first; null when there is none. */
    current: entrySummary.nullable(),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class JournalClubEntryDto extends createZodDto(
  entrySummary.extend({
    summary: z.string(),
    summaryAuthor: authorSchema.nullable(),
    commentary: nullableString(),
    commentaryAuthor: authorSchema.nullable(),
    keyPoints: z.array(z.string()),
    publishedAt: z.iso.datetime().nullable(),
    poll: pollSchema,
    /** Its discussion post in the subspecialty's community. */
    discussion: z.strictObject({ communitySlug: z.string(), postId: z.uuid() }).nullable(),
  }),
) {}

export class JournalClubVoteDto extends createZodDto(
  z.strictObject({ answer: z.enum(POLL_ANSWERS) }),
) {}

export class JournalClubPollDto extends createZodDto(pollSchema) {}

// --- Editors ----------------------------------------------------------------------------------

export class JournalClubInputDto extends createZodDto(
  z
    .strictObject({
      subspecialtyId: z.uuid(),
      /** "YYYY-MM". */
      month: z.string().regex(MONTH),
      locale: z.enum(['he', 'en']),
      articleTitle: z.string().trim().min(1).max(500),
      articleAuthors: z.string().trim().max(2000).default(''),
      journal: z.string().trim().max(300).nullable().default(null),
      year: z.number().int().min(1900).max(2100).nullable().default(null),
      doi: z.string().trim().max(200).nullable().default(null),
      pmid: z
        .string()
        .trim()
        .regex(/^\d{1,9}$/)
        .nullable()
        .default(null),
      summary: z.string().trim().min(1).max(5000),
      /** The member who wrote the summary, by their email address. */
      summaryAuthorEmail: z.email().max(254),
      commentary: z.string().trim().max(5000).nullable().default(null),
      /** The expert who wrote the commentary, by their email address. */
      commentaryAuthorEmail: z.email().max(254).nullable().default(null),
      keyPoints: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
    })
    .refine((body) => !body.commentary || body.commentaryAuthorEmail, {
      message: 'A commentary names its author',
      path: ['commentaryAuthorEmail'],
    }),
) {}

const adminPerson = z.strictObject({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
});

const adminEntry = z.strictObject({
  id: z.uuid(),
  subspecialty: subspecialtyRef,
  month: z.string(),
  locale: z.enum(['he', 'en']),
  ...articleFields,
  summary: z.string(),
  summaryAuthor: adminPerson.nullable(),
  commentary: nullableString(),
  commentaryAuthor: adminPerson.nullable(),
  keyPoints: z.array(z.string()),
  status: z.enum(STATUSES),
  /** The reader submitted it: someone else publishes it. */
  ownSubmission: z.boolean(),
  publishedAt: z.iso.datetime().nullable(),
  postId: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
});

export class JournalClubAdminEntryDto extends createZodDto(adminEntry) {}

export class JournalClubAdminListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(STATUSES).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  }),
) {}

export class JournalClubAdminListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      adminEntry.pick({
        id: true,
        subspecialty: true,
        month: true,
        articleTitle: true,
        status: true,
        updatedAt: true,
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class JournalClubScopeDto extends createZodDto(
  z.strictObject({
    /** Every subspecialty, or only these. */
    all: z.boolean(),
    subspecialtyIds: z.array(z.uuid()),
  }),
) {}

export class JournalClubTransitionDto extends createZodDto(
  z.strictObject({
    action: z.enum(JOURNAL_CLUB_ACTIONS as [string, ...string[]]),
    comment: z.string().trim().max(1000).optional(),
  }),
) {}

export class JournalClubHistoryDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        action: z.string(),
        fromStatus: z.enum(STATUSES).nullable(),
        toStatus: z.enum(STATUSES),
        actor: z.strictObject({ firstName: z.string(), lastName: z.string() }).nullable(),
        comment: nullableString(),
        at: z.iso.datetime(),
      }),
    ),
  }),
) {}

export class JournalClubLookupDto extends createZodDto(
  z
    .strictObject({
      pmid: z.string().trim().max(20).optional(),
      doi: z.string().trim().max(300).optional(),
    })
    .refine((body) => Boolean(body.pmid) !== Boolean(body.doi), {
      message: 'A PubMed ID or a DOI',
    }),
) {}

export class JournalClubArticleDto extends createZodDto(
  z.strictObject({
    articleTitle: z.string(),
    articleAuthors: z.string(),
    journal: nullableString(),
    year: z.number().int().nullable(),
    doi: nullableString(),
    pmid: nullableString(),
  }),
) {}
