import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableNumber, nullableString } from '../../common/dto/nullable-string';
import { organisationRefSchema } from '../organisations';
import {
  CONVERSATIONS_PAGE_SIZE,
  MESSAGES_PAGE_SIZE,
  ACTIVITY_LABELS,
  GROUP_MAX_MEMBERS,
  GROUP_SEND_STATES,
  MAX_ATTACHMENTS,
  MAX_MENTIONS,
  MESSAGE_MAX_LENGTH,
  MUTE_CHOICES,
  REACTIONS,
  ROOMS_PAGE_SIZE,
  ROOM_MEMBERS_PAGE_SIZE,
  ROOM_SEND_STATES,
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

/** The text of a message that may also be only files: plain text, possibly empty. */
const optionalBody = z
  .string()
  .trim()
  .max(MESSAGE_MAX_LENGTH)
  .refine((text) => !text.includes('\u0000'), 'must not contain the NUL character')
  .default('');

/** Files uploaded with POST /chat/attachments, to send with the message (M13). */
const attachmentIds = z.array(z.uuid()).max(MAX_ATTACHMENTS).optional();

/** A message needs a text or a file. */
const textOrFiles = (input: { body: string; attachmentIds?: string[] | undefined }) =>
  input.body.length > 0 || (input.attachmentIds?.length ?? 0) > 0;
const TEXT_OR_FILES = { message: 'a message needs a text or a file', path: ['body'] };

/** The other person, as the reader may see them. All empty for a deleted account. */
const person = z.strictObject({
  id: nullableString(),
  firstName: nullableString(),
  lastName: nullableString(),
  photoFileId: nullableString(),
  /** Their page in the member directory can be opened. */
  listed: z.boolean(),
  /** A medical student or a resident (M17); null for anyone else. */
  mark: z.enum(['STUDENT', 'RESIDENT']).nullable(),
});

const lastMessage = z.strictObject({
  id: z.uuid(),
  seq: z.number().int(),
  senderId: nullableString(),
  /** The start of the text; empty for a deleted message. */
  body: z.string(),
  deleted: z.boolean(),
  /** How many files it carries (M13). */
  files: z.number().int(),
  createdAt: z.iso.datetime(),
});

const conversation = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['DIRECT', 'GROUP']),
  /** The other person of a private conversation; all empty for a group. */
  other: person,
  /** A group's name and size; null for a private conversation (M13). */
  group: z.strictObject({ name: z.string(), memberCount: z.number().int() }).nullable(),
  /** Pinned to the top of the reader's list (M13). */
  pinned: z.boolean(),
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
      /** Pin to the top of my list, or take it down. Five at most (M13). */
      pinned: z.boolean().optional(),
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
  /** Who wrote it, as the reader may see them. */
  sender: person,
  mine: z.boolean(),
  /** Plain text; empty for a deleted message. */
  body: z.string(),
  deleted: z.boolean(),
  /** Deleted by a moderator or by staff, not by its sender. */
  removedByModerator: z.boolean(),
  /** Marked as an announcement by a moderator (rooms). */
  announcement: z.boolean(),
  /** The reader blocked its sender: the page folds it (rooms). */
  senderBlocked: z.boolean(),
  /** The people mentioned in it (rooms). */
  mentions: z.array(
    z.strictObject({ id: z.uuid(), firstName: nullableString(), lastName: nullableString() }),
  ),
  /** A copy of a message from elsewhere; it doesn't say whose (M13). */
  forwarded: z.boolean(),
  /** Pictures, PDF and video sent with it; none for a deleted message (M13). */
  attachments: z.array(
    z.strictObject({
      id: z.uuid(),
      kind: z.enum(['IMAGE', 'DOCUMENT', 'VIDEO']),
      mimeType: z.string(),
      name: z.string(),
      sizeBytes: z.number().int(),
      width: nullableNumber(),
      height: nullableNumber(),
    }),
  ),
  /** The reactions somebody used, in the fixed order, with the reader's own marked. */
  reactions: z.array(
    z.strictObject({ reaction: z.enum(REACTIONS), count: z.number().int(), mine: z.boolean() }),
  ),
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
      /** The messages around this number: a found message in its place (M13). */
      around: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(MESSAGES_PAGE_SIZE),
    })
    .refine(
      (query) =>
        [query.before, query.after, query.around].filter((value) => value !== undefined).length <=
        1,
      { message: 'before, after and around can not be combined' },
    ),
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
  z
    .strictObject({ body: optionalBody, replyToId: z.uuid().optional(), attachmentIds })
    .refine(textOrFiles, TEXT_OR_FILES),
) {}

