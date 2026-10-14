import { PERMISSIONS, ROLE_KEYS } from '@medconnect/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { organisationRefSchema } from '../organisations';

export const ACCOUNT_STATES = ['ACTIVE', 'LOCKED', 'DISABLED'] as const;
const state = z.enum(ACCOUNT_STATES);
const roleKey = z.enum(ROLE_KEYS as [string, ...string[]]);

export class AccountListQueryDto extends createZodDto(
  z.strictObject({
    /** Part of an email address or of a name. */
    q: z.string().trim().min(1).max(100).optional(),
    status: state.optional(),
    role: roleKey.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
) {}

const summary = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  name: nullableString(),
  status: state,
  /** Locked right now after failed sign-ins (it ends by itself; an admin can end it sooner). */
  lockedNow: z.boolean(),
  emailVerified: z.boolean(),
  roles: z.array(z.string()),
  /** Has a confirmed second factor (an authenticator app or a passkey). */
  twoStep: z.boolean(),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export class AccountListDto extends createZodDto(
  z.strictObject({
    items: z.array(summary),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class AccountDto extends createZodDto(
  summary.extend({
    lockedUntil: z.iso.datetime().nullable(),
    openSessions: z.number().int(),
    roleGrants: z.array(
      z.strictObject({
        role: z.string(),
        /** The organisation the role is held in; null: held on the platform. */
        organisation: organisationRefSchema.nullable(),
        /** NONE, or what the role is limited to (a department, a subspecialty). */
        scope: z.string(),
        grantedAt: z.iso.datetime(),
        /** Can be removed on this page (unscoped roles only). */
        removable: z.boolean(),
      }),
    ),
    /**
     * The person's memberships, one per organisation. Null for staff who may not look into
     * organisations (`organisations.access`): a membership is the organisation's business.
     */
    memberships: z
      .array(
        z.strictObject({
          id: z.uuid(),
          organisation: organisationRefSchema,
          status: z.string(),
          typeKey: z.string(),
          endDate: z.string(),
        }),
      )
      .nullable(),
    /** Known to the platform as a physician, and since when. */
    verifiedAt: z.iso.datetime().nullable(),
  }),
) {}

/** Every account action is explained; the reason goes into the audit log. */
export class AccountActionDto extends createZodDto(
  z.strictObject({ reason: z.string().trim().min(3).max(500) }),
) {}

export class RoleChangeDto extends createZodDto(
  z.strictObject({
    role: z.string().trim().min(1).max(64),
    /** The organisation to hold the role in. Left out or null: on the platform. */
    organisationId: z.uuid().nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  }),
) {}

export class RoleListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        key: z.string(),
        requiresTwoStep: z.boolean(),
        /** NONE, DEPARTMENT or SUBSPECIALTY. */
        scope: z.string(),
        /** Where it is held: "platform", "organisation" or "either". */
        level: z.enum(['platform', 'organisation', 'either']),
        permissions: z.array(z.enum(PERMISSIONS)),
        /** How many accounts hold it. */
        holders: z.number().int(),
      }),
    ),
  }),
) {}
