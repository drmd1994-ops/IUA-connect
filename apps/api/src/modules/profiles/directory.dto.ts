import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

/** The directory shows this many members per page; it can't be asked for more (no bulk reads). */
export const DIRECTORY_PAGE_SIZE = 20;
/** The wording a member agrees to when they switch the listing on. */
export const DIRECTORY_CONSENT_VERSION = 'directory-2026-10';

export class DirectoryQueryDto extends createZodDto(
  z.strictObject({
    /** Part of a name, at least 2 characters. */
    q: z.string().trim().min(2).max(100).optional(),
    hospitalId: z.uuid().optional(),
    subspecialtyId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
  }),
) {}

const named = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });

/** A listed member. Fields the member keeps private are null (or empty), never sent. */
const member = z.strictObject({
  id: z.uuid(),
  firstName: nullableString(),
  lastName: nullableString(),
  nameHe: nullableString(),
  nameEn: nullableString(),
  title: nullableString(),
  position: nullableString(),
  hospital: named.nullable(),
  department: named.nullable(),
  subspecialties: z.array(named.extend({ key: z.string() })),
  photoFileId: nullableString(),
});

export class DirectoryListDto extends createZodDto(
  z.strictObject({
    items: z.array(member),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class DirectoryMemberDto extends createZodDto(
  member.extend({
    bio: nullableString(),
    researchInterests: nullableString(),
    orcid: nullableString(),
    languages: z.array(z.string()),
    contactEmail: nullableString(),
    contactPhone: nullableString(),
  }),
) {}

export class ConsentsDto extends createZodDto(
  z.strictObject({
    /** Listed in the member directory. */
    directory: z.strictObject({
      granted: z.boolean(),
      /** The wording version that would be agreed to now. */
      version: z.string(),
      grantedAt: z.iso.datetime().nullable(),
    }),
  }),
) {}

export class ConsentInputDto extends createZodDto(
  z.strictObject({
    kind: z.enum(['DIRECTORY']),
    granted: z.boolean(),
  }),
) {}
