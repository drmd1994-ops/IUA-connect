import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

const locale = z.enum(['he', 'en']);

/** The caller's own registration for one event. */
export class MyRegistrationDto extends createZodDto(
  z.strictObject({
    /** NONE: not registered (or cancelled). */
    status: z.enum(['NONE', 'REGISTERED', 'WAITLISTED']),
    /** Place in the waiting list (1 is next), when waiting. */
    waitingPosition: z.number().int().nullable(),
    /** The sessions in the personal schedule. */
    sessionIds: z.array(z.uuid()),
  }),
) {}

export class ScheduleInputDto extends createZodDto(
  z.strictObject({
    /** The sessions of this event to keep in the personal schedule (replaces the choice). */
    sessionIds: z.array(z.uuid()).max(200),
  }),
) {}

export class MyScheduleQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

export class MyScheduleDto extends createZodDto(
  z.strictObject({
    /** Events the caller is registered or waiting for, soonest first. */
    items: z.array(
      z.strictObject({
        slug: z.string(),
        title: z.string(),
        startAt: z.iso.datetime(),
        endAt: z.iso.datetime(),
        timezone: z.string(),
        locationName: nullableString(),
        cancelled: z.boolean(),
        status: z.enum(['REGISTERED', 'WAITLISTED']),
        /** Chosen sessions, in order of time. */
        sessions: z.array(
          z.strictObject({
            id: z.uuid(),
            title: z.string(),
            startAt: z.iso.datetime(),
            endAt: z.iso.datetime(),
            room: nullableString(),
            /** True when it overlaps another chosen session (in any event). */
            overlaps: z.boolean(),
          }),
        ),
      }),
    ),
  }),
) {}

export class AdminRegistrationListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(['REGISTERED', 'WAITLISTED', 'CANCELLED']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  }),
) {}

export class AdminRegistrationListDto extends createZodDto(
  z.strictObject({
    capacity: z.number().int().nullable(),
    registered: z.number().int(),
    waiting: z.number().int(),
    /** Registered people first, then the waiting list in order, then cancellations. */
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        userId: z.uuid(),
        email: z.string(),
        name: nullableString(),
        status: z.enum(['REGISTERED', 'WAITLISTED', 'CANCELLED']),
        queuedAt: z.iso.datetime(),
        promotedAt: z.iso.datetime().nullable(),
        cancelledAt: z.iso.datetime().nullable(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}
