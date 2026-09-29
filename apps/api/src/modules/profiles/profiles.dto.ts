import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { isValidOrcid } from './orcid';

/** Profile fields with their own visibility (D9). First and last name share NAME. */
export const PROFILE_FIELDS = [
  'NAME',
  'NAME_HE',
  'NAME_EN',
  'TITLE',
  'POSITION',
  'INSTITUTION',
  'SUBSPECIALTIES',
  'BIO',
  'RESEARCH_INTERESTS',
  'ORCID',
  'LANGUAGES',
  'CONTACT_EMAIL',
  'CONTACT_PHONE',
] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number];

export const VISIBILITIES = ['PRIVATE', 'MEMBERS', 'PUBLIC'] as const;
const visibility = z.enum(VISIBILITIES);

/** Optional text: trimmed; an empty string clears the field (stored as null). */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

const orcid = z
  .string()
  .trim()
  .toUpperCase()
  .max(19)
  .refine(isValidOrcid, { message: 'Not a valid ORCID iD' })
  .nullable();

/** ISO 639-1/639-2 codes, e.g. "he", "en", "ar", "ru". */
const languageCode = z.string().regex(/^[a-z]{2,3}$/);

/** Digits, spaces, dashes and brackets, with an optional leading +. */
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/)
  .nullable();

const visibilityMap = z.strictObject(
  Object.fromEntries(PROFILE_FIELDS.map((field) => [field, visibility])) as Record<
    ProfileFieldKey,
    typeof visibility
  >,
);

export class ProfileDto extends createZodDto(
  z.strictObject({
    firstName: nullableString(),
    lastName: nullableString(),
    nameHe: nullableString(),
    nameEn: nullableString(),
    title: nullableString(),
    position: nullableString(),
    hospitalId: z.uuid().nullable(),
    departmentId: z.uuid().nullable(),
    subspecialtyIds: z.array(z.uuid()),
    bio: nullableString(),
    researchInterests: nullableString(),
    orcid: nullableString(),
    languages: z.array(z.string()),
    contactEmail: nullableString(),
    contactPhone: nullableString(),
    /** Every field, PRIVATE unless the member chose otherwise. */
    visibility: visibilityMap,
  }),
) {}

/**
 * Partial update: only the fields present change; null (or an empty string) clears one.
 * hospitalId and departmentId are set together, and the department must belong to the hospital.
 */
export class UpdateProfileDto extends createZodDto(
  z
    .strictObject({
      firstName: text(100).optional(),
      lastName: text(100).optional(),
      nameHe: text(200).optional(),
      nameEn: text(200).optional(),
      title: text(100).optional(),
      position: text(200).optional(),
      hospitalId: z.uuid().nullable().optional(),
      departmentId: z.uuid().nullable().optional(),
      subspecialtyIds: z.array(z.uuid()).max(11).optional(),
      bio: text(4000).optional(),
      researchInterests: text(2000).optional(),
      orcid: orcid.optional(),
      languages: z.array(languageCode).max(20).optional(),
      contactEmail: z.email().max(254).trim().toLowerCase().nullable().optional(),
      contactPhone: phone.optional(),
      visibility: visibilityMap.partial().optional(),
    })
    .refine((body) => (body.hospitalId === undefined) === (body.departmentId === undefined), {
      message: 'hospitalId and departmentId are set together',
      path: ['departmentId'],
    })
    .refine((body) => !(body.hospitalId === null && body.departmentId), {
      message: 'A department needs its hospital',
      path: ['hospitalId'],
    }),
) {}
