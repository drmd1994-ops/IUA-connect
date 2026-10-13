import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { PAYMENT_STATUSES, historyView, membershipView } from './membership.dto';

const reason = z.string().trim().max(1000);

export class MembershipListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']).optional(),
    type: z.string().max(64).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    /** Only this organisation's memberships. Left out: all the caller may see. */
    organisation: z.uuid().optional(),
    /** Matches email and names (Hebrew or English), case-insensitive. */
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

const member = z.strictObject({
  userId: z.uuid(),
  email: z.string(),
  firstName: nullableString(),
  lastName: nullableString(),
  nameHe: nullableString(),
  nameEn: nullableString(),
});

export class AdminMembershipDto extends createZodDto(
  membershipView.extend({
    member,
    source: z.enum(['MANUAL', 'IMPORT', 'IMA']),
    /** Whether a certificate or licence number is on file. The number is never returned. */
    identifierOnFile: z.boolean(),
  }),
) {}

export class AdminMembershipListDto extends createZodDto(
  z.strictObject({
    items: z.array(AdminMembershipDto.schema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class AdminMembershipDetailDto extends createZodDto(
  z.strictObject({
    membership: AdminMembershipDto.schema,
    history: z.array(historyView),
  }),
) {}

/**
 * Creates a membership by hand for an existing account without one (any type, including
 * HONORARY_MEMBER). identifier: the number the type needs, if any.
 */
export class CreateMembershipDto extends createZodDto(
  z.strictObject({
    email: z.email().max(254).trim().toLowerCase(),
    typeId: z.uuid(),
    identifier: z.string().max(40).optional(),
    reason: reason.optional(),
  }),
) {}

export class MembershipActionDto extends createZodDto(
  z.strictObject({ reason: reason.optional() }),
) {}

/** Suspending needs a reason, recorded in the history. */
export class SuspendMembershipDto extends createZodDto(z.strictObject({ reason: reason.min(1) })) {}

export class PaymentStatusDto extends createZodDto(
  z.strictObject({ paymentStatus: z.enum(PAYMENT_STATUSES), reason: reason.optional() }),
) {}
