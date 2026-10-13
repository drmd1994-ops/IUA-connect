import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DirectoryService } from '../profiles';
import { prepareQuery } from '../search';
import { ChatAccess } from './chat-access';
import { ChatMessages, MESSAGE_SELECT, type MessageRow, personView } from './chat-messages';
import { ChatNotifier } from './chat-notifier';
import {
  type MuteChoice,
  type Reaction,
  canEdit,
  muteActive,
  muteFor,
  pairOf,
  preview,
  validIdempotencyKey,
} from './chat-rules';
import { ChatStream } from './chat-stream';
import {
  type ConversationDetailDto,
  type ConversationDto,
  type ConversationListDto,
  type ConversationListQueryDto,
  type ConversationSettingsDto,
  type MessageDto,
  type MessageListDto,
  type MessageListQueryDto,
  type MessageSearchDto,
  type MessageSearchQueryDto,
} from './chat.dto';

/** What a forwarded message carries over: its text and its files, nothing about its writer. */
export interface ForwardedContent {
  body: string;
  fileIds: string[];
}

interface ConversationRow {
  id: string;
  kind: 'DIRECT' | 'GROUP';
  name: string | null;
  memberCount: number;
  pinnedAt: Date | null;
  activityAt: Date;
  lmFiles: number;
  lastSeq: number;
  lastMessageAt: Date | null;
  myLastReadSeq: number;
  markedUnread: boolean;
  muted: boolean;
  mutedUntil: Date | null;
  archivedAt: Date | null;
  otherId: string | null;
  otherReadSeq: number | null;
  otherDeliveredSeq: number | null;
  lmId: string | null;
  lmSeq: number | null;
  lmSenderId: string | null;
  lmBody: string | null;
  lmDeletedAt: Date | null;
  lmCreatedAt: Date | null;
  unreadCount: number;
}