/** Where a copy of a message goes: a conversation, group or room the sender is in (M13). */
export class ForwardDto extends createZodDto(z.strictObject({ conversationId: z.uuid() })) {}

export class EditMessageDto extends createZodDto(z.strictObject({ body: messageBody })) {}

export class MessageSearchQueryDto extends createZodDto(
  z.strictObject({
    /** Words to find, at least 2 characters. */
    q: z.string().trim().min(2).max(100),
    /** Only in this conversation; in all of the reader's conversations when left out. */
    conversationId: z.uuid().optional(),
    /** Only what this person wrote (M13). */
    senderId: z.uuid().optional(),
    /** Only messages sent on or after this day, and on or before that one (M13). */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  }),
) {}

export class MessageSearchDto extends createZodDto(
  z.strictObject({
    /** Newest first. */
    items: z.array(
      z.strictObject({
        message,
        /** The other person of a private conversation; all empty for a message in a room. */
        other: person,
        /** The room the message is in; null in a private conversation. */
        room: z
          .strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: nullableString() })
          .nullable(),
        /** The group the message is in; null otherwise (M13). */
        group: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
      }),
    ),
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
      /** The room being reported as such (M12). */
      roomId: z.uuid().optional(),
      categoryId: z.uuid(),
      description: z.string().trim().max(2000).optional(),
    })
    .refine(
      (input) =>
        [input.messageId, input.userId, input.roomId].filter((id) => id !== undefined).length === 1,
      { message: 'name one thing: a message, a person or a room' },
    ),
) {}

export class ReportCreatedDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}

export const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'UPHELD'] as const;
export const REPORT_ACTIONS = ['NONE', 'MESSAGE_DELETED', 'SUSPENDED', 'ROOM_ARCHIVED'] as const;
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
  /** How many files it carried. The files themselves are not kept with a report (M13). */
  files: z.number().int().optional(),
});
export type SnapshotMessage = z.infer<typeof snapshotMessage>;

const reportSummary = z.strictObject({
  id: z.uuid(),
  status: z.enum(REPORT_STATUSES),
  action: z.enum(REPORT_ACTIONS),
  category: z.strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() }),
  reporter: reportPerson,
  reported: reportPerson,
  /** About a message (true) or about a person or a room as such. */
  aboutMessage: z.boolean(),
  /** The room the report is about, or the room the reported message is in; null otherwise. */
  room: z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: nullableString() }).nullable(),
  /** About a room as such (M12). */
  aboutRoom: z.boolean(),
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
      decision: z.enum(['dismiss', 'deleteMessage', 'suspend', 'archiveRoom']),
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
    /** Who can invite me to a group or a room by invitation (M13). */
    invitesFrom: z.enum(['LISTED', 'CONTACTS', 'NOBODY']).default('LISTED'),
    /** Show the people I talk with when I am active, and see it for them (M13). */
    showActivity: z.boolean().default(true),
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

export class ChatUnreadCountDto extends createZodDto(
  z.strictObject({
    /** Conversations with something unread, leaving out muted and archived ones. */
    conversations: z.number().int(),
    /** The reader has chat: an active membership, or conversations from when they had one. */
    enabled: z.boolean(),
  }),
) {}

// --- Rooms (M12) ---------------------------------------------------------------------------------

export class ReactionParamsDto extends createZodDto(
  z.strictObject({ id: z.uuid(), reaction: z.enum(REACTIONS) }),
) {}

