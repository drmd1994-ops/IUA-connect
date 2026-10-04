import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableNumber, nullableString } from '../../common/dto/nullable-string';
import {
  CONVERSATIONS_PAGE_SIZE,
  MESSAGES_PAGE_SIZE,
  MESSAGE_MAX_LENGTH,
  MUTE_CHOICES,
} from './chat-rules';

/** Why the reader can't send in a conversation; "none" when they can. */
export const SEND_STATES = ['none', 'membersOnly', 'suspended', 'blocked', 'unavailable'] as const;
export type SendState = (typeof SEND_STATES)[number];

/** A message's text: plain text, never empty. PostgreSQL can't store the NUL character. */
const messageBody = z
  .string()
  .trim()
  .min(1)
  .max(MESSAGE_MAX_LENGTH)
  .refine((text) => !text.includes('\u0000'), 'must not contain the NUL character');

/** The other person, as the reader may see them. All empty for a deleted account. */
const person = z.strictObject({
  id: nullableString(),
  firstName: nullableString(),
  lastName: nullableString(),
  photoFileId: nullableString(),
  /** Their page in the member directory can be opened. */
  listed: z.boolean(),
});

const lastMessage = z.strictObject({
  id: z.uuid(),
  seq: z.number().int(),
  senderId: nullableString(),
  /** The start of the text; empty for a deleted message. */
  body: z.string(),
  deleted: z.boolean(),
  createdAt: z.iso.datetime(),
});

const conversation = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['DIRECT']),
  other: person,
  lastMessage: lastMessage.nullable(),
  /** The number of the newest message. */
  lastSeq: z.number().int(),
  lastMessageAt: z.iso.datetime().nullable(),
  unreadCount: z.number().int(),
  markedUnread: z.boolean(),
  muted: z.boolean(),
  mutedUntil: z.iso.datetime().nullable(),
  archived: z.boolean(),
  /** How far the reader has read. */
  myLastReadSeq: z.number().int(),
  /** How far the other person's app has received. */
  otherDeliveredSeq: z.number().int(),
  /** How far the other person has read; null when either side switched read status off. */
  otherReadSeq: nullableNumber(),
});

export class ConversationDto extends createZodDto(conversation) {}

export class ConversationDetailDto extends createZodDto(
  conversation.extend({
    sendState: z.enum(SEND_STATES),
    blockedByMe: z.boolean(),
  }),
) {}

export class ConversationListQueryDto extends createZodDto(
  z.strictObject({
    archived: z.enum(['true', 'false']).default('false'),
    /** Part of the other person's name, at least 2 characters. */
    q: z.string().trim().min(2).max(100).optional(),
    cursor: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(CONVERSATIONS_PAGE_SIZE),
  }),
) {}

export class ConversationListDto extends createZodDto(
  z.strictObject({ items: z.array(conversation), nextCursor: nullableString() }),
) {}

export class StartConversationDto extends createZodDto(z.strictObject({ userId: z.uuid() })) {}

export class ConversationSettingsDto extends createZodDto(
  z
    .strictObject({
      mute: z.enum(MUTE_CHOICES).optional(),
      archived: z.boolean().optional(),
      /** "Mark as unread". Opening the conversation takes the mark off. */
      markedUnread: z.literal(true).optional(),
    })
    .refine((input) => Object.keys(input).length > 0, 'nothing to change'),
) {}

export class ReadDto extends createZodDto(
  z.strictObject({
    /** Read up to this message; everything, when left out. */
    seq: z.number().int().min(0).optional(),
  }),
) {}

const message = z.strictObject({
  id: z.uuid(),
  conversationId: z.uuid(),
  seq: z.number().int(),
  senderId: nullableString(),
  mine: z.boolean(),
  /** Plain text; empty for a deleted message. */
  body: z.string(),
  deleted: z.boolean(),
  editedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** The sender may still edit it. */
  canEdit: z.boolean(),
  replyTo: z
    .strictObject({
      id: z.uuid(),
      seq: z.number().int(),
      senderId: nullableString(),
      body: z.string(),
      deleted: z.boolean(),
    })
    .nullable(),
});

export class MessageDto extends createZodDto(message) {}

export class MessageListQueryDto extends createZodDto(
  z
    .strictObject({
      /** Messages older than this number, newest first. */
      before: z.coerce.number().int().min(1).optional(),
      /** Messages newer than this number, oldest first (catching up after a lost connection). */
      after: z.coerce.number().int().min(0).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(MESSAGES_PAGE_SIZE),
    })
    .refine((query) => query.before === undefined || query.after === undefined, {
      message: 'before and after can not be combined',
    }),
) {}

export class MessageListDto extends createZodDto(
  z.strictObject({
    /** Oldest first. */
    items: z.array(message),
    /** There are more in the direction that was asked for. */
    hasMore: z.boolean(),
  }),
) {}

export class SendMessageDto extends createZodDto(
  z.strictObject({ body: messageBody, replyToId: z.uuid().optional() }),
) {}

export class EditMessageDto extends createZodDto(z.strictObject({ body: messageBody })) {}

export class MessageSearchQueryDto extends createZodDto(
  z.strictObject({
    /** Words to find, at least 2 characters. */
    q: z.string().trim().min(2).max(100),
    /** Only in this conversation; in all of the reader's conversations when left out. */
    conversationId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  }),
) {}

export class MessageSearchDto extends createZodDto(
  z.strictObject({
    /** Newest first. */
    items: z.array(z.strictObject({ message, other: person })),
  }),
) {}

