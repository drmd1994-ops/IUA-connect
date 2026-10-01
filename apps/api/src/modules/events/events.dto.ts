import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { MAX_BODY_LENGTH, SLUG_PATTERN } from '../news';

const TIERS = ['PUBLIC', 'MEMBERS', 'TYPES'] as const;
const STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
const MODES = ['INTERNAL', 'EXTERNAL', 'NONE'] as const;
const locale = z.enum(['he', 'en']);
const httpUrl = z.url({ protocol: /^https?$/ }).max(500);
/** An instant with its offset. The web app converts Israel time before sending. */
const instant = z.iso.datetime({ offset: true });

const translationInput = z.strictObject({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(1000).optional(),
  /** Markdown; sanitised on save like news bodies. */
  description: z.string().max(MAX_BODY_LENGTH).default(''),
});

/** The whole editable event (create, and replace). At least one language. */
export class EventInputDto extends createZodDto(
  z
    .strictObject({
      slug: z.string().trim().max(120).regex(SLUG_PATTERN).optional(),
      categoryId: z.uuid().nullable().optional(),
      /** A draft may be saved without dates; publishing needs both. */
      startAt: instant.nullable().optional(),
      endAt: instant.nullable().optional(),
      locationName: z.string().trim().max(300).optional(),
      address: z.string().trim().max(500).optional(),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
      organizer: z.string().trim().max(300).optional(),
      imageFileId: z.uuid().nullable().optional(),
      registrationMode: z.enum(MODES).default('NONE'),
      registrationUrl: httpUrl.nullable().optional(),
      capacity: z.number().int().min(1).max(100_000).nullable().optional(),
      cmeAvailable: z.boolean().default(false),
      accessTier: z.enum(TIERS).default('PUBLIC'),
      /** The membership types allowed to see it, when accessTier is TYPES. */
      typeIds: z.array(z.uuid()).max(10).default([]),
      translations: z
        .strictObject({ he: translationInput.optional(), en: translationInput.optional() })
        .refine((t) => t.he || t.en, { message: 'At least one language' }),
    })
    .refine((body) => body.accessTier !== 'TYPES' || body.typeIds.length > 0, {
      message: 'Choose at least one membership type',
      path: ['typeIds'],
    })
    .refine((body) => ((body.lat ?? null) === null) === ((body.lng ?? null) === null), {
      message: 'Give both coordinates or neither',
      path: ['lng'],
    })
    .refine(
      (body) => !body.startAt || !body.endAt || Date.parse(body.endAt) > Date.parse(body.startAt),
      { message: 'The end must be after the start', path: ['endAt'] },
    ),
) {}

export class CancelEventDto extends createZodDto(
  z.strictObject({
    /** Shown on the event and emailed to the people who registered. */
    reason: z.string().trim().min(1).max(1000),
  }),
) {}

const translationView = z.strictObject({
  title: z.string(),
  summary: nullableString(),
  description: z.string(),
});

const imageView = z
  .strictObject({
    id: z.uuid(),
    originalName: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
  })
  .nullable();

const coordinates = {
  lat: z.number().nullable(),
  lng: z.number().nullable(),
};

export class AdminEventDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    slug: z.string(),
    status: z.enum(STATUSES),
    categoryId: z.uuid().nullable(),
    startAt: z.iso.datetime().nullable(),
    endAt: z.iso.datetime().nullable(),
    timezone: z.string(),
    locationName: nullableString(),
    address: nullableString(),
    ...coordinates,
    organizer: nullableString(),
    image: imageView,
    registrationMode: z.enum(MODES),
    registrationUrl: nullableString(),
    capacity: z.number().int().nullable(),
    cmeAvailable: z.boolean(),
    accessTier: z.enum(TIERS),
    typeIds: z.array(z.uuid()),
    translations: z.strictObject({
      he: translationView.optional(),
      en: translationView.optional(),
    }),
    sourceUrl: nullableString(),
    publishedAt: z.iso.datetime().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
    cancelReason: nullableString(),
    /** Send it back as If-Match: "<version>" when saving. */
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
) {}

export class AdminEventListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(STATUSES).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

export class AdminEventListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        slug: z.string(),
        status: z.enum(STATUSES),
        titleHe: nullableString(),
        titleEn: nullableString(),
        startAt: z.iso.datetime().nullable(),
        endAt: z.iso.datetime().nullable(),
        accessTier: z.enum(TIERS),
        registrationMode: z.enum(MODES),
        updatedAt: z.iso.datetime(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

// --- Categories -----------------------------------------------------------------------------

export class EventCategoryDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    key: z.string(),
    nameHe: z.string(),
    nameEn: z.string(),
    sortOrder: z.number().int(),
    active: z.boolean(),
  }),
) {}

export class EventCategoryListDto extends createZodDto(
  z.strictObject({ items: z.array(EventCategoryDto.schema) }),
) {}

export class CreateEventCategoryDto extends createZodDto(
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

export class UpdateEventCategoryDto extends createZodDto(
  z
    .strictObject({
      nameHe: z.string().trim().min(1).max(200).optional(),
      nameEn: z.string().trim().min(1).max(200).optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(),
      active: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' }),
) {}

// --- Public ---------------------------------------------------------------------------------

export class PublicEventQueryDto extends createZodDto(
  z.strictObject({
    /** The reader's language; events without it fall back to Hebrew. */
    locale: locale.default('he'),
    /** Upcoming events have not ended yet (soonest first); past ones have (latest first). */
    when: z.enum(['upcoming', 'past']).default('upcoming'),
    category: z.string().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  }),
) {}

export class PublicEventItemQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

const publicSummary = z.strictObject({
  slug: z.string(),
  title: z.string(),
  summary: nullableString(),
  category: z.strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() }).nullable(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  timezone: z.string(),
  locationName: nullableString(),
  imageFileId: z.uuid().nullable(),
  cancelled: z.boolean(),
  registrationMode: z.enum(MODES),
  cmeAvailable: z.boolean(),
  accessTier: z.enum(TIERS),
  /** The language of the text returned. */
  locale,
  /** True when the requested language was missing and another is shown instead. */
  fallback: z.boolean(),
});

export class PublicEventListDto extends createZodDto(
  z.strictObject({
    items: z.array(publicSummary),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class PublicEventDto extends createZodDto(
  publicSummary.extend({
    /** Sanitised Markdown. */
    description: z.string(),
    address: nullableString(),
    ...coordinates,
    organizer: nullableString(),
    registrationUrl: nullableString(),
    capacity: z.number().int().nullable(),
    /** In-app registration: free places (null means unlimited), and whether it is open now. */
    placesLeft: z.number().int().nullable(),
    registrationOpen: z.boolean(),
    cancelReason: nullableString(),
    /** Imported events: the page of the source site. */
    sourceUrl: nullableString(),
  }),
) {}
