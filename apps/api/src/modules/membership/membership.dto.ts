import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const named = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });
const typeRef = named.extend({ key: z.string() });

const STATES = ['PENDING_DIRECTOR', 'PENDING_ADMIN', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
const STAGES = ['DIRECTOR', 'ADMIN'] as const;
const OUTCOMES = ['APPROVE', 'REJECT'] as const;
const FLAGS = ['NO_DIRECTOR', 'APPLICANT_IS_DIRECTOR'] as const;

// --- Applications --------------------------------------------------------------------------

/**
 * Apply for a membership type. The department is required when the type goes through a
 * department director (not for students). identifier: the specialist certificate or medical
 * licence number when the type needs one — digits only, spaces and dashes are ignored.
 */
export class ApplyDto extends createZodDto(
  z.strictObject({
    typeId: z.uuid(),
    hospitalId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
    identifier: z.string().max(40).optional(),
  }),
) {}

const decisionView = z.strictObject({
  stage: z.enum(STAGES),
  decision: z.enum(OUTCOMES),
  reason: z.string().nullable(),
  at: z.iso.datetime(),
});

const applicationShape = z.strictObject({
  id: z.uuid(),
  state: z.enum(STATES),
  type: typeRef,
  hospital: named.nullable(),
  department: named.nullable(),
  /** Whether a certificate or licence number was given. The number itself is never returned. */
  identifierProvided: z.boolean(),
  createdAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  decisions: z.array(decisionView),
});

/** The applicant's own view. */
export class ApplicationDto extends createZodDto(applicationShape) {}

export class ApplicationListDto extends createZodDto(
  z.strictObject({ items: z.array(ApplicationDto.schema) }),
) {}

/** A director's or admin's view: who applied, and why it reached them. */
export class ReviewApplicationDto extends createZodDto(
  applicationShape.extend({
    applicant: z.strictObject({
      userId: z.uuid(),
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      nameHe: z.string().nullable(),
      nameEn: z.string().nullable(),
    }),
    flags: z.array(z.enum(FLAGS)),
  }),
) {}

export class ReviewApplicationListDto extends createZodDto(
  z.strictObject({ items: z.array(ReviewApplicationDto.schema) }),
) {}

export class ReviewQueryDto extends createZodDto(
  z.strictObject({ stage: z.enum(['director', 'admin']) }),
) {}

/** A reason is required to reject, so the applicant learns why. */
export class DecisionDto extends createZodDto(
  z
    .strictObject({
      decision: z.enum(OUTCOMES),
      reason: z.string().trim().max(1000).optional(),
    })
    .refine((body) => body.decision !== 'REJECT' || !!body.reason, {
      message: 'A reason is required to reject',
      path: ['reason'],
    }),
) {}

// --- The member's membership ---------------------------------------------------------------

export const MEMBERSHIP_EVENTS = [
  'CREATED',
  'RENEWED',
  'SUSPENDED',
  'REINSTATED',
  'EXPIRED',
  'TYPE_CHANGED',
  'PAYMENT_STATUS_CHANGED',
] as const;
export const PAYMENT_STATUSES = ['NOT_REQUIRED', 'UNPAID', 'PAID', 'WAIVED'] as const;

export const membershipView = z.strictObject({
  id: z.uuid(),
  type: typeRef,
  /** EXPIRED is computed from the end date. */
  status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  paymentStatus: z.enum(PAYMENT_STATUSES),
});

export const historyView = z.strictObject({
  event: z.enum(MEMBERSHIP_EVENTS),
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
  at: z.iso.datetime(),
});

export class MyMembershipDto extends createZodDto(
  z.strictObject({
    membership: membershipView.nullable(),
    history: z.array(historyView),
  }),
) {}