// --- Reports and suspensions (M11 plan §2.11, §2.14) --------------------------------------------

export class ReportCategoriesDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({ id: z.uuid(), key: z.string(), nameHe: z.string(), nameEn: z.string() }),
    ),
  }),
) {}

export class ReportInputDto extends createZodDto(
  z
    .strictObject({
      /** The message being reported; its sender is the person reported. */
      messageId: z.uuid().optional(),
      /** The person being reported, when no single message is. */
      userId: z.uuid().optional(),
      categoryId: z.uuid(),
      description: z.string().trim().max(2000).optional(),
    })
    .refine((input) => (input.messageId === undefined) !== (input.userId === undefined), {
      message: 'name a message or a person, not both',
    }),
) {}

export class ReportCreatedDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}

export const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'UPHELD'] as const;
export const REPORT_ACTIONS = ['NONE', 'MESSAGE_DELETED', 'SUSPENDED'] as const;
export const REPORTS_PAGE_SIZE = 20;

/** A person as staff see them in a report: the name and the account. */
const reportPerson = z.strictObject({
  id: nullableString(),
  firstName: nullableString(),
  lastName: nullableString(),
});

const snapshotMessage = z.strictObject({
  seq: z.number().int(),
  senderId: nullableString(),
  body: z.string(),
  deleted: z.boolean(),
  createdAt: z.iso.datetime(),
  /** The message the report is about. */
  reported: z.boolean(),
});
export type SnapshotMessage = z.infer<typeof snapshotMessage>;

const reportSummary = z.strictObject({
  id: z.uuid(),
  status: z.enum(REPORT_STATUSES),
  action: z.enum(REPORT_ACTIONS),
  category: z.strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() }),
  reporter: reportPerson,
  reported: reportPerson,
  /** About a message (true) or about a person as such. */
  aboutMessage: z.boolean(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});

export class AdminReportListQueryDto extends createZodDto(
  z.strictObject({
    status: z.enum(REPORT_STATUSES).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
  }),
) {}

export class AdminReportListDto extends createZodDto(
  z.strictObject({
    items: z.array(reportSummary),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class AdminReportDto extends createZodDto(
  reportSummary.extend({
    description: nullableString(),
    /**
     * The reported message and up to five before and after it, as they were when it was
     * reported. Empty for a report about a person, and once the kept copy has been erased.
     */
    messages: z.array(snapshotMessage),
    reviewer: reportPerson,
    resolution: nullableString(),
    /** The reported person is suspended from chat now. */
    reportedSuspended: z.boolean(),
    /** The reader may decide on it: it is open, and they are neither of its two people. */
    canResolve: z.boolean(),
  }),
) {}

const reason = z.string().trim().min(3).max(1000);
/** How long a suspension lasts; null means until it is lifted. */
const suspensionDays = z.number().int().min(1).max(365).nullable();

export class ResolveReportDto extends createZodDto(
  z
    .strictObject({
      decision: z.enum(['dismiss', 'deleteMessage', 'suspend']),
      reason,
      days: suspensionDays.optional(),
    })
    .refine((input) => (input.decision === 'suspend') === (input.days !== undefined), {
      message: 'days go with a suspension, and only with one',
    }),
) {}

const suspension = z.strictObject({
  id: z.uuid(),
  user: reportPerson,
  reason: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  liftedAt: z.iso.datetime().nullable(),
  /** In force now. */
  active: z.boolean(),
});

export class AdminSuspensionListQueryDto extends createZodDto(
  z.strictObject({ page: z.coerce.number().int().min(1).max(500).default(1) }),
) {}

export class AdminSuspensionListDto extends createZodDto(
  z.strictObject({
    items: z.array(suspension),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class AdminSuspensionDto extends createZodDto(suspension) {}

export class SuspendInputDto extends createZodDto(
  z.strictObject({ userId: z.uuid(), reason, days: suspensionDays }),
) {}

export class LiftSuspensionDto extends createZodDto(z.strictObject({ reason })) {}

/** A person's chat settings (M11 plan §2.12). */
export class ChatSettingsDto extends createZodDto(
  z.strictObject({
    /** Who can start a conversation with me: listed members' peers, or nobody. */
    audience: z.enum(['LISTED', 'NOBODY']),
    /** Show others when I have read their messages (and see it for theirs). */
    readReceipts: z.boolean(),
    /** Show others when I am typing. */
    typing: z.boolean(),
  }),
) {}

export class ChatPeopleQueryDto extends createZodDto(
  z.strictObject({
    /** Part of a name, at least 2 characters. */
    q: z.string().trim().min(2).max(100),
  }),
) {}

const reachablePerson = z.strictObject({
  id: z.uuid(),
  firstName: nullableString(),
  lastName: nullableString(),
  title: nullableString(),
  photoFileId: nullableString(),
});

export class ChatPeopleDto extends createZodDto(
  z.strictObject({ items: z.array(reachablePerson) }),
) {}

export class BlockInputDto extends createZodDto(z.strictObject({ userId: z.uuid() })) {}

export class BlockListDto extends createZodDto(
  z.strictObject({
    items: z.array(z.strictObject({ user: person, createdAt: z.iso.datetime() })),
  }),
) {}

export class UnreadCountDto extends createZodDto(
  z.strictObject({
    /** Conversations with something unread, leaving out muted and archived ones. */
    conversations: z.number().int(),
  }),
) {}
