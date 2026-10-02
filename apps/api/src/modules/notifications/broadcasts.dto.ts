import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableNumber, nullableString } from '../../common/dto/nullable-string';

export const BROADCAST_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'SENT', 'REJECTED'] as const;
const status = z.enum(BROADCAST_STATUSES);
const locale = z.enum(['he', 'en']);

const text = z.strictObject({
  title: z.string().trim().min(1).max(200),
  /** Plain text. Blank lines separate paragraphs. */
  body: z.string().trim().max(5000).default(''),
});

const audience = z.strictObject({
  /** True: every active member. False: the membership types listed. */
  all: z.boolean(),
  typeIds: z.array(z.uuid()).max(20).default([]),
});

/** The whole message (create, and replace). A draft may be incomplete. */
export class BroadcastInputDto extends createZodDto(
  z.strictObject({
    audience,
    translations: z
      .strictObject({ he: text.optional(), en: text.optional() })
      .refine((value) => value.he || value.en, { message: 'At least one language is required' }),
  }),
) {}

export class BroadcastRejectDto extends createZodDto(
  z.strictObject({ reason: z.string().trim().min(1).max(1000) }),
) {}

export class BroadcastListQueryDto extends createZodDto(
  z.strictObject({
    status: status.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

const person = z.strictObject({ id: z.uuid(), name: nullableString() });

const broadcast = z.strictObject({
  id: z.uuid(),
  status,
  audience: z.strictObject({ all: z.boolean(), typeIds: z.array(z.uuid()) }),
  translations: z.strictObject({
    he: z.strictObject({ title: z.string(), body: z.string() }).optional(),
    en: z.strictObject({ title: z.string(), body: z.string() }).optional(),
  }),
  author: person,
  /** Who approved or rejected it. */
  decidedBy: person.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  rejectReason: nullableString(),
  submittedAt: z.iso.datetime().nullable(),
  sentAt: z.iso.datetime().nullable(),
  /** How many people it reached; set when it was sent. */
  recipientCount: nullableNumber(),
  /** The caller wrote it: they may change and submit it, and may not decide on it. */
  mine: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export class AdminBroadcastDto extends createZodDto(broadcast) {}

export class AdminBroadcastListDto extends createZodDto(
  z.strictObject({
    items: z.array(broadcast),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class BroadcastAudienceDto extends createZodDto(
  z.strictObject({
    /** How many people would receive it if it were sent now. */
    count: z.number().int(),
  }),
) {}

export class BroadcastQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

/** A sent message, as one of its recipients reads it. */
export class BroadcastMessageDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    title: z.string(),
    paragraphs: z.array(z.string()),
    /** The language of the text returned (Hebrew when there is no text in the one asked for). */
    locale,
    sentAt: z.iso.datetime(),
  }),
) {}
