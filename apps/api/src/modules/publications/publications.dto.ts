import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

const SOURCES = ['MANUAL', 'PUBMED', 'ORCID'] as const;

const draft = {
  title: z.string().trim().min(1).max(500),
  authors: z.string().trim().max(2000).default(''),
  journal: z.string().trim().max(300).nullable().default(null),
  year: z.number().int().min(1900).max(2100).nullable().default(null),
  doi: z.string().trim().max(200).nullable().default(null),
  pmid: z
    .string()
    .trim()
    .regex(/^\d{1,9}$/)
    .nullable()
    .default(null),
  url: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .nullable()
    .default(null),
};

export class PublicationInputDto extends createZodDto(
  z.strictObject({
    ...draft,
    topics: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    /** Where the details came from: typed in, or filled from PubMed or ORCID. */
    source: z.enum(SOURCES).default('MANUAL'),
    hidden: z.boolean().default(false),
  }),
) {}

const publicationSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  authors: z.string(),
  journal: nullableString(),
  year: z.number().int().nullable(),
  doi: nullableString(),
  pmid: nullableString(),
  url: nullableString(),
  topics: z.array(z.string()),
  source: z.enum(SOURCES),
  hidden: z.boolean(),
});

export class PublicationDto extends createZodDto(publicationSchema) {}

export class PublicationListDto extends createZodDto(
  z.strictObject({ items: z.array(publicationSchema) }),
) {}

export class PublicationOrderDto extends createZodDto(
  z.strictObject({ ids: z.array(z.uuid()).max(500) }),
) {}

export class PublicationLookupDto extends createZodDto(
  z
    .strictObject({
      pmid: z.string().trim().max(20).optional(),
      doi: z.string().trim().max(300).optional(),
    })
    .refine((body) => Boolean(body.pmid) !== Boolean(body.doi), {
      message: 'A PubMed ID or a DOI',
    }),
) {}

const draftSchema = z.strictObject({
  title: z.string(),
  authors: z.string(),
  journal: nullableString(),
  year: z.number().int().nullable(),
  doi: nullableString(),
  pmid: nullableString(),
  url: nullableString(),
  /** Already among the person's publications (by DOI or PubMed ID). */
  saved: z.boolean(),
});

export class PublicationDraftListDto extends createZodDto(
  z.strictObject({ source: z.enum(['PUBMED', 'ORCID']), items: z.array(draftSchema) }),
) {}
