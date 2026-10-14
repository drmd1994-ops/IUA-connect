import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

export const VERIFIED_AS = ['SPECIALIST', 'RESIDENT', 'PHYSICIAN', 'STUDENT'] as const;
export const REQUEST_STATES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'REVOKED',
  'EXPIRED',
] as const;
export const DECISIONS = ['APPROVE', 'REJECT', 'REVOKE'] as const;
export const REGISTER_STATUSES = [
  'ACTIVE_PERMANENT',
  'ACTIVE_TEMPORARY',
  'SUSPENDED',
  'NOT_FOUND',
] as const;
/** Where the person stands (M17 plan §2). */
export const VERIFICATION_STATUSES = [
  'NOT_ASKED',
  'WAITING',
  'VERIFIED',
  'REFUSED',
  'REVOKED',
  'EXPIRED',
] as const;

const named = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });

// --- The person ----------------------------------------------------------------------------

/**
 * Ask to be verified. A physician gives their medical licence number (digits; spaces and dashes
 * are ignored); a specialist their specialist certificate number too. A student names their
 * school, when they expect to graduate, and uploads the school's confirmation first
 * (`POST /me/verification/document`). The service checks what each kind needs.
 */
export class SubmitVerificationDto extends createZodDto(
  z.strictObject({
    kind: z.enum(VERIFIED_AS),
    licence: z.string().max(40).optional(),
    certificate: z.string().max(40).optional(),
    schoolId: z.uuid().optional(),
    expectedGraduation: z.iso.date().optional(),
    documentFileId: z.uuid().optional(),
    note: z.string().trim().max(1000).optional(),
  }),
) {}

const decisionView = z.strictObject({
  decision: z.enum(DECISIONS),
  reason: nullableString(),
  at: z.iso.datetime(),
});

const requestShape = z.strictObject({
  id: z.uuid(),
  kind: z.enum(VERIFIED_AS),
  state: z.enum(REQUEST_STATES),
  /** Whether a number was given. The numbers themselves are never returned. */
  licenceProvided: z.boolean(),
  certificateProvided: z.boolean(),
  school: named.nullable(),
  expectedGraduation: z.iso.date().nullable(),
  /** Whether the school's confirmation is still held (it is deleted once decided on). */
  documentHeld: z.boolean(),
  note: nullableString(),
  createdAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  decisions: z.array(decisionView),
});

export class VerificationRequestDto extends createZodDto(requestShape) {}

/** Where the person stands, and their latest request. */
export class MyVerificationDto extends createZodDto(
  z.strictObject({
    status: z.enum(VERIFICATION_STATUSES),
    /** While verified: what the platform knows them as, and until when. */
    verifiedAs: z.enum(VERIFIED_AS).nullable(),
    verifiedUntil: z.iso.datetime().nullable(),
    /** Verified because an organisation accepted them, not by the platform's own check. */
    byOrganisation: z.boolean(),
    /** Whether a new request may be sent now (none is open; renewing is near or due). */
    canAsk: z.boolean(),
    latest: VerificationRequestDto.schema.nullable(),
  }),
) {}

export class MedicalSchoolListDto extends createZodDto(z.strictObject({ items: z.array(named) })) {}

// --- Reviewers -----------------------------------------------------------------------------

/** What a reviewer sees: who asked, and the person's earlier requests. Never a number. */
export class ReviewVerificationDto extends createZodDto(
  requestShape.extend({
    person: z.strictObject({
      userId: z.uuid(),
      email: z.string(),
      firstName: nullableString(),
      lastName: nullableString(),
      nameHe: nullableString(),
      nameEn: nullableString(),
    }),
    /** Days since the request was sent. */
    waitingDays: z.number().int(),
    /** The register's findings and matches, in each decision (reviewers only). */
    findings: z.array(
      z.strictObject({
        decision: z.enum(DECISIONS),
        registerStatus: z.enum(REGISTER_STATUSES).nullable(),
        licenceMatches: z.boolean().nullable(),
        certificateMatches: z.boolean().nullable(),
        at: z.iso.datetime(),
      }),
    ),
    earlier: z.array(
      z.strictObject({
        id: z.uuid(),
        kind: z.enum(VERIFIED_AS),
        state: z.enum(REQUEST_STATES),
        createdAt: z.iso.datetime(),
      }),
    ),
  }),
) {}

export class ReviewVerificationListDto extends createZodDto(
  z.strictObject({ items: z.array(ReviewVerificationDto.schema) }),
) {}

export class ReviewVerificationQueryDto extends createZodDto(
  z.strictObject({
    /** PENDING (the default): the queue, oldest first. Others: decided requests, newest first. */
    state: z.enum(REQUEST_STATES).default('PENDING'),
  }),
) {}

/**
 * A reviewer's decision. To approve a physician: what the register showed (an active licence),
 * and the licence number as the register shows it, typed in; the server compares it with the
 * one the person gave and answers only whether they match. A specialist's certificate number
 * the same way. To approve a student: nothing more (the reviewer read the confirmation). A
 * reason is required to refuse.
 */
export class VerificationDecisionDto extends createZodDto(
  z
    .strictObject({
      decision: z.enum(['APPROVE', 'REJECT']),
      reason: z.string().trim().max(1000).optional(),
      registerStatus: z.enum(REGISTER_STATUSES).optional(),
      registerLicence: z.string().max(40).optional(),
      registerCertificate: z.string().max(40).optional(),
    })
    .refine((body) => body.decision !== 'REJECT' || !!body.reason, {
      message: 'A reason is required to refuse',
      path: ['reason'],
    }),
) {}

/** Ending a person's verification. The reason is shown to them. */
export class RevokeVerificationDto extends createZodDto(
  z.strictObject({ reason: z.string().trim().min(1).max(1000) }),
) {}

export class DocumentLinkDto extends createZodDto(
  z.strictObject({ url: z.string(), expiresAt: z.iso.datetime() }),
) {}
