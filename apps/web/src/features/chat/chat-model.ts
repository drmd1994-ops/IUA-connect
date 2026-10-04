import type { components } from '@iua/api-client';

export type Conversation = components['schemas']['ConversationListDto']['items'][number];
export type ConversationDetail = components['schemas']['ConversationDetailDto'];
export type Message = components['schemas']['MessageDto'];
export type Person = Conversation['other'];

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
