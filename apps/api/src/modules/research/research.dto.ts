import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

export const STUDY_TYPES = [
  'PROSPECTIVE',
  'RETROSPECTIVE',
  'TRIAL',
  'REGISTRY',
  'SURVEY',
  'OTHER',
] as const;
export const PROJECT_STATUSES = ['PLANNING', 'RECRUITING', 'ONGOING', 'COMPLETED'] as const;
export const ETHICS_STATUSES = ['APPROVED', 'SUBMITTED', 'NOT_YET', 'NOT_NEEDED'] as const;
export const PROJECT_NEEDS = [
  'CENTRES',
  'CO_INVESTIGATORS',
  'STATISTICIAN',
  'RESIDENTS',
  'STUDENTS',
] as const;
const REQUEST_STATES = ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'] as const;

const nameRef = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });
const subspecialtyRef = nameRef.extend({ key: z.string() });

/** A person as the other side sees them: name, mark, hospital. */
export const researchPersonSchema = z.strictObject({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  mark: z.enum(['STUDENT', 'RESIDENT']).nullable(),
  hospital: nameRef.nullable(),
});

export class ProjectInputDto extends createZodDto(
  z.strictObject({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
    studyType: z.enum(STUDY_TYPES),
    status: z.enum(PROJECT_STATUSES).default('PLANNING'),
    ethics: z.enum(ETHICS_STATUSES),
    funding: z.string().trim().max(300).nullable().default(null),
    contact: z.string().trim().max(300).nullable().default(null),
    needs: z.array(z.enum(PROJECT_NEEDS)).max(PROJECT_NEEDS.length).default([]),
    subspecialtyIds: z.array(z.uuid()).max(20).default([]),
    open: z.boolean().default(true),
  }),
) {}

const projectFields = {
  id: z.uuid(),
  title: z.string(),
  studyType: z.enum(STUDY_TYPES),
  status: z.enum(PROJECT_STATUSES),
  ethics: z.enum(ETHICS_STATUSES),
  needs: z.array(z.enum(PROJECT_NEEDS)),
  subspecialties: z.array(subspecialtyRef),
  lead: researchPersonSchema,
  open: z.boolean(),
  ended: z.boolean(),
  /** Not confirmed by its lead for a year. */
  stale: z.boolean(),
  updatedAt: z.iso.datetime(),
};

export class ProjectListDto extends createZodDto(
  z.strictObject({
    items: z.array(z.strictObject({ ...projectFields, excerpt: z.string() })),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class ProjectListQueryDto extends createZodDto(
  z.strictObject({
    q: z.string().trim().max(100).optional(),
    /** A subspecialty key. */
    subspecialty: z.string().trim().max(64).optional(),
    studyType: z.enum(STUDY_TYPES).optional(),
    need: z.enum(PROJECT_NEEDS).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    /** Only the reader's own projects. */
    mine: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  }),
) {}

export class ProjectDto extends createZodDto(
  z.strictObject({
    ...projectFields,
    description: z.string(),
    funding: nullableString(),
    contact: nullableString(),
    /** The reader leads it. */
    mine: z.boolean(),
    /** The reader's own open request or membership, if any. */
    myRequest: z.strictObject({ id: z.uuid(), state: z.enum(REQUEST_STATES) }).nullable(),
    /** The project's chat group: for its lead and the people accepted into it. */
    groupId: z.uuid().nullable(),
    /** How many people were accepted. */
    members: z.number().int(),
    createdAt: z.iso.datetime(),
  }),
) {}

export class JoinInputDto extends createZodDto(
  z.strictObject({ message: z.string().trim().min(1).max(1000) }),
) {}

export class ResearchRequestDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    /** Whether the reader leads the project, or asked to join it. */
    role: z.enum(['lead', 'asker']),
    project: z.strictObject({ id: z.uuid(), title: z.string() }),
    /** The other side: the person asking, or the project's lead. */
    other: researchPersonSchema,
    state: z.enum(REQUEST_STATES),
    message: z.string(),
    createdAt: z.iso.datetime(),
    answeredAt: z.iso.datetime().nullable(),
  }),
) {}

export class ResearchRequestListDto extends createZodDto(
  z.strictObject({ items: z.array(ResearchRequestDto.schema) }),
) {}