const roomCategory = z.strictObject({
  id: z.uuid(),
  key: z.string(),
  nameHe: z.string(),
  nameEn: z.string(),
});

/** A room as a reader sees it in a list. What is theirs alone is empty until they join. */
const room = z.strictObject({
  id: z.uuid(),
  /** Whose room it is: an organisation's, for its members; null: the platform's own. */
  organisation: organisationRefSchema.nullable(),
  nameHe: z.string(),
  nameEn: nullableString(),
  descriptionHe: nullableString(),
  descriptionEn: nullableString(),
  category: roomCategory.nullable(),
  pictureFileId: nullableString(),
  memberCount: z.number().int(),
  /** An announcements room: only moderators write. */
  moderatorsOnly: z.boolean(),
  /** Locked now by a moderator. */
  locked: z.boolean(),
  lockedUntil: z.iso.datetime().nullable(),
  archived: z.boolean(),
  /** Joined by invitation only; not listed in "Browse rooms" (M13). */
  inviteOnly: z.boolean(),
  /** Pinned to the top of the reader's list (M13). */
  pinned: z.boolean(),
  createdAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime().nullable(),
  /** The reader's place in the room: not in it, a member, or a moderator. */
  role: z.enum(['NONE', 'MEMBER', 'MODERATOR']),
  unreadCount: z.number().int(),
  markedUnread: z.boolean(),
  muted: z.boolean(),
  mutedUntil: z.iso.datetime().nullable(),
});

export class RoomListQueryDto extends createZodDto(
  z.strictObject({
    /** Part of the room's name, at least 2 characters. */
    q: z.string().trim().min(2).max(100).optional(),
    categoryId: z.uuid().optional(),
    /** When browsing: only the rooms of this organisation. */
    organisation: z.uuid().optional(),
    cursor: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(ROOMS_PAGE_SIZE),
  }),
) {}

export class RoomListDto extends createZodDto(
  z.strictObject({ items: z.array(room), nextCursor: nullableString() }),
) {}

export class RoomDetailDto extends createZodDto(
  room.extend({
    lastSeq: z.number().int(),
    myLastReadSeq: z.number().int(),
    /** Whether the reader can write here, and if not, why. */
    sendState: z.enum(ROOM_SEND_STATES),
    /** The reader may moderate: a moderator of this room, or staff. */
    canModerate: z.boolean(),
    /** The reader is banned from this room and can't join it. */
    banned: z.boolean(),
    moderators: z.array(person),
  }),
) {}

export class RoomCategoriesDto extends createZodDto(
  z.strictObject({ items: z.array(roomCategory) }),
) {}

export class RoomSettingsDto extends createZodDto(
  z
    .strictObject({
      mute: z.enum(MUTE_CHOICES).optional(),
      markedUnread: z.literal(true).optional(),
      pinned: z.boolean().optional(),
    })
    .refine((input) => Object.keys(input).length > 0, 'nothing to change'),
) {}

export class RoomSendDto extends createZodDto(
  z
    .strictObject({
      body: optionalBody,
      replyToId: z.uuid().optional(),
      /** People mentioned in the text; each must be in the room. */
      mentions: z.array(z.uuid()).max(MAX_MENTIONS).optional(),
      /** Moderators only: the message stands out and the room is told. */
      announcement: z.boolean().optional(),
      attachmentIds,
    })
    .refine(textOrFiles, TEXT_OR_FILES),
) {}

export class RoomMembersQueryDto extends createZodDto(
  z.strictObject({
    /** Part of a name, at least 1 character (for "@" suggestions). */
    q: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
  }),
) {}

export class RoomMembersDto extends createZodDto(
  z.strictObject({
    items: z.array(person.extend({ role: z.enum(['MEMBER', 'MODERATOR']) })),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.literal(ROOM_MEMBERS_PAGE_SIZE),
  }),
) {}

export class RoomPinsDto extends createZodDto(
  z.strictObject({
    /** Newest pin first. */
    items: z.array(z.strictObject({ message, pinnedAt: z.iso.datetime() })),
  }),
) {}

