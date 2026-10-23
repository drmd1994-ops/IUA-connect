import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { MAX_BODY_LENGTH } from '../news';
import { organisationRefSchema } from '../organisations';
import { POSITION_ACTIONS } from './positions-workflow';

export const POSITION_KINDS = ['JOB', 'FELLOWSHIP', 'RESEARCH'] as const;
export const POSITION_AUDIENCES = ['ANYONE', 'SPECIALISTS', 'RESIDENTS', 'STUDENTS'] as const;
const STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY = /^[A-Z]{2}$/;

const translationInput = z.strictObject({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(MAX_BODY_LENGTH).default(''),
});

/**
 * The whole editable position (create, and replace while it's a draft). The place is a
 * hospital from the list (with a department, or none) or an institution named as text with its
 * city; there must be a way to apply, a link or an email address.
 */
export class PositionInputDto extends createZodDto(
  z
    .strictObject({
      /**
       * Whose position it is: an organisation, or null for the platform's own (also a department
       * director's). Said when it is created and never changed; it may be left out when the
       * writer can only mean one.
       */
      organisationId: z.uuid().nullable().optional(),
      kind: z.enum(POSITION_KINDS),
      hospitalId: z.uuid().nullable().default(null),
      departmentId: z.uuid().nullable().default(null),
      institutionName: z.string().trim().min(1).max(200).nullable().default(null),
      city: z.string().trim().min(1).max(100).nullable().default(null),
      country: z.string().trim().toUpperCase().regex(COUNTRY).default('IL'),
      audience: z.enum(POSITION_AUDIENCES).default('ANYONE'),
      subspecialtyIds: z.array(z.uuid()).max(20).default([]),
      applyUrl: z
        .url({ protocol: /^https?$/ })
        .max(500)
        .nullable()
        .default(null),
      applyEmail: z.email().max(254).nullable().default(null),
      /** The last day to apply ("YYYY-MM-DD", in Israel). */
      closesOn: z.string().regex(DATE),
      translations: z
        .strictObject({ he: translationInput.optional(), en: translationInput.optional() })
        .refine((t) => t.he || t.en, { message: 'At least one language' }),
    })
    .refine((body) => (body.hospitalId === null) !== (body.institutionName === null), {
      message: 'A hospital from the list, or an institution by name',
      path: ['institutionName'],
    })
    .refine((body) => body.departmentId === null || body.hospitalId !== null, {
      message: 'A department needs its hospital',
      path: ['departmentId'],
    })
    .refine((body) => body.institutionName === null || body.city !== null, {
      message: 'Say the city',
      path: ['city'],
    })
    .refine((body) => body.applyUrl !== null || body.applyEmail !== null, {
      message: 'A link or an email address to apply',
      path: ['applyUrl'],
    }),
) {}

const nameRef = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });

const placeSchema = z.strictObject({
  hospital: z
    .strictObject({
      id: z.uuid(),
      nameHe: z.string(),
      nameEn: z.string(),
      cityHe: z.string(),
      cityEn: z.string(),
    })
    .nullable(),
  department: nameRef.nullable(),
  institutionName: nullableString(),
  city: nullableString(),
  country: z.string(),
});

const subspecialtyRef = z.strictObject({
  id: z.uuid(),
  key: z.string(),
  nameHe: z.string(),
  nameEn: z.string(),
});

const translationView = z.strictObject({ title: z.string(), body: z.string() });
const translationsView = z.strictObject({
  he: translationView.optional(),
  en: translationView.optional(),
});

const commonFields = {
  id: z.uuid(),
  kind: z.enum(POSITION_KINDS),
  /** Who posted it: an organisation, or null for the platform. */
  organisation: organisationRefSchema.nullable(),
  place: placeSchema,
  audience: z.enum(POSITION_AUDIENCES),
  subspecialties: z.array(subspecialtyRef),
  closesOn: z.string(),
};

// --- Reading ------------------------------------------------------------------------------------

export class PositionSummaryDto extends createZodDto(
  z.strictObject({
    ...commonFields,
    titleHe: nullableString(),
    titleEn: nullableString(),
    publishedAt: z.iso.datetime().nullable(),
    /** Kept by the reader (false for visitors). */
    saved: z.boolean(),
  }),
) {}

export class PositionDto extends createZodDto(
  z.strictObject({
    ...commonFields,
    translations: translationsView,
    applyUrl: nullableString(),
    applyEmail: nullableString(),
    publishedAt: z.iso.datetime().nullable(),
    /** Past its closing date: still readable by its address, no longer listed. */
    closed: z.boolean(),
    saved: z.boolean(),
  }),
) {}

export class PositionListQueryDto extends createZodDto(
  z.strictObject({
    kind: z.enum(POSITION_KINDS).optional(),
    /** A subspecialty key. */
    subspecialty: z.string().trim().max(64).optional(),
    hospital: z.uuid().optional(),
    country: z.string().trim().toUpperCase().regex(COUNTRY).optional(),
    audience: z.enum(POSITION_AUDIENCES).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}

export class PositionListDto extends createZodDto(
  z.strictObject({
    items: z.array(PositionSummaryDto.schema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    /** The countries that have open positions, for the search. */
    countries: z.array(z.string()),
  }),
) {}

export class SavedPositionListDto extends createZodDto(
  z.strictObject({ items: z.array(PositionSummaryDto.schema) }),
) {}

// --- Staff --------------------------------------------------------------------------------------

export class AdminPositionDto extends createZodDto(
  z.strictObject({
    ...commonFields,
    status: z.enum(STATUSES),
    translations: translationsView,
    applyUrl: nullableString(),
    applyEmail: nullableString(),
    authorUserId: z.uuid().nullable(),
    submittedBy: z.uuid().nullable(),
    reviewedBy: z.uuid().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    /** What the reader may do with it. */
    canWrite: z.boolean(),
    canReview: z.boolean(),
    /** Send it back as If-Match: "<version>" when saving. */
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
) {}

export class AdminPositionListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(STATUSES).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

export class AdminPositionListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        ...commonFields,
        status: z.enum(STATUSES),
        titleHe: nullableString(),
        titleEn: nullableString(),
        submittedBy: z.uuid().nullable(),
        updatedAt: z.iso.datetime(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

/** Where the reader may post positions, for the form. */
export class PositionScopeDto extends createZodDto(
  z.strictObject({
    /** The platform's own positions, at any place. */
    platform: z.boolean(),
    organisations: z.array(organisationRefSchema),
    /** The departments the reader directs: positions for them only. */
    departments: z.array(
      z.strictObject({
        id: z.uuid(),
        nameHe: z.string(),
        nameEn: z.string(),
        hospital: nameRef,
      }),
    ),
    /** Reviews positions somewhere. */
    review: z.boolean(),
  }),
) {}

export class PositionTransitionDto extends createZodDto(
  z.strictObject({
    action: z.enum(POSITION_ACTIONS as [string, ...string[]]),
    /** Required to send back; shown to the writer. */
    comment: z.string().trim().max(1000).optional(),
  }),
) {}

export class PositionHistoryDto extends createZodDto(
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
