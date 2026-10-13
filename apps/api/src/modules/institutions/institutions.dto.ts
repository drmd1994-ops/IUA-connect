import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { organisationRefSchema } from '../organisations';

const name = z.string().trim().min(1).max(200);
const city = z.string().trim().min(1).max(100);
const email = z.email().max(254).trim().toLowerCase();

// --- Public reference lists (API_DESIGN.md §4: public, cached) ---------------------------

export class HospitalDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    nameHe: z.string(),
    nameEn: z.string(),
    cityHe: z.string(),
    cityEn: z.string(),
  }),
) {}

export class HospitalListDto extends createZodDto(
  z.strictObject({ items: z.array(HospitalDto.schema) }),
) {}

export class DepartmentDto extends createZodDto(
  z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() }),
) {}

export class DepartmentListDto extends createZodDto(
  z.strictObject({ items: z.array(DepartmentDto.schema) }),
) {}

export class SubspecialtyDto extends createZodDto(
  z.strictObject({ id: z.uuid(), key: z.string(), nameHe: z.string(), nameEn: z.string() }),
) {}

export class SubspecialtyListDto extends createZodDto(
  z.strictObject({ items: z.array(SubspecialtyDto.schema) }),
) {}

export const MEMBERSHIP_IDENTIFIERS = [
  'NONE',
  'SPECIALIST_CERTIFICATE',
  'MEDICAL_LICENCE',
] as const;

export class MembershipTypeDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    /** The organisation whose membership type it is. */
    organisation: organisationRefSchema,
    key: z.string(),
    nameHe: z.string(),
    nameEn: z.string(),
    /** What an applicant gives: a specialist certificate number, a medical licence number, or nothing. */
    identifier: z.enum(MEMBERSHIP_IDENTIFIERS),
    /** Members can apply for it themselves (not HONORARY_MEMBER). */
    selfApply: z.boolean(),
    /** Applications go to the department director first (not STUDENT). */
    directorApproval: z.boolean(),
  }),
) {}

export class MembershipTypeQueryDto extends createZodDto(
  z.strictObject({
    /** Only this organisation's types. Left out: those of every organisation. */
    organisation: z.uuid().optional(),
  }),
) {}

export class MembershipTypeListDto extends createZodDto(
  z.strictObject({ items: z.array(MembershipTypeDto.schema) }),
) {}

// --- Admin: hospitals, departments, directors ---------------------------------------------

export class DirectorDto extends createZodDto(
  z.strictObject({ userId: z.uuid(), email: z.string(), grantedAt: z.iso.datetime() }),
) {}

export class AdminDepartmentDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    nameHe: z.string(),
    nameEn: z.string(),
    active: z.boolean(),
    directors: z.array(DirectorDto.schema),
  }),
) {}

export class AdminHospitalDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    nameHe: z.string(),
    nameEn: z.string(),
    cityHe: z.string(),
    cityEn: z.string(),
    active: z.boolean(),
    departments: z.array(AdminDepartmentDto.schema),
  }),
) {}

export class AdminHospitalListDto extends createZodDto(
  z.strictObject({ items: z.array(AdminHospitalDto.schema) }),
) {}

export class CreateHospitalDto extends createZodDto(
  z.strictObject({ nameHe: name, nameEn: name, cityHe: city, cityEn: city }),
) {}

export class UpdateHospitalDto extends createZodDto(
  z
    .strictObject({
      nameHe: name.optional(),
      nameEn: name.optional(),
      cityHe: city.optional(),
      cityEn: city.optional(),
      active: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' }),
) {}

export class CreateDepartmentDto extends createZodDto(
  z.strictObject({ nameHe: name, nameEn: name }),
) {}

export class UpdateDepartmentDto extends createZodDto(
  z
    .strictObject({
      nameHe: name.optional(),
      nameEn: name.optional(),
      active: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' }),
) {}

export class AssignDirectorDto extends createZodDto(z.strictObject({ email })) {}

export class DirectorListDto extends createZodDto(
  z.strictObject({ items: z.array(DirectorDto.schema) }),
) {}
