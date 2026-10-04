import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DirectoryService, type PersonCard } from '../profiles';
import { prepareQuery } from '../search';
import { ChatAccess } from './chat-access';
import { ChatNotifier } from './chat-notifier';
import {
  type MuteChoice,
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

interface ConversationRow {
  id: string;
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

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  seq: true,
  senderId: true,
  body: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  replyTo: { select: { id: true, seq: true, senderId: true, body: true, deletedAt: true } },
} satisfies Prisma.MessageSelect;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

/**
 * Conversations and their messages (M11 plan §2–§5). Every method first finds the reader's own
 * membership of the conversation; a conversation or message the reader has no part in is "not
 * found", the same as one that never existed, whatever id is put in the address.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccess,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly notifier: ChatNotifier,
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
    const rows = await this.rows(
      me,
      Prisma.sql`c.last_seq > 0
        AND (m.archived_at IS NOT NULL) = ${archived}
        ${
          cursor
            ? Prisma.sql`AND (c.last_message_at, c.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
            : Prisma.empty
        }
        ${
          pattern
            ? Prisma.sql`AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.user_id = o.user_id
                  AND (
                    normalize_he(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
                      LIKE normalize_he(${pattern})
                    OR normalize_he(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, ''))
                      LIKE normalize_he(${pattern})
                  )
              )`
            : Prisma.empty
        }`,
      query.limit + 1,
    );
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: await this.views(me, page),
      nextCursor:
        rows.length > query.limit && last?.lastMessageAt
          ? `${last.lastMessageAt.toISOString()}|${last.id}`
          : null,
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
    await this.access.ensureActiveMember(principal);
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
    const own = (await this.directory.cards([me])).get(me);
    if (!own?.firstName?.trim() || !own.lastName?.trim()) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatNameRequired' }]);
    }
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
    const [row] = await this.rows(me, Prisma.sql`c.id = ${id}::uuid`, 1);
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
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: me } },
      data: {
        ...(input.mute ? muteFor(input.mute as MuteChoice) : {}),
        ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }),
        ...(input.markedUnread ? { markedUnread: true } : {}),
      },
    });
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

  /**
   * A page of messages, oldest first: the newest ones, the ones before a number, or the ones
   * after it. Messages the reader deleted for themselves are left out.
   */
  async messages(
    principal: Principal,
    id: string,
    query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    const me = principal.userId;
    await this.member(id, me);
    const forward = query.after !== undefined;
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        hides: { none: { userId: me } },
        ...(forward ? { seq: { gt: query.after } } : {}),
        ...(query.before !== undefined ? { seq: { lt: query.before } } : {}),
      },
      select: MESSAGE_SELECT,
      orderBy: { seq: forward ? 'asc' : 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    if (!forward) page.reverse();
    await this.markDelivered(me, id);
    return { items: page.map((row) => messageView(row, me)), hasMore: rows.length > query.limit };
  }

  async send(
    principal: Principal,
    id: string,
    input: { body: string; replyToId?: string | undefined },
    idempotencyKey: string | undefined,
  ): Promise<{ message: MessageDto; created: boolean }> {
    const me = principal.userId;
    if (idempotencyKey !== undefined && !validIdempotencyKey(idempotencyKey)) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'idempotencyKey', code: 'idempotencyKeyInvalid' },
      ]);
    }
    await this.member(id, me);
    const others = (await this.memberIds(id)).filter((userId) => userId !== me);
    await this.ensureCanSend(principal, others[0] ?? null);

    if (idempotencyKey) {
      const sent = await this.sentWith(me, idempotencyKey);
      if (sent) return { message: messageView(sent, me), created: false };
    }
    if (input.replyToId) {
      const target = await this.prisma.message.findFirst({
        where: { id: input.replyToId, conversationId: id },
        select: { id: true },
      });
      if (!target) {
        throw new AppException('VALIDATION_FAILED', [
          { field: 'replyToId', code: 'chatReplyNotInConversation' },
        ]);
      }
    }

    const messageId = uuidv7();
    const now = new Date();
    let row: MessageRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        // The row lock on the conversation gives each message the next number, in order.
        const [next] = await tx.$queryRaw<{ seq: number }[]>`
          UPDATE conversations
          SET last_seq = last_seq + 1, last_message_at = ${now}, updated_at = ${now}
          WHERE id = ${id}::uuid
          RETURNING last_seq AS seq`;
        const seq = next!.seq;
        const created = await tx.message.create({
          data: {
            id: messageId,
            conversationId: id,
            seq,
            senderId: me,
            body: input.body,
            replyToId: input.replyToId ?? null,
            idempotencyKey: idempotencyKey ?? null,
            createdAt: now,
          },
          select: MESSAGE_SELECT,
        });
        await tx.conversationMember.update({
          where: { conversationId_userId: { conversationId: id, userId: me } },
          data: { lastReadSeq: seq, lastDeliveredSeq: seq, markedUnread: false, archivedAt: null },
        });
        // A new message brings an archived conversation back, unless its reader muted it.
        await tx.$executeRaw`
          UPDATE conversation_members
          SET archived_at = NULL
          WHERE conversation_id = ${id}::uuid
            AND user_id <> ${me}::uuid
            AND archived_at IS NOT NULL
            AND NOT (muted AND (muted_until IS NULL OR muted_until > ${now}))`;
        return created;
      });
    } catch (error) {
      // The same request arrived twice at once: the first one sent it.
      if (idempotencyKey && isUniqueViolation(error)) {
        const sent = await this.sentWith(me, idempotencyKey);
        if (sent) return { message: messageView(sent, me), created: false };
      }
      throw error;
    }
    await this.stream.publish([me, ...others], {
      type: 'message.new',
      conversationId: id,
      messageId: row.id,
      seq: row.seq,
    });
    await this.notifier.messageSent(id, others);
    return { message: messageView(row, me), created: true };
  }

  /** The sender changes their message, within 15 minutes of sending it. */
  async edit(principal: Principal, messageId: string, body: string): Promise<MessageDto> {
    const me = principal.userId;
    const message = await this.ownMessage(me, messageId);
    if (!canEdit(message, me)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatEditWindowClosed' }]);
    }
    if (body === message.body) return messageView(message, me);
    const row = await this.prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
      select: MESSAGE_SELECT,
    });
    await this.stream.publish(await this.memberIds(row.conversationId), {
      type: 'message.edited',
      conversationId: row.conversationId,
      messageId: row.id,
      seq: row.seq,
    });
    return messageView(row, me);
  }

  /** Delete for everyone: the text is erased and the message stays in place as "deleted". */
  async remove(principal: Principal, messageId: string): Promise<void> {
    const me = principal.userId;
    const message = await this.ownMessage(me, messageId);
    if (message.deletedAt) return;
    await this.prisma.message.update({
      where: { id: messageId },
      data: { body: '', deletedAt: new Date(), editedAt: null },
    });
    await this.stream.publish(await this.memberIds(message.conversationId), {
      type: 'message.deleted',
      conversationId: message.conversationId,
      messageId,
      seq: message.seq,
    });
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
   * Finds messages by their text, in one of the reader's conversations or in all of them,
   * newest first. Hebrew-aware like the site search: vowel marks and final letters are
   * ignored, a word matches from its start and with or without a one-letter prefix. Deleted
   * messages and the ones the reader deleted for themselves are never found.
   */
  async search(principal: Principal, query: MessageSearchQueryDto): Promise<MessageSearchDto> {
    const me = principal.userId;
    if (query.conversationId) await this.member(query.conversationId, me);
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
      ORDER BY x.created_at DESC, x.id DESC
      LIMIT ${query.limit}`;
    if (found.length === 0) return { items: [] };
    const ids = found.map((row) => row.id);
    const [rows, members] = await Promise.all([
      this.prisma.message.findMany({ where: { id: { in: ids } }, select: MESSAGE_SELECT }),
      this.prisma.conversationMember.findMany({
        where: { conversation: { messages: { some: { id: { in: ids } } } }, userId: { not: me } },
        select: { conversationId: true, userId: true },
      }),
    ]);
    const otherOf = new Map(members.map((row) => [row.conversationId, row.userId]));
    const cards = await this.directory.cards([...otherOf.values()]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      items: ids.flatMap((id) => {
        const row = byId.get(id);
        if (!row) return [];
        const otherId = otherOf.get(row.conversationId) ?? null;
        return [
          {
            message: messageView(row, me),
            other: personView(otherId, otherId ? cards.get(otherId) : undefined),
          },
        ];
      }),
    };
  }

  /**
   * Staff delete a reported message (the reports service calls this after its own checks).
   * The same as the sender deleting it for everyone.
   */
  async removeAsStaff(messageId: string): Promise<boolean> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true, seq: true, deletedAt: true },
    });
    if (!message || message.deletedAt) return false;
    await this.prisma.message.update({
      where: { id: messageId },
      data: { body: '', deletedAt: new Date(), editedAt: null },
    });
    await this.stream.publish(await this.memberIds(message.conversationId), {
      type: 'message.deleted',
      conversationId: message.conversationId,
      messageId,
      seq: message.seq,
    });
    return true;
  }

  // --- Internals ------------------------------------------------------------------------------

  /** The reader's membership of a conversation, or "not found". */
  private async member(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: {
        lastReadSeq: true,
        lastDeliveredSeq: true,
        markedUnread: true,
        conversation: { select: { lastSeq: true } },
      },
    });
    if (!member) throw new AppException('NOT_FOUND');
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

  private async sentWith(senderId: string, idempotencyKey: string): Promise<MessageRow | null> {
    return this.prisma.message.findUnique({
      where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
      select: MESSAGE_SELECT,
    });
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
      SELECT c.id, c.last_seq AS "lastSeq", c.last_message_at AS "lastMessageAt",
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
        ON o.conversation_id = c.id AND o.user_id <> m.user_id
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
      ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
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
        kind: 'DIRECT',
        other: personView(row.otherId, row.otherId ? cards.get(row.otherId) : undefined),
        lastMessage:
          row.lmId && row.lmSeq !== null && row.lmCreatedAt
            ? {
                id: row.lmId,
                seq: row.lmSeq,
                senderId: row.lmSenderId,
                body: preview(row.lmBody ?? ''),
                deleted: row.lmDeletedAt !== null,
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

function personView(id: string | null, card: PersonCard | undefined): ConversationDto['other'] {
  return {
    id,
    firstName: card?.firstName ?? null,
    lastName: card?.lastName ?? null,
    photoFileId: card?.photoFileId ?? null,
    listed: card?.listed ?? false,
  };
}

function messageView(row: MessageRow, me: string): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    seq: row.seq,
    senderId: row.senderId,
    mine: row.senderId === me,
    body: row.body,
    deleted: row.deletedAt !== null,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    canEdit: canEdit(row, me),
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          seq: row.replyTo.seq,
          senderId: row.replyTo.senderId,
          body: preview(row.replyTo.body),
          deleted: row.replyTo.deletedAt !== null,
        }
      : null,
  };
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
