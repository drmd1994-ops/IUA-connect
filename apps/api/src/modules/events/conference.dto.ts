import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const locale = z.enum(['he', 'en']);

export class ConferenceQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

const pollOption = z.strictObject({
  id: z.uuid(),
  text: z.string(),
  /** Empty until the reader may see results. */
  votes: z.number().int().nullable(),
});

export class LivePollDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    question: z.string(),
    status: z.enum(['DRAFT', 'OPEN', 'CLOSED']),
    options: z.array(pollOption),
    /** Empty until the reader may see results. */
    total: z.number().int().nullable(),
    voted: z.boolean(),
  }),
) {}

export class LiveQuestionDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    text: z.string(),
    status: z.enum(['PENDING', 'VISIBLE', 'ANSWERED', 'HIDDEN']),
    upvotes: z.number().int(),
    /** Empty for an anonymous question, and for a guest (see guestNumber). */
    authorName: z.string().nullable(),
    guestNumber: z.number().int().nullable(),
    upvoted: z.boolean(),
  }),
) {}

export class LiveSessionDto extends createZodDto(
  z.strictObject({
    sessionId: z.uuid(),
    moderateQuestions: z.boolean(),
    allowAnonymousQuestions: z.boolean(),
    questionsOpen: z.boolean(),
    feedbackOpen: z.boolean(),
    feedbackGiven: z.boolean(),
    canChair: z.boolean(),
    canModerate: z.boolean(),
    polls: z.array(LivePollDto.schema),
    questions: z.array(LiveQuestionDto.schema),
  }),
) {}

export class VoteDto extends createZodDto(z.strictObject({ optionId: z.uuid() })) {}

export class PollInputDto extends createZodDto(
  z.strictObject({
    question: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
  }),
) {}

export class QuestionInputDto extends createZodDto(
  z.strictObject({
    text: z.string().trim().min(1).max(500),
    anonymous: z.boolean().default(false),
  }),
) {}

export class QuestionStatusDto extends createZodDto(
  z.strictObject({ status: z.enum(['VISIBLE', 'ANSWERED', 'HIDDEN']) }),
) {}

export class FeedbackInputDto extends createZodDto(
  z.strictObject({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  }),
) {}

export class LiveSettingsDto extends createZodDto(
  z.strictObject({
    moderateQuestions: z.boolean().optional(),
    allowAnonymousQuestions: z.boolean().optional(),
  }),
) {}

export class FeedbackSummaryDto extends createZodDto(
  z.strictObject({
    count: z.number().int(),
    average: z.number().nullable(),
    comments: z.array(z.string()),
  }),
) {}

export class SessionStaffDto extends createZodDto(
  z.strictObject({
    chairs: z.array(z.strictObject({ userId: z.uuid(), email: z.string() })),
    moderators: z.array(z.strictObject({ userId: z.uuid(), email: z.string() })),
  }),
) {}

export class SessionStaffInputDto extends createZodDto(
  z.strictObject({
    chairs: z.array(z.email()).max(10),
    moderators: z.array(z.email()).max(10),
  }),
) {}

export class GuestEntryQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

export class GuestEntryAdminDto extends createZodDto(
  z.strictObject({
    /** Whether this server can have a guest entry at all: never in real production. */
    available: z.boolean(),
    open: z.boolean(),
    from: z.iso.datetime().nullable(),
    until: z.iso.datetime().nullable(),
    /** The address behind the QR code. */
    link: z.string().nullable(),
    guests: z.number().int(),
  }),
) {}

export class GuestEntryInputDto extends createZodDto(
  z
    .strictObject({ from: z.iso.datetime(), until: z.iso.datetime() })
    .refine((value) => new Date(value.from) < new Date(value.until), {
      path: ['until'],
      message: 'until must be after from',
    }),
) {}

export class EnterAsGuestDto extends createZodDto(
  z.strictObject({
    code: z.string().min(1).max(64),
    /** The mobile app: the tokens come in the answer instead of a cookie. */
    client: z.literal('app').optional(),
    deviceName: z.string().trim().max(80).optional(),
  }),
) {}

export class EnterAsGuestResultDto extends createZodDto(
  z.strictObject({
    accessToken: z.string(),
    expiresIn: z.number().int(),
    /** Only for the mobile app. */
    refreshToken: z.string().optional(),
    sessionExpiresAt: z.string().optional(),
    number: z.number().int(),
  }),
) {}
