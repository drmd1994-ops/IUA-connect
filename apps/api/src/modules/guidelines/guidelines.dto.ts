import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

const TIERS = ['PUBLIC', 'MEMBERS', 'TYPES'] as const;
const STATUSES = ['CURRENT', 'SUPERSEDED', 'WITHDRAWN'] as const;
const locale = z.enum(['he', 'en']);
const httpUrl = z.url({ protocol: /^https?$/ }).max(500);

const translationInput = z.strictObject({
  title: z.string().trim().min(1).max(300),
  /** Written by the IUA (plain text). Never the source organisation's own text. */
  summary: z.string().trim().max(4000).optional(),
});

const versionInput = z.strictObject({
  version: z.string().trim().min(1).max(60),
  publishedOn: z.iso.date(),
  /** This edition's own page, when it differs from the official link. */
  url: httpUrl.optional(),
  licenseNote: z.string().trim().max(500).optional(),
});

const metadata = {
  sourceOrg: z.string().trim().min(1).max(200),
  officialUrl: httpUrl,
  /** Free text: organisations grade evidence on different scales. */
  evidenceLevel: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).default('CURRENT'),
  subspecialtyId: z.uuid().nullable().optional(),
  accessTier: z.enum(TIERS).default('PUBLIC'),
  /** The membership types allowed to read it, when accessTier is TYPES. */
  typeIds: z.array(z.uuid()).max(10).default([]),
  translations: z
    .strictObject({ he: translationInput.optional(), en: translationInput.optional() })
    .refine((t) => t.he || t.en, { message: 'At least one language' }),
};

const needsTypes = (body: { accessTier: string; typeIds: string[] }) =>
  body.accessTier !== 'TYPES' || body.typeIds.length > 0;
const typesMessage = { message: 'Choose at least one membership type', path: ['typeIds'] };

/** A new guideline with its first version (every guideline has a version and a date). */
export class CreateGuidelineDto extends createZodDto(
  z.strictObject({ ...metadata, version: versionInput }).refine(needsTypes, typesMessage),
) {}

/** Replaces the metadata and texts. Versions have their own routes. */
export class UpdateGuidelineDto extends createZodDto(
  z.strictObject(metadata).refine(needsTypes, typesMessage),
) {}

export class GuidelineVersionInputDto extends createZodDto(versionInput) {}

const versionView = z.strictObject({
  id: z.uuid(),
  version: z.string(),
  publishedOn: z.iso.date(),
  url: nullableString(),
  licenseNote: nullableString(),
});

const translationView = z.strictObject({ title: z.string(), summary: nullableString() });

export class AdminGuidelineDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    sourceOrg: z.string(),
    officialUrl: z.string(),
    evidenceLevel: nullableString(),
    status: z.enum(STATUSES),
    subspecialtyId: z.uuid().nullable(),
    accessTier: z.enum(TIERS),
    typeIds: z.array(z.uuid()),
    translations: z.strictObject({
      he: translationView.optional(),
      en: translationView.optional(),
    }),
    /** Newest first. */
    versions: z.array(versionView),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
) {}

export class AdminGuidelineListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(STATUSES).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

export class AdminGuidelineListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        sourceOrg: z.string(),
        titleHe: nullableString(),
        titleEn: nullableString(),
        status: z.enum(STATUSES),
        accessTier: z.enum(TIERS),
        version: nullableString(),
        publishedOn: z.iso.date().nullable(),
        updatedAt: z.iso.datetime(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

// --- Public ---------------------------------------------------------------------------------

export class PublicGuidelineQueryDto extends createZodDto(
  z.strictObject({
    /** The reader's language; guidelines without it fall back to Hebrew, then to what exists. */
    locale: locale.default('he'),
    /** A subspecialty key. */
    subspecialty: z.string().max(64).optional(),
    status: z.enum(STATUSES).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
) {}

export class PublicGuidelineItemQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

const publicSummary = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  summary: nullableString(),
  sourceOrg: z.string(),
  officialUrl: z.string(),
  evidenceLevel: nullableString(),
  status: z.enum(STATUSES),
  subspecialty: z
    .strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() })
    .nullable(),
  /** The newest version and its date. */
  version: nullableString(),
  publishedOn: z.iso.date().nullable(),
  accessTier: z.enum(TIERS),
  /** The language of the text returned. */
  locale,
  /** True when the requested language was missing and another is shown instead. */
  fallback: z.boolean(),
});

export class PublicGuidelineListDto extends createZodDto(
  z.strictObject({
    items: z.array(publicSummary),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class PublicGuidelineDto extends createZodDto(
  publicSummary.extend({
    /** Every version, newest first. */
    versions: z.array(versionView),
  }),
) {}
