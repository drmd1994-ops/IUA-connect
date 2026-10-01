import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';

/** What the member's phone sends after scanning the venue's QR code. */
export class CheckInDto extends createZodDto(
  z.strictObject({ token: z.string().min(20).max(2000) }),
) {}

export class CheckInResultDto extends createZodDto(
  z.strictObject({
    /** False when the person was already recorded (scanning twice is harmless). */
    recorded: z.boolean(),
    sessionId: z.uuid().nullable(),
    at: z.iso.datetime(),
  }),
) {}

export class CheckInCodeQueryDto extends createZodDto(
  z.strictObject({
    /** A session of the event; leave out for the event as a whole. */
    sessionId: z.uuid().optional(),
    /** The language of the page the code opens. */
    locale: z.enum(['he', 'en']).default('he'),
  }),
) {}

export class CheckInCodeDto extends createZodDto(
  z.strictObject({
    /** The address to show as a QR code. It opens the check-in page on the member's phone. */
    url: z.string(),
    expiresAt: z.iso.datetime(),
  }),
) {}

export class ManualAttendanceDto extends createZodDto(
  z.strictObject({
    /** The account's email address. */
    email: z.email().max(254),
    sessionId: z.uuid().optional(),
  }),
) {}

export class VoidAttendanceDto extends createZodDto(
  z.strictObject({ reason: z.string().trim().min(1).max(500) }),
) {}

export class AttendanceListQueryDto extends createZodDto(
  z.strictObject({
    /** Only this session's records. */
    sessionId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  }),
) {}

const record = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  name: nullableString(),
  sessionId: z.uuid().nullable(),
  method: z.enum(['QR', 'MANUAL']),
  at: z.iso.datetime(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: nullableString(),
});

export class AttendanceRecordDto extends createZodDto(record) {}

export class AttendanceListDto extends createZodDto(
  z.strictObject({
    /** People with at least one live record for the event. */
    attendees: z.number().int(),
    /** Newest first. Voided records stay in the list, marked. */
    items: z.array(record),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}
