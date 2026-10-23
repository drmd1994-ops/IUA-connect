import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const STATES = ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'ENDED'] as const;
const LANGUAGE = /^[a-z]{2,3}$/;

const nameRef = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });
const subspecialtyRef = z.strictObject({
  id: z.uuid(),
  key: z.string(),
  nameHe: z.string(),
  nameEn: z.string(),
});

/** A person as the other side of a mentorship sees them. */
const personSchema = z.strictObject({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  /** A medical student or a resident (M17); null for anyone else. */
  mark: z.enum(['STUDENT', 'RESIDENT']).nullable(),
  hospital: nameRef.nullable(),
  department: nameRef.nullable(),
});

// --- Mentors ------------------------------------------------------------------------------------

export class MentorDto extends createZodDto(
  z.strictObject({
    person: personSchema,
    subspecialties: z.array(subspecialtyRef),
    academicInterests: z.string(),
    careerInterests: z.string(),
    availability: z.string(),
    languages: z.array(z.string()),
    /** Below their limit of mentees: can be asked. */
    taking: z.boolean(),
    /** The reader's open request or mentorship with them, if any. */
    mine: z.strictObject({ id: z.uuid(), state: z.enum(STATES) }).nullable(),
  }),
) {}

export class MentorListQueryDto extends createZodDto(
  z.strictObject({
    /** A subspecialty key. */
    subspecialty: z.string().trim().max(64).optional(),
    hospital: z.uuid().optional(),
    language: z.string().trim().toLowerCase().regex(LANGUAGE).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}

export class MentorListDto extends createZodDto(
  z.strictObject({
    items: z.array(MentorDto.schema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

/** The reader's own mentor settings. */
const mentorSettings = z.strictObject({
  open: z.boolean(),
  subspecialtyIds: z.array(z.uuid()).max(20),
  academicInterests: z.string().trim().max(1000),
  careerInterests: z.string().trim().max(1000),
  availability: z.string().trim().max(300),
  languages: z.array(z.string().trim().toLowerCase().regex(LANGUAGE)).max(10),
  capacity: z.number().int().min(1).max(10),
});

export class MentorSettingsInputDto extends createZodDto(mentorSettings) {}

export class MentorSettingsDto extends createZodDto(
  z.strictObject({
    /** A verified specialist: may offer mentorship. */
    eligible: z.boolean(),
    /** Null until they first save their settings. */
    settings: mentorSettings.nullable(),
    /** Mentorships they hold as a mentor now. */
    active: z.number().int(),
  }),
) {}

// --- Requests -----------------------------------------------------------------------------------

export class MentorshipRequestInputDto extends createZodDto(
  z.strictObject({
    mentorId: z.uuid(),
    /** A few words about who they are and what they hope for. */
    message: z.string().trim().min(1).max(1000),
  }),
) {}

export class MentorshipDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    /** Whether the reader is the mentor or the mentee. */
    role: z.enum(['mentor', 'mentee']),
    other: personSchema,
    state: z.enum(STATES),
    message: z.string(),
    createdAt: z.iso.datetime(),
    answeredAt: z.iso.datetime().nullable(),
    closedAt: z.iso.datetime().nullable(),
    /** The private conversation, once accepted. */
    conversationId: z.uuid().nullable(),
  }),
) {}

export class MentorshipListDto extends createZodDto(
  z.strictObject({ items: z.array(MentorshipDto.schema) }),
) {}
