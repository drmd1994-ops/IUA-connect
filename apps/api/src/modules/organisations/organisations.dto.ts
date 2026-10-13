import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

/** An organisation as anyone may see it: who it is, nothing about its members. */
export const organisationSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  nameHe: z.string(),
  nameEn: z.string(),
  descriptionHe: nullableString(),
  descriptionEn: nullableString(),
});

/** The short form carried by what an organisation owns (a membership, a card, an item). */
export const organisationRefSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  nameHe: z.string(),
  nameEn: z.string(),
});
export type OrganisationRef = z.infer<typeof organisationRefSchema>;

export class OrganisationDto extends createZodDto(organisationSchema) {}

export class OrganisationListDto extends createZodDto(
  z.strictObject({ items: z.array(organisationSchema) }),
) {}

/**
 * Names the organisation a request is about. It may be left out while the platform has one
 * organisation, or while the person belongs to exactly one.
 */
export const organisationQuery = { organisation: z.uuid().optional() };

export class OrganisationQueryDto extends createZodDto(z.strictObject(organisationQuery)) {}
