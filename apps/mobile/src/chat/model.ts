import type { components } from '@iua/api-client';
import type { Message } from '@iua/api-client/chat';

/**
 * What the app's chat decides without the phone or the server. The rules both front ends share
 * (names, ticks, mentions, merging messages) come from the API client package; here is only
 * what the app adds: one screen serves a private conversation, a group and a room, so the three
 * are told apart in one place.
 */

export type ThreadKind = 'direct' | 'group' | 'room';
export type ConversationDetail = components['schemas']['ConversationDetailDto'];
export type GroupDetail = components['schemas']['GroupDto'];
export type RoomDetail = components['schemas']['RoomDetailDto'];

export type Thread =
  | { kind: 'direct'; detail: ConversationDetail }
  | { kind: 'group'; detail: GroupDetail }
  | { kind: 'room'; detail: RoomDetail };

export function isThreadKind(value: unknown): value is ThreadKind {
  return value === 'direct' || value === 'group' || value === 'room';
}

/** The API address of a thread; messages, reading and typing hang under it. */
export function threadPath(kind: ThreadKind, id: string): string {
  const part = kind === 'direct' ? 'conversations' : kind === 'group' ? 'groups' : 'rooms';
  return `/api/v1/chat/${part}/${encodeURIComponent(id)}`;
}

/** The screen of a thread in the app. */
export function threadRoute(kind: ThreadKind, id: string): string {
  return `/thread/${kind}/${encodeURIComponent(id)}`;
}

/** A line of the conversations list is a private conversation or a group. */
export function listKind(kind: 'DIRECT' | 'GROUP'): ThreadKind {
  return kind === 'GROUP' ? 'group' : 'direct';
}

/** Whether the reader may write here now. A room that was not joined is read-only. */
export function canWrite(thread: Thread): boolean {
  return thread.detail.sendState === 'none';
}

export type MessageAction =
  | 'reply'
  | 'forward'
  | 'copy'
  | 'edit'
  | 'deleteAll'
  | 'deleteMine'
  | 'report'
  | 'pin'
  | 'unpin'
  | 'remove'
  | 'removePerson'
  | 'banPerson';

/**
 * What the reader may do with a message, in the order it is offered. Nothing else is listed;
 * the API decides again when the action is sent.
 */
export function messageActions(
  message: Pick<Message, 'id' | 'mine' | 'deleted' | 'canEdit' | 'senderId' | 'body'>,
  context: { kind: ThreadKind; canWrite: boolean; canModerate: boolean; pinned: boolean },
): MessageAction[] {
  const actions: MessageAction[] = [];
  const live = !message.deleted;
  if (live && context.canWrite) actions.push('reply');
  if (live) actions.push('forward');
  if (live && message.body) actions.push('copy');
  if (message.canEdit) actions.push('edit');
  if (message.mine && live) actions.push('deleteAll');
  actions.push('deleteMine');
  if (!message.mine && message.senderId && live) actions.push('report');
  if (context.kind === 'room' && context.canModerate) {
    if (live) actions.push(context.pinned ? 'unpin' : 'pin');
    if (live && !message.mine) actions.push('remove');
    if (!message.mine && message.senderId) actions.push('removePerson', 'banPerson');
  }
  return actions;
}

/** A picked file as the upload needs it. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

const ALLOWED: Record<string, 'IMAGE' | 'DOCUMENT' | 'VIDEO'> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'application/pdf': 'DOCUMENT',
  'video/mp4': 'VIDEO',
};

/** The kind of a picked file, or null when chat does not carry that type. */
export function attachmentKind(mimeType: string | null | undefined) {
  return ALLOWED[(mimeType ?? '').toLowerCase()] ?? null;
}

/** A name for a picked file that came without one (the camera gives none). */
export function fileName(uri: string, mimeType: string, given?: string | null): string {
  if (given?.trim()) return given.trim();
  const last = uri.split(/[/\\]/).pop()?.split('?')[0] ?? '';
  if (/\.[a-z0-9]{2,5}$/i.test(last)) return last;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }[mimeType];
  return `file.${extension ?? 'mp4'}`;
}

/** Days of a ban as typed: empty means until lifted; otherwise 1 to 365, or not valid. */
export function banDays(typed: string): { ok: true; days: number | null } | { ok: false } {
  const text = typed.trim();
  if (text === '') return { ok: true, days: null };
  if (!/^\d{1,3}$/.test(text)) return { ok: false };
  const days = Number(text);
  return days >= 1 && days <= 365 ? { ok: true, days } : { ok: false };
}

/** Cuts what arrived of a text/event-stream into whole blocks and what is still incomplete. */
export function takeBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  return { blocks: parts.filter((block) => block.trim() !== ''), rest };
}