export class RoomLockDto extends createZodDto(
  z.strictObject({
    /** For how long; left out or null means until a moderator unlocks it. */
    minutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60)
      .nullable()
      .optional(),
  }),
) {}

export class RoomRemoveDto extends createZodDto(z.strictObject({ reason })) {}

export class RoomBanInputDto extends createZodDto(
  z.strictObject({ userId: z.uuid(), reason, days: suspensionDays }),
) {}

const ban = z.strictObject({
  id: z.uuid(),
  user: reportPerson,
  reason: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  liftedAt: z.iso.datetime().nullable(),
  /** In force now. */
  active: z.boolean(),
});

export class RoomBanDto extends createZodDto(ban) {}

export class RoomBanListDto extends createZodDto(z.strictObject({ items: z.array(ban) })) {}

// --- Rooms in the admin area (M12 plan §2.9) ------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export class AdminRoomInputDto extends createZodDto(
  z.strictObject({
    /**
     * Whose room it is: an organisation's, or null for the platform's own. Said when the room
     * is opened and never changed; may be left out when it can only be one.
     */
    organisationId: z.uuid().nullable().optional(),
    nameHe: z.string().trim().min(2).max(120),
    nameEn: optionalText(120),
    descriptionHe: optionalText(1000),
    descriptionEn: optionalText(1000),
    categoryId: z.uuid().nullable().optional(),
    /** An image staff uploaded (POST /files). */
    pictureFileId: z.uuid().nullable().optional(),
    moderatorsOnly: z.boolean().default(false),
    /** Joined by invitation only (M13). */
    inviteOnly: z.boolean().default(false),
  }),
) {}

