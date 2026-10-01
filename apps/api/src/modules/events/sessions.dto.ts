import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

const locale = z.enum(['he', 'en']);
const instant = z.iso.datetime({ offset: true });

// --- Speakers -------------------------------------------------------------------------------

const speakerText = z.strictObject({
  name: z.string().trim().min(1).max(200),
  /** For example "Prof." or "Dr.". */
  title: z.string().trim().max(100).optional(),
  affiliation: z.string().trim().max(300).optional(),
  bio: z.string().trim().max(2000).optional(),
});

/** A speaker is a record, not an account. At least one language. */
export class SpeakerInputDto extends createZodDto(
  z.strictObject({
    photoFileId: z.uuid().nullable().optional(),
    translations: z
      .strictObject({ he: speakerText.optional(), en: speakerText.optional() })
      .refine((t) => t.he || t.en, { message: 'At least one language' }),
  }),
) {}

const speakerTextView = z.strictObject({
  name: z.string(),
  title: nullableString(),
  affiliation: nullableString(),
  bio: nullableString(),
});

export class AdminSpeakerDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    photoFileId: z.uuid().nullable(),
    translations: z.strictObject({
      he: speakerTextView.optional(),
      en: speakerTextView.optional(),
    }),
    /** How many sessions name this speaker (a speaker in use can't be deleted). */
    sessionCount: z.number().int(),
  }),
) {}

export class AdminSpeakerListQueryDto extends createZodDto(
  z.strictObject({
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  }),
) {}

export class AdminSpeakerListDto extends createZodDto(
  z.strictObject({
    items: z.array(AdminSpeakerDto.schema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

// --- Sessions -------------------------------------------------------------------------------

const sessionText = z.strictObject({
  title: z.string().trim().min(1).max(300),
  /** Plain text. */
  description: z.string().trim().max(4000).optional(),
});

/** The whole session (create, and replace). It must lie inside its event's time span. */
export class SessionInputDto extends createZodDto(
  z
    .strictObject({
      startAt: instant,
      endAt: instant,
      room: z.string().trim().max(200).optional(),
      /** In the order they should be shown. */
      speakerIds: z.array(z.uuid()).max(20).default([]),
      materialFileIds: z.array(z.uuid()).max(20).default([]),
      translations: z
        .strictObject({ he: sessionText.optional(), en: sessionText.optional() })
        .refine((t) => t.he || t.en, { message: 'At least one language' }),
    })
    .refine((body) => Date.parse(body.endAt) > Date.parse(body.startAt), {
      message: 'The end must be after the start',
      path: ['endAt'],
    }),
) {}

const sessionTextView = z.strictObject({ title: z.string(), description: nullableString() });

const materialView = z.strictObject({
  id: z.uuid(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});

export class AdminSessionDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    room: nullableString(),
    speakerIds: z.array(z.uuid()),
    materials: z.array(materialView),
    translations: z.strictObject({
      he: sessionTextView.optional(),
      en: sessionTextView.optional(),
    }),
  }),
) {}

export class AdminSessionListDto extends createZodDto(
  z.strictObject({ items: z.array(AdminSessionDto.schema) }),
) {}

// --- Public ---------------------------------------------------------------------------------

export class PublicSessionQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

export class PublicSessionListDto extends createZodDto(
  z.strictObject({
    /** In order of time. */
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        title: z.string(),
        description: nullableString(),
        startAt: z.iso.datetime(),
        endAt: z.iso.datetime(),
        room: nullableString(),
        /** The language of the text returned. */
        locale,
        speakers: z.array(
          z.strictObject({
            id: z.uuid(),
            name: z.string(),
            title: nullableString(),
            affiliation: nullableString(),
            bio: nullableString(),
            photoFileId: z.uuid().nullable(),
          }),
        ),
        materials: z.array(materialView),
      }),
    ),
  }),
) {}
