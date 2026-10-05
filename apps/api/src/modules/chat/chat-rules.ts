/**
 * The rules of chat that need no database (M11 plan §3): the edit window, mutes, the ordered
 * pair of a direct conversation, and the short quotes shown in lists and replies.
 */

/** A message can be edited by its sender for this long after it was sent. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MESSAGE_MAX_LENGTH = 4000;
/** The start of a message shown in the conversation list and in a reply's quote. */
export const PREVIEW_LENGTH = 160;
export const MESSAGES_PAGE_SIZE = 50;
export const CONVERSATIONS_PAGE_SIZE = 30;

/** The fixed set of reactions, in the order they are shown (M12 plan, owner answer 5). */
export const REACTIONS = ['like', 'heart', 'laugh', 'wow', 'thanks', 'check'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** A room holds at most this many pinned messages, and a message this many mentions. */
export const MAX_PINS = 5;
export const MAX_MENTIONS = 10;
export const ROOMS_PAGE_SIZE = 30;
export const ROOM_MEMBERS_PAGE_SIZE = 50;

// --- Groups, invitations, activity, files (M13) -------------------------------------------------

/** A group holds at most this many people (M13 plan, owner answer 3). */
export const GROUP_MAX_MEMBERS = 50;
/** A person pins at most this many conversations to the top of their list. */
export const MAX_PINNED_CONVERSATIONS = 5;
/** An invitation nobody answered ends after this long. */
export const INVITATION_DAYS = 30;
/** A message carries at most this many files, of which at most one video. */
export const MAX_ATTACHMENTS = 3;
/** "Last active" is written at most this often. */
export const ACTIVITY_WRITE_EVERY_MS = 10 * 60 * 1000;

export const GROUP_SEND_STATES = ['none', 'membersOnly', 'suspended'] as const;
export type GroupSendState = (typeof GROUP_SEND_STATES)[number];

export const ACTIVITY_LABELS = ['online', 'today', 'week', 'earlier'] as const;
export type ActivityLabel = (typeof ACTIVITY_LABELS)[number];

/**
 * What others are told about when a person was last around: never a time, only "today",
 * "this week" or "a while ago" (M13 plan §3). Null when nothing is known.
 */
export function activityLabel(
  online: boolean,
  lastActiveAt: Date | null,
  now = new Date(),
): ActivityLabel | null {
  if (online) return 'online';
  if (!lastActiveAt) return null;
  const age = now.getTime() - lastActiveAt.getTime();
  if (age < 24 * 60 * 60 * 1000) return 'today';
  if (age < 7 * 24 * 60 * 60 * 1000) return 'week';
  return 'earlier';
}

/** What a message may carry: up to three files, one video at most, each only once. */
export function attachmentsAllowed(kinds: readonly string[]): boolean {
  return kinds.length <= MAX_ATTACHMENTS && kinds.filter((kind) => kind === 'VIDEO').length <= 1;
}

/** A lock with a time that has passed is no lock. */
export function lockActive(
  room: { locked: boolean; lockedUntil: Date | null },
  now = new Date(),
): boolean {
  return room.locked && (room.lockedUntil === null || room.lockedUntil > now);
}

export interface RoomWriter {
  /** Has an active membership of the association. */
  activeMember: boolean;
  /** Suspended from chat by staff. */
  suspended: boolean;
  /** In the room, and as what. Null when not in it. */
  role: 'MEMBER' | 'MODERATOR' | null;
}

export const ROOM_SEND_STATES = [
  'none',
  'notJoined',
  'membersOnly',
  'suspended',
  'archived',
  'locked',
  'moderatorsOnly',
] as const;
export type RoomSendState = (typeof ROOM_SEND_STATES)[number];

/** Whether a person can write in a room, and if not, why (M12 plan §3). */
export function roomSendState(
  room: {
    archivedAt: Date | null;
    locked: boolean;
    lockedUntil: Date | null;
    moderatorsOnly: boolean;
  },
  writer: RoomWriter,
  now = new Date(),
): RoomSendState {
  if (room.archivedAt) return 'archived';
  if (writer.role === null) return 'notJoined';
  if (!writer.activeMember) return 'membersOnly';
  if (writer.suspended) return 'suspended';
  if (writer.role === 'MODERATOR') return 'none';
  if (lockActive(room, now)) return 'locked';
  if (room.moderatorsOnly) return 'moderatorsOnly';
  return 'none';
}

export const MUTE_CHOICES = ['off', '8h', 'week', 'forever'] as const;
export type MuteChoice = (typeof MUTE_CHOICES)[number];

export function canEdit(
  message: { senderId: string | null; deletedAt: Date | null; createdAt: Date },
  userId: string,
  now = new Date(),
): boolean {
  return (
    message.senderId === userId &&
    message.deletedAt === null &&
    now.getTime() - message.createdAt.getTime() <= EDIT_WINDOW_MS
  );
}

/** What a mute choice stores: a timed mute has an end, "forever" has none. */
export function muteFor(
  choice: MuteChoice,
  now = new Date(),
): { muted: boolean; mutedUntil: Date | null } {
  switch (choice) {
    case 'off':
      return { muted: false, mutedUntil: null };
    case '8h':
      return { muted: true, mutedUntil: new Date(now.getTime() + 8 * 60 * 60 * 1000) };
    case 'week':
      return { muted: true, mutedUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
    case 'forever':
      return { muted: true, mutedUntil: null };
  }
}

/** A mute whose time has passed is no mute. */
export function muteActive(
  member: { muted: boolean; mutedUntil: Date | null },
  now = new Date(),
): boolean {
  return member.muted && (member.mutedUntil === null || member.mutedUntil > now);
}

/** The two people of a direct conversation, smaller id first (as the database stores them). */
export function pairOf(a: string, b: string): { userLowId: string; userHighId: string } {
  const [userLowId, userHighId] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return { userLowId: userLowId!, userHighId: userHighId! };
}

/** The start of a text on one line, cut at a whole character. */
export function preview(body: string, length = PREVIEW_LENGTH): string {
  const line = body.replace(/\s+/g, ' ').trim();
  const chars = [...line];
  return chars.length <= length ? line : `${chars.slice(0, length).join('')}…`;
}

/** An Idempotency-Key a client may send: printable ASCII, at most 100 characters. */
export function validIdempotencyKey(key: string): boolean {
  return /^[\x21-\x7e]{1,100}$/.test(key);
}