const adminRoom = z.strictObject({
  id: z.uuid(),
  organisation: organisationRefSchema.nullable(),
  nameHe: z.string(),
  nameEn: nullableString(),
  descriptionHe: nullableString(),
  descriptionEn: nullableString(),
  category: roomCategory.nullable(),
  pictureFileId: nullableString(),
  memberCount: z.number().int(),
  moderatorsOnly: z.boolean(),
  inviteOnly: z.boolean(),
  locked: z.boolean(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime().nullable(),
  moderators: z.array(reportPerson),
});

export class AdminRoomDto extends createZodDto(adminRoom) {}

export class AdminRoomListQueryDto extends createZodDto(
  z.strictObject({
    q: z.string().trim().min(2).max(100).optional(),
    /** Only this organisation's rooms. Left out: all the reader manages. */
    organisation: z.uuid().optional(),
    archived: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
  }),
) {}

export class AdminRoomListDto extends createZodDto(
  z.strictObject({
    items: z.array(adminRoom),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class ModeratorInputDto extends createZodDto(z.strictObject({ userId: z.uuid() })) {}

const categoryKey = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'capital letters, digits and underscores');

export class RoomCategoryInputDto extends createZodDto(
  z.strictObject({
    nameHe: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  }),
) {}

export class RoomCategoryCreateDto extends createZodDto(
  z.strictObject({
    key: categoryKey,
    nameHe: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  }),
) {}

const adminRoomCategory = roomCategory.extend({
  sortOrder: z.number().int(),
  /** How many rooms use it; a category in use can't be deleted. */
  rooms: z.number().int(),
});

export class AdminRoomCategoryDto extends createZodDto(adminRoomCategory) {}

export class AdminRoomCategoriesDto extends createZodDto(
  z.strictObject({ items: z.array(adminRoomCategory) }),
) {}

const adminReportCategory = z.strictObject({
  id: z.uuid(),
  key: z.string(),
  nameHe: z.string(),
  nameEn: z.string(),
  sortOrder: z.number().int(),
  /** Offered to members when they report. A reason that was used is switched off, not deleted. */
  active: z.boolean(),
});

export class AdminReportCategoryDto extends createZodDto(adminReportCategory) {}

export class AdminReportCategoriesDto extends createZodDto(
  z.strictObject({ items: z.array(adminReportCategory) }),
) {}

export class ReportCategoryInputDto extends createZodDto(
  z.strictObject({
    nameHe: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  }),
) {}

export class ReportCategoryCreateDto extends createZodDto(
  z.strictObject({
    key: categoryKey,
    nameHe: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  }),
) {}

// --- Groups, invitations, activity (M13) ---------------------------------------------------------

const groupName = z.string().trim().min(2).max(80);

/** A group as one of its people sees it. */
const group = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  memberCount: z.number().int(),
  createdAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime().nullable(),
  lastSeq: z.number().int(),
  myLastReadSeq: z.number().int(),
  /** The reader runs the group, or is one of its people. */
  role: z.enum(['MEMBER', 'ADMIN']),
  unreadCount: z.number().int(),
  markedUnread: z.boolean(),
  muted: z.boolean(),
  mutedUntil: z.iso.datetime().nullable(),
  archived: z.boolean(),
  pinned: z.boolean(),
  /** Whether the reader can write here, and if not, why. */
  sendState: z.enum(GROUP_SEND_STATES),
});

export class GroupDto extends createZodDto(group) {}

export class GroupCreateDto extends createZodDto(
  z.strictObject({
    name: groupName,
    /** The people to invite. Each gets an invitation; nobody is added without accepting. */
    userIds: z
      .array(z.uuid())
      .max(GROUP_MAX_MEMBERS - 1)
      .default([]),
  }),
) {}

export class GroupRenameDto extends createZodDto(z.strictObject({ name: groupName })) {}

export class GroupMembersQueryDto extends createZodDto(
  z.strictObject({
    /** Part of a name (for "@" suggestions). */
    q: z.string().trim().min(1).max(100).optional(),
  }),
) {}

export class GroupMembersDto extends createZodDto(
  z.strictObject({
    /** The admin first. A group is small, so this is everyone. */
    items: z.array(person.extend({ role: z.enum(['MEMBER', 'ADMIN']) })),
  }),
) {}

export class GroupAdminDto extends createZodDto(z.strictObject({ userId: z.uuid() })) {}

export class InviteDto extends createZodDto(
  z.strictObject({ userIds: z.array(z.uuid()).min(1).max(GROUP_MAX_MEMBERS) }),
) {}

export class InviteePeopleQueryDto extends createZodDto(
  z.strictObject({
    /** Part of a name, at least 2 characters. */
    q: z.string().trim().min(2).max(100),
    /** Leaves out people already in this group or room, or already invited to it. */
    conversationId: z.uuid().optional(),
  }),
) {}

const invitation = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['GROUP', 'ROOM']),
  conversationId: z.uuid(),
  /** A group's name, or a room's Hebrew name. */
  name: z.string(),
  nameEn: nullableString(),
  memberCount: z.number().int(),
  invitedBy: person,
  /** The people of a group, so the invited person knows who they would join. Empty for a room. */
  members: z.array(person),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export class InvitationDto extends createZodDto(invitation) {}

export class InvitationListDto extends createZodDto(
  z.strictObject({ items: z.array(invitation) }),
) {}

/** The invitations to one group or room that nobody answered yet, for whoever may invite there. */
export class SentInvitationsDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        user: person,
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
      }),
    ),
  }),
) {}

export class AcceptedInvitationDto extends createZodDto(
  z.strictObject({ kind: z.enum(['GROUP', 'ROOM']), conversationId: z.uuid() }),
) {}

export class ActivityQueryDto extends createZodDto(
  z.strictObject({
    /** Up to fifty ids, separated by commas. */
    userIds: z
      .string()
      .max(2000)
      .transform((value) => value.split(',').filter(Boolean))
      .pipe(z.array(z.uuid()).min(1).max(50)),
  }),
) {}

export class ActivityDto extends createZodDto(
  z.strictObject({
    /**
     * Only people the reader shares a conversation or a group with, who show their activity,
     * and only when the reader shows theirs. Everyone else is simply not in the answer.
     */
    items: z.array(z.strictObject({ userId: z.uuid(), activity: z.enum(ACTIVITY_LABELS) })),
  }),
) {}
