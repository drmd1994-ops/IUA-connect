import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

export class AuditLogQueryDto extends createZodDto(
  z.strictObject({
    /** What was done, or the start of it: "account." matches every account action. */
    action: z
      .string()
      .trim()
      .regex(/^[a-z0-9_.]{1,100}$/i)
      .optional(),
    /** Who did it: an account's id, or part of its email address. */
    actor: z.string().trim().min(1).max(254).optional(),
    entityType: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,100}$/i)
      .optional(),
    entityId: z.string().trim().min(1).max(100).optional(),
    /** Dates in Israel, "YYYY-MM-DD"; both ends are included. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  }),
) {}

export class AuditLogListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        at: z.iso.datetime(),
        /** Null for the system (a scheduled job) and for people who were not signed in. */
        actor: z.strictObject({ id: z.uuid(), email: nullableString() }).nullable(),
        actorIp: nullableString(),
        action: z.string(),
        entityType: nullableString(),
        entityId: nullableString(),
        /** The recorded details, stored without secrets. */
        changes: z.record(z.string(), z.unknown()).nullable(),
        correlationId: z.string(),
      }),
    ),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}
