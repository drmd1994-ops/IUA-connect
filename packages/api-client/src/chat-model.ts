import type { components } from './schema';

export type Conversation = components['schemas']['ConversationListDto']['items'][number];
export type ConversationDetail = components['schemas']['ConversationDetailDto'];
export type Message = components['schemas']['MessageDto'];
export type Room = components['schemas']['RoomListDto']['items'][number];
export type RoomDetail = components['schemas']['RoomDetailDto'];
export type Person = Conversation['other'];
export type Group = components['schemas']['GroupDto'];
export type Invitation = components['schemas']['InvitationListDto']['items'][number];
export type Attachment = Message['attachments'][number];
export type Activity = components['schemas']['ActivityDto']['items'][number]['activity'];

/** A message carries at most this many files, of which at most one video (M13). */
export const MAX_ATTACHMENTS = 3;

/** Whether one more file of this kind may join the ones already chosen for a message. */
export function canAttach(chosen: readonly { kind: string }[], kind: string): boolean {
  if (chosen.length >= MAX_ATTACHMENTS) return false;
  return kind !== 'VIDEO' || !chosen.some((file) => file.kind === 'VIDEO');
}

/** Where a conversation of each kind is opened. */
export function conversationPath(kind: 'DIRECT' | 'GROUP' | 'ROOM', id: string): string {
  return kind === 'GROUP'
    ? `/chat/groups/${id}`
    : kind === 'ROOM'
      ? `/chat/rooms/${id}`
      : `/chat/${id}`;
}

export const MESSAGE_MAX_LENGTH = 4000;

/** "First Last", or null when the person has no name to show (a deleted account). */
export function personName(person: Pick<Person, 'firstName' | 'lastName'>): string | null {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

/** The first letters of the name, for the circle shown when there is no photo. */
export function initials(person: Pick<Person, 'firstName' | 'lastName'>): string {
  return [person.firstName, person.lastName]
    .map((part) => [...(part ?? '').trim()][0] ?? '')
    .join('')
    .toUpperCase();
}

export type MessageStatus = 'sent' | 'delivered' | 'read';

/**
 * How far a message the reader sent has got, from the other person's two markers. "Read" is
 * unknown (null) when either side switched read status off; the message is then "delivered".
 */
export function messageStatus(
  seq: number,
  conversation: Pick<Conversation, 'otherDeliveredSeq' | 'otherReadSeq'>,
): MessageStatus {
  if (conversation.otherReadSeq !== null && seq <= conversation.otherReadSeq) return 'read';
  if (seq <= conversation.otherDeliveredSeq) return 'delivered';
  return 'sent';
}

/** Local calendar day of a time, for the date lines between messages. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/**
 * A message's text cut into plain pieces and web addresses, in order. Punctuation that ends a
 * sentence is not part of the address before it.
 */
export function textParts(text: string): { text: string; link: boolean }[] {
  return text
    .split(URL_PATTERN)
    .filter((part) => part !== '')
    .flatMap((part) => {
      if (!/^https?:\/\//.test(part)) return [{ text: part, link: false }];
      const [, address, trailing] = /^(.*?)([.,;:!?)\]]*)$/.exec(part)!;
      return [
        { text: address!, link: true },
        ...(trailing ? [{ text: trailing, link: false }] : []),
      ];
    });
}

export type Reaction = Message['reactions'][number]['reaction'];

/** The fixed set of reactions, in the order they are offered (M12 plan, owner answer 5). */
export const REACTIONS: readonly Reaction[] = ['like', 'heart', 'laugh', 'wow', 'thanks', 'check'];

export const REACTION_EMOJI: Record<Reaction, string> = {
  like: '👍',
  heart: '❤️',
  laugh: '😂',
  wow: '😮',
  thanks: '🙏',
  check: '✅',
};

export type MessagePart = { text: string; kind: 'text' | 'link' | 'mention' };

/**
 * A message's text cut into plain pieces, web addresses and mentions ("@First Last" of the
 * people the message mentions), in order.
 */
export function messageParts(text: string, mentionNames: readonly string[]): MessagePart[] {
  const tokens = [...new Set(mentionNames)]
    .filter(Boolean)
    .map((name) => `@${name}`)
    // The longer name first, so "@Dana Levi" is not cut at "@Dana".
    .sort((a, b) => b.length - a.length);
  return textParts(text).flatMap((part): MessagePart[] => {
    if (part.link) return [{ text: part.text, kind: 'link' }];
    if (tokens.length === 0) return [{ text: part.text, kind: 'text' }];
    const pieces: MessagePart[] = [];
    let rest = part.text;
    while (rest.length > 0) {
      let at = -1;
      let found = '';
      for (const token of tokens) {
        const index = rest.indexOf(token);
        if (index !== -1 && (at === -1 || index < at)) {
          at = index;
          found = token;
        }
      }
      if (at === -1) {
        pieces.push({ text: rest, kind: 'text' });
        break;
      }
      if (at > 0) pieces.push({ text: rest.slice(0, at), kind: 'text' });
      pieces.push({ text: found, kind: 'mention' });
      rest = rest.slice(at + found.length);
    }
    return pieces;
  });
}

/**
 * The "@…" being typed just before the cursor, if any: where it starts and what was typed
 * after the "@" (at least one character, at most thirty, on one line).
 */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@][^@\n]{0,29})$/.exec(before);
  if (!match) return null;
  const query = match[2]!;
  // Two words at most: a first and a last name.
  if (query.trim().split(/\s+/).length > 2 || /\s$/.test(query)) return null;
  return { start: before.length - query.length - 1, query };
}

/** Adds or replaces messages by id and keeps them in order. */
export function mergeMessages(current: readonly Message[], incoming: readonly Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * What the server tells an open chat page (docs/plans/M11-chat.md §6). An event names ids
 * only; the page then asks for what it may see. "refresh" is also made up here, whenever the
 * page can't know what it missed (after a reconnection, or while the stream is unavailable).
 */
export interface ChatEvent {
  type:
    | 'message.new'
    | 'message.edited'
    | 'message.deleted'
    | 'markers'
    | 'typing'
    | 'room'
    | 'room.left'
    | 'invitation'
    | 'activity'
    | 'refresh'
    | 'ping';
  conversationId?: string;
  messageId?: string;
  seq?: number;
  userId?: string;
}

/** One block of a text/event-stream, as the event it carries. */
export function parseEvent(block: string): ChatEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Partial<ChatEvent>;
    return typeof parsed.type === 'string' ? (parsed as ChatEvent) : null;
  } catch {
    return null;
  }
}