/**
 * Private conversations and their messages (M11 plan §2–§5). Every method first finds the
 * reader's own membership of the conversation; a conversation or message the reader has no
 * part in is "not found", the same as one that never existed, whatever id is put in the
 * address. Rooms (M12) have their own service; the routes here answer "not found" for a room's
 * id, except the ones that act on a single message, which serve both.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccess,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly notifier: ChatNotifier,
    private readonly msgs: ChatMessages,
  ) {}

  // --- Conversations --------------------------------------------------------------------------

  /**
   * The reader's conversations that hold at least one message, newest activity first. Seeing
   * the list means the reader's app has received everything in it.
   */
  async list(principal: Principal, query: ConversationListQueryDto): Promise<ConversationListDto> {
    const me = principal.userId;
    await this.markDelivered(me);
    const archived = query.archived === 'true';
    const cursor = query.cursor ? parseCursor(query.cursor) : null;
    const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
    // A private conversation is listed once it holds a message; a group from the start.
    const listed = Prisma.sql`(c.kind = 'GROUP' OR (c.kind = 'DIRECT' AND c.last_seq > 0))
        AND (m.archived_at IS NOT NULL) = ${archived}`;
    // Pinned conversations lead the first page; the pages after it hold the rest.
    const apart = !archived && !pattern;
    const pinned =
      apart && !cursor
        ? await this.rows(me, Prisma.sql`${listed} AND m.pinned_at IS NOT NULL`, 10)
        : [];
    pinned.sort((a, b) => b.pinnedAt!.getTime() - a.pinnedAt!.getTime());
    const rows = await this.rows(
      me,
      Prisma.sql`${listed}
        ${apart ? Prisma.sql`AND m.pinned_at IS NULL` : Prisma.empty}
        ${
          cursor
            ? Prisma.sql`AND (coalesce(c.last_message_at, c.created_at), c.id)
                           < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
            : Prisma.empty
        }
        ${
          pattern
            ? Prisma.sql`AND (
                normalize_he(coalesce(c.name_he, '')) LIKE normalize_he(${pattern})
                OR EXISTS (
                  SELECT 1 FROM profiles p
                  WHERE p.user_id = o.user_id
                    AND (
                      normalize_he(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
                        LIKE normalize_he(${pattern})
                      OR normalize_he(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, ''))
                        LIKE normalize_he(${pattern})
                    )
                )
              )`
            : Prisma.empty
        }`,
      query.limit + 1,
    );
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: await this.views(me, [...pinned, ...page]),
      nextCursor:
        rows.length > query.limit && last ? `${last.activityAt.toISOString()}|${last.id}` : null,
    };
  }

  /**
   * Opens the conversation with a person, creating it when there is none. A person who can't
   * be written to answers "not found", like an id that never existed.
   */
  async start(
    principal: Principal,
    userId: string,
  ): Promise<{ conversation: ConversationDetailDto; created: boolean }> {
    const me = principal.userId;
    this.access.ensureVerified(principal);
    if (userId === me) throw new AppException('NOT_FOUND');
    const pair = pairOf(me, userId);
    const existing = await this.prisma.conversation.findFirst({
      where: { kind: 'DIRECT', ...pair, members: { some: { userId: me } } },
      select: { id: true },
    });
    if (existing) return { conversation: await this.get(principal, existing.id), created: false };

    await this.access.ensureNotSuspended(me);
    if (!(await this.access.reachable(me, [userId])).has(userId)) {
      throw new AppException('NOT_FOUND');
    }
    // The other person sees who wrote to them, so the writer needs a name.
    await this.access.ensureNamed(me);
    const id = uuidv7();
    try {
      await this.prisma.conversation.create({
        data: {
          id,
          kind: 'DIRECT',
          ...pair,
          members: { create: [{ userId: me }, { userId }] },
        },
      });
    } catch (error) {
      // Both people started it at the same moment: the pair is unique, so one of them won.
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.prisma.conversation.findFirstOrThrow({
        where: { kind: 'DIRECT', ...pair },
        select: { id: true },
      });
      return { conversation: await this.get(principal, winner.id), created: false };
    }
    return { conversation: await this.get(principal, id), created: true };
  }

  async get(principal: Principal, id: string): Promise<ConversationDetailDto> {
    const me = principal.userId;
    const [row] = await this.rows(me, Prisma.sql`c.id = ${id}::uuid AND c.kind = 'DIRECT'`, 1);
    if (!row) throw new AppException('NOT_FOUND');
    const [view] = await this.views(me, [row]);
    const [sendState, blocks] = await Promise.all([
      this.access.sendState(principal, row.otherId),
      row.otherId ? this.access.blocks(me, row.otherId) : { byMe: false, byThem: false },
    ]);
    return {
      ...view!,
      // A person someone else blocked is not told: for them the conversation looks open, and
      // a message they send is refused with a neutral answer.
      sendState: sendState === 'blocked' && !blocks.byMe ? 'none' : sendState,
      blockedByMe: blocks.byMe,
    };
  }

  /** Mute, archive, or mark as unread: the reader's own settings of a conversation. */
  async update(
    principal: Principal,
    id: string,
    input: ConversationSettingsDto,
  ): Promise<ConversationDetailDto> {
    const me = principal.userId;
    await this.member(id, me);
    await pinGuard(() =>
      this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: id, userId: me } },
        data: {
          ...(input.mute ? muteFor(input.mute as MuteChoice) : {}),
          ...(input.archived === undefined
            ? {}
            : { archivedAt: input.archived ? new Date() : null }),
          ...(input.markedUnread ? { markedUnread: true } : {}),
          ...(input.pinned === undefined ? {} : { pinnedAt: input.pinned ? new Date() : null }),
        },
      }),
    );
    // The reader's other open windows follow.
    await this.stream.publish([me], { type: 'markers', conversationId: id, userId: me });
    return this.get(principal, id);
  }

  /** Marks the conversation as read, up to a message or to its end. */
  async read(principal: Principal, id: string, seq?: number): Promise<void> {
    const me = principal.userId;
    const member = await this.member(id, me);
    const upTo = Math.min(seq ?? member.conversation.lastSeq, member.conversation.lastSeq);
    const lastReadSeq = Math.max(member.lastReadSeq, upTo);
    const lastDeliveredSeq = Math.max(member.lastDeliveredSeq, lastReadSeq);
    if (
      lastReadSeq === member.lastReadSeq &&
      lastDeliveredSeq === member.lastDeliveredSeq &&
      !member.markedUnread
    ) {
      return;
    }
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: me } },
      data: { lastReadSeq, lastDeliveredSeq, markedUnread: false },
    });
    await this.stream.publish(await this.memberIds(id), {
      type: 'markers',
      conversationId: id,
      userId: me,
    });
  }

  /** Whether the Chat link is shown: an active member, or someone who has conversations. */
  async enabled(principal: Principal): Promise<boolean> {
    if (this.access.isVerified(principal)) return true;
    const any = await this.prisma.conversationMember.findFirst({
      where: { userId: principal.userId, conversation: { lastSeq: { gt: 0 } } },
      select: { userId: true },
    });
    return any !== null;
  }

  /**
   * How many conversations hold something unread, for the number on the Chat link. Nothing
   * for a person who switched "Private messages" off in the app.
   */
  async unreadCount(principal: Principal): Promise<number> {
    const me = principal.userId;
    if (!(await this.notifier.wantsInApp(me))) return 0;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM conversation_members m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.user_id = ${me}::uuid
        AND m.archived_at IS NULL
        AND NOT (m.muted AND (m.muted_until IS NULL OR m.muted_until > now()))
        AND (
          m.marked_unread
          OR EXISTS (
            SELECT 1 FROM messages x
            WHERE x.conversation_id = c.id
              AND x.seq > m.last_read_seq
              AND x.sender_id IS DISTINCT FROM ${me}::uuid
              AND x.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM message_hides h WHERE h.message_id = x.id AND h.user_id = ${me}::uuid
              )
          )
        )`;
    return rows[0]?.count ?? 0;
  }

  // --- Messages -------------------------------------------------------------------------------

  /** A page of messages, oldest first. Reading it means the reader's app has received them. */
  async messages(
    principal: Principal,
    id: string,
    query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    const me = principal.userId;
    await this.member(id, me);
    const page = await this.msgs.page(id, me, query);
    await this.markDelivered(me, id);
    return page;
  }

  async send(
    principal: Principal,
    id: string,
    input: {
      body: string;
      replyToId?: string | undefined;
      attachmentIds?: string[] | undefined;
    },
    idempotencyKey: string | undefined,
    forwarded?: ForwardedContent,
  ): Promise<{ message: MessageDto; created: boolean }> {
    const me = principal.userId;
    ensureIdempotencyKey(idempotencyKey);
    await this.member(id, me);
    const others = (await this.memberIds(id)).filter((userId) => userId !== me);
    await this.ensureCanSend(principal, others[0] ?? null);

    if (idempotencyKey) {
      const sent = await this.msgs.sentWith(me, idempotencyKey);
      if (sent) return { message: await this.msgs.view(sent, me), created: false };
    }
    await this.msgs.ensureReplyTarget(id, input.replyToId);
    const { row, created } = await this.msgs.append({
      conversationId: id,
      senderId: me,
      body: forwarded?.body ?? input.body,
      replyToId: input.replyToId,
      idempotencyKey,
      forwarded: forwarded !== undefined,
      attachmentIds:
        forwarded?.fileIds ?? (await this.msgs.ownUnusedFiles(me, input.attachmentIds)),
      unarchiveOthers: true,
    });
    if (created) {
      await this.stream.publish([me, ...others], {
        type: 'message.new',
        conversationId: id,
        messageId: row.id,
        seq: row.seq,
      });
      await this.notifier.messageSent(id, others);
    }
    return { message: await this.msgs.view(row, me), created };
  }

  /** The sender changes their message, within 15 minutes of sending it. */
  async edit(principal: Principal, messageId: string, body: string): Promise<MessageDto> {
    const me = principal.userId;
    const message = await this.ownMessage(me, messageId);
    if (!canEdit(message, me)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatEditWindowClosed' }]);
    }
    if (body === message.body) return this.msgs.view(message, me);
    const row = await this.prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
      select: MESSAGE_SELECT,
    });
    await this.msgs.changed(row, 'message.edited');
    return this.msgs.view(row, me);
  }

  /** Delete for everyone: the text is erased and the message stays in place as "deleted". */
  async remove(principal: Principal, messageId: string): Promise<void> {
    const me = principal.userId;
    const message = await this.ownMessage(me, messageId);
    if (message.deletedAt) return;
    await this.prisma.$transaction([
      this.prisma.message.update({
        where: { id: messageId },
        data: { body: '', deletedAt: new Date(), editedAt: null },
      }),
      // A deleted message is no longer pinned.
      this.prisma.messagePin.deleteMany({ where: { messageId } }),
    ]);
    await this.msgs.eraseFiles(messageId);
    await this.msgs.changed(message, 'message.deleted');
  }

  /**
   * What "Forward" copies from a message the reader can read: its text and its files. A
   * deleted message has nothing to forward.
   */
  async forwardable(principal: Principal, messageId: string): Promise<ForwardedContent> {
    const message = await this.visibleMessage(principal.userId, messageId);
    if (message.deletedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatMessageDeleted' }]);
    }
    return { body: message.body, fileIds: message.attachments.map(({ file }) => file.id) };
  }

  /** What kind of conversation this is, if the reader is in it. */
  async kindFor(userId: string, conversationId: string): Promise<'DIRECT' | 'ROOM' | 'GROUP'> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { conversation: { select: { kind: true } } },
    });
    if (!member) throw new AppException('NOT_FOUND');
    return member.conversation.kind;
  }

  /** Delete for me: the message leaves the reader's side only. */
  async hide(principal: Principal, messageId: string): Promise<void> {
    const me = principal.userId;
    const message = await this.visibleMessage(me, messageId);
    await this.prisma.messageHide.upsert({
      where: { userId_messageId: { userId: me, messageId } },
      update: {},
      create: { userId: me, messageId },
    });
    await this.stream.publish([me], {
      type: 'message.deleted',
      conversationId: message.conversationId,
      messageId,
      seq: message.seq,
    });
  }

  /**
   * Adds or takes back one of the fixed reactions on a message of a conversation or room the
   * reader is in (M12).
   */
  async react(
    principal: Principal,
    messageId: string,
    reaction: Reaction,
    on: boolean,
  ): Promise<MessageDto> {
    const me = principal.userId;
    const message = await this.visibleMessage(me, messageId);
    await this.msgs.react(me, message, reaction, on);
    return this.msgs.view(message, me);
  }

  /** "… is typing". Nothing is stored. Sent only when the typer shows it and may send. */
  async typing(principal: Principal, id: string): Promise<void> {
    const me = principal.userId;
    await this.member(id, me);
    const others = (await this.memberIds(id)).filter((userId) => userId !== me);
    if (others.length === 0) return;
    const [settings, state] = await Promise.all([
      this.access.settings([me]),
      this.access.sendState(principal, others[0]!),
    ]);
    if (!settings.get(me)!.typing || state !== 'none') return;
    await this.stream.publish(others, { type: 'typing', conversationId: id, userId: me });
  }

  /**
   * Finds messages by their text, in one of the reader's conversations or rooms or in all of
   * them, newest first. Hebrew-aware like the site search: vowel marks and final letters are
   * ignored, a word matches from its start and with or without a one-letter prefix. Deleted
   * messages and the ones the reader deleted for themselves are never found.
   */
  async search(principal: Principal, query: MessageSearchQueryDto): Promise<MessageSearchDto> {
    const me = principal.userId;
    if (query.conversationId) {
      const mine = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: query.conversationId, userId: me },
        },
        select: { userId: true },
      });
      if (!mine) throw new AppException('NOT_FOUND');
    }
    const prepared = prepareQuery(query.q);
    if (!prepared) return { items: [] };
    const found = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT x.id
      FROM messages x
      JOIN conversation_members m
        ON m.conversation_id = x.conversation_id AND m.user_id = ${me}::uuid
      WHERE x.search_vector @@ to_tsquery('simple', ${prepared.tsquery})
        AND x.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM message_hides h WHERE h.message_id = x.id AND h.user_id = ${me}::uuid
        )
        ${
          query.conversationId
            ? Prisma.sql`AND x.conversation_id = ${query.conversationId}::uuid`
            : Prisma.empty
        }
        ${query.senderId ? Prisma.sql`AND x.sender_id = ${query.senderId}::uuid` : Prisma.empty}
        ${
          query.from
            ? Prisma.sql`AND x.created_at >= (${query.from}::date AT TIME ZONE 'Asia/Jerusalem')`
            : Prisma.empty
        }
        ${
          query.to
            ? Prisma.sql`AND x.created_at
                           < ((${query.to}::date + 1) AT TIME ZONE 'Asia/Jerusalem')`
            : Prisma.empty
        }
      ORDER BY x.created_at DESC, x.id DESC
      LIMIT ${query.limit}`;
    if (found.length === 0) return { items: [] };
    const ids = found.map((row) => row.id);
    const rows = await this.prisma.message.findMany({
      where: { id: { in: ids } },
      select: MESSAGE_SELECT,
    });
    const conversationIds = [...new Set(rows.map((row) => row.conversationId))];
    const [conversations, views] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { id: { in: conversationIds } },
        select: {
          id: true,
          kind: true,
          nameHe: true,
          nameEn: true,
          // Only a private conversation's other person is read; a room has thousands.
          userLowId: true,
          userHighId: true,
        },
      }),
      this.msgs.views(rows, me),
    ]);
    const byConversation = new Map(conversations.map((c) => [c.id, c]));
    const otherOf = (conversationId: string): string | null => {
      const c = byConversation.get(conversationId);
      if (!c || c.kind !== 'DIRECT') return null;
      return c.userLowId === me ? c.userHighId : c.userLowId;
    };
    const cards = await this.directory.cards(
      conversationIds.map(otherOf).filter((id) => id !== null),
    );
    const viewById = new Map(views.map((view) => [view.id, view]));
    return {
      items: ids.flatMap((id) => {
        const message = viewById.get(id);
        if (!message) return [];
        const conversation = byConversation.get(message.conversationId);
        const otherId = otherOf(message.conversationId);
        return [
          {
            message,
            other: personView(otherId, otherId ? cards.get(otherId) : undefined),
            room:
              conversation?.kind === 'ROOM' && conversation.nameHe
                ? { id: conversation.id, nameHe: conversation.nameHe, nameEn: conversation.nameEn }
                : null,
            group:
              conversation?.kind === 'GROUP' && conversation.nameHe
                ? { id: conversation.id, name: conversation.nameHe }
                : null,
          },
        ];
      }),
    };
  }

  /**
   * Someone other than the sender deletes a message: staff deciding on a report, or a room's
   * moderator (the callers have checked that they may). The text is erased, and the message
   * says that a moderator removed it.
   */
  async removeAsStaff(messageId: string, removedBy: string): Promise<boolean> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: MESSAGE_SELECT,
    });
    if (!message || message.deletedAt) return false;
    await this.prisma.$transaction([
      this.prisma.message.update({
        where: { id: messageId },
        data: { body: '', deletedAt: new Date(), editedAt: null, removedBy },
      }),
      // A deleted message is no longer pinned.
      this.prisma.messagePin.deleteMany({ where: { messageId } }),
    ]);
    await this.msgs.eraseFiles(messageId);
    await this.msgs.changed(message, 'message.deleted');
    return true;
  }
  // --- Internals ------------------------------------------------------------------------------

  /** The reader's membership of a private conversation, or "not found" (also for a room). */
  private async member(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: {
        lastReadSeq: true,
        lastDeliveredSeq: true,
        markedUnread: true,
        conversation: { select: { lastSeq: true, kind: true } },
      },
    });
    if (!member || member.conversation.kind !== 'DIRECT') throw new AppException('NOT_FOUND');
    return member;
  }

  private async memberIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /** A message in one of the reader's conversations, or "not found". */
  private async visibleMessage(userId: string, messageId: string): Promise<MessageRow> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversation: { members: { some: { userId } } } },
      select: MESSAGE_SELECT,
    });
    if (!message) throw new AppException('NOT_FOUND');
    return message;
  }

  /** A message the reader sent. Someone else's message in their conversation is refused. */
  private async ownMessage(userId: string, messageId: string): Promise<MessageRow> {
    const message = await this.visibleMessage(userId, messageId);
    if (message.senderId !== userId) throw new AppException('FORBIDDEN');
    return message;
  }

  /**
   * Refuses a message that can't be sent. A block answers with a neutral code in both
   * directions, so the blocked person is not told.
   */
  private async ensureCanSend(principal: Principal, otherId: string | null): Promise<void> {
    switch (await this.access.sendState(principal, otherId)) {
      case 'none':
        return;
      case 'membersOnly':
        throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
      case 'suspended':
        throw new AppException('FORBIDDEN', [{ code: 'chatSuspended' }]);
      case 'blocked':
      case 'unavailable':
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatUndeliverable' }]);
    }
  }

  /**
   * Moves the reader's "delivered" marker to the end of their conversations (or of one), and
   * tells the people in the ones that moved.
   */
  private async markDelivered(userId: string, conversationId?: string): Promise<void> {
    const moved = await this.prisma.$queryRaw<{ conversationId: string }[]>`
      UPDATE conversation_members m
      SET last_delivered_seq = c.last_seq
      FROM conversations c
      WHERE c.id = m.conversation_id
        AND m.user_id = ${userId}::uuid
        AND m.last_delivered_seq < c.last_seq
        AND c.kind = 'DIRECT'
        ${conversationId ? Prisma.sql`AND c.id = ${conversationId}::uuid` : Prisma.empty}
      RETURNING m.conversation_id AS "conversationId"`;
    if (moved.length === 0) return;
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: moved.map((row) => row.conversationId) } },
      select: { conversationId: true, userId: true },
    });
    await Promise.all(
      moved.map((row) =>
        this.stream.publish(
          members.filter((m) => m.conversationId === row.conversationId).map((m) => m.userId),
          { type: 'markers', conversationId: row.conversationId, userId },
        ),
      ),
    );
  }

  /** The reader's conversations that match, with the other person's markers and the last message. */
  private rows(me: string, where: Prisma.Sql, limit: number): Promise<ConversationRow[]> {
    return this.prisma.$queryRaw<ConversationRow[]>`
      SELECT c.id, c.kind::text AS kind, c.name_he AS name, c.member_count AS "memberCount",
             c.last_seq AS "lastSeq", c.last_message_at AS "lastMessageAt",
             coalesce(c.last_message_at, c.created_at) AS "activityAt",
             m.pinned_at AS "pinnedAt",
             (
               SELECT count(*)::int FROM message_attachments a WHERE a.message_id = lm.id
             ) AS "lmFiles",
             m.last_read_seq AS "myLastReadSeq", m.marked_unread AS "markedUnread",
             m.muted, m.muted_until AS "mutedUntil", m.archived_at AS "archivedAt",
             o.user_id AS "otherId", o.last_read_seq AS "otherReadSeq",
             o.last_delivered_seq AS "otherDeliveredSeq",
             lm.id AS "lmId", lm.seq AS "lmSeq", lm.sender_id AS "lmSenderId",
             lm.body AS "lmBody", lm.deleted_at AS "lmDeletedAt", lm.created_at AS "lmCreatedAt",
             (
               SELECT count(*)::int FROM messages x
               WHERE x.conversation_id = c.id
                 AND x.seq > m.last_read_seq
                 AND x.sender_id IS DISTINCT FROM ${me}::uuid
                 AND x.deleted_at IS NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM message_hides h
                   WHERE h.message_id = x.id AND h.user_id = ${me}::uuid
                 )
             ) AS "unreadCount"
      FROM conversation_members m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN conversation_members o
        ON o.conversation_id = c.id AND o.user_id <> m.user_id AND c.kind = 'DIRECT'
      LEFT JOIN LATERAL (
        SELECT x.id, x.seq, x.sender_id, x.body, x.deleted_at, x.created_at
        FROM messages x
        WHERE x.conversation_id = c.id
          AND NOT EXISTS (
            SELECT 1 FROM message_hides h WHERE h.message_id = x.id AND h.user_id = ${me}::uuid
          )
        ORDER BY x.seq DESC
        LIMIT 1
      ) lm ON true
      WHERE m.user_id = ${me}::uuid AND ${where}
      ORDER BY coalesce(c.last_message_at, c.created_at) DESC, c.id DESC
      LIMIT ${limit}`;
  }

  private async views(me: string, rows: readonly ConversationRow[]): Promise<ConversationDto[]> {
    const otherIds = rows.flatMap((row) => (row.otherId ? [row.otherId] : []));
    const [cards, settings] = await Promise.all([
      this.directory.cards(otherIds),
      this.access.settings([me, ...otherIds]),
    ]);
    const now = new Date();
    return rows.map((row) => {
      const receipts =
        row.otherId !== null &&
        settings.get(me)!.readReceipts &&
        settings.get(row.otherId)!.readReceipts;
      const muted = muteActive(row, now);
      return {
        id: row.id,
        kind: row.kind,
        other: personView(row.otherId, row.otherId ? cards.get(row.otherId) : undefined),
        group: row.kind === 'GROUP' ? { name: row.name ?? '', memberCount: row.memberCount } : null,
        pinned: row.pinnedAt !== null,
        lastMessage:
          row.lmId && row.lmSeq !== null && row.lmCreatedAt
            ? {
                id: row.lmId,
                seq: row.lmSeq,
                senderId: row.lmSenderId,
                body: preview(row.lmBody ?? ''),
                deleted: row.lmDeletedAt !== null,
                files: row.lmDeletedAt ? 0 : row.lmFiles,
                createdAt: row.lmCreatedAt.toISOString(),
              }
            : null,
        lastSeq: row.lastSeq,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        unreadCount: row.unreadCount,
        markedUnread: row.markedUnread,
        muted,
        mutedUntil: muted ? (row.mutedUntil?.toISOString() ?? null) : null,
        archived: row.archivedAt !== null,
        myLastReadSeq: row.myLastReadSeq,
        otherDeliveredSeq: row.otherDeliveredSeq ?? 0,
        otherReadSeq: receipts ? (row.otherReadSeq ?? 0) : null,
      };
    });
  }
}

/** Refuses an Idempotency-Key that is not printable ASCII of a sane length. */
export function ensureIdempotencyKey(idempotencyKey: string | undefined): void {
  if (idempotencyKey !== undefined && !validIdempotencyKey(idempotencyKey)) {
    throw new AppException('VALIDATION_FAILED', [
      { field: 'idempotencyKey', code: 'idempotencyKeyInvalid' },
    ]);
  }
}
/**
 * Runs a change that may pin a conversation. The database refuses a sixth pin (a trigger), also
 * when two requests arrive together.
 */
export async function pinGuard<T>(change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (String((error as Error).message).includes('pins at most five')) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatPinnedLimit' }]);
    }
    throw error;
  }
}

/** "<time>|<id>" of the last conversation of the page before. */
function parseCursor(cursor: string): { at: Date; id: string } {
  const [time, id] = cursor.split('|');
  const at = new Date(time ?? '');
  if (!id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppException('VALIDATION_FAILED', [{ field: 'cursor', code: 'cursorInvalid' }]);
  }
  return { at, id };
}
