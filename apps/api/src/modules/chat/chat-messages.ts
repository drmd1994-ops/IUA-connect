import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DirectoryService, type PersonCard } from '../profiles';
import { REACTIONS, type Reaction, canEdit, preview } from './chat-rules';
import { type ChatEvent, ChatStream } from './chat-stream';
import { type MessageDto, type MessageListDto, type MessageListQueryDto } from './chat.dto';

export const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  seq: true,
  senderId: true,
  body: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  announcement: true,
  removedBy: true,
  mentions: true,
  conversation: { select: { kind: true } },
  replyTo: { select: { id: true, seq: true, senderId: true, body: true, deletedAt: true } },
} satisfies Prisma.MessageSelect;
export type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

export interface NewMessage {
  conversationId: string;
  senderId: string;
  body: string;
  replyToId?: string | undefined;
  idempotencyKey?: string | undefined;
  announcement?: boolean;
  mentions?: readonly string[];
  /**
   * A new message brings the conversation back from the other people's archive (private
   * chat). Not in rooms, where it would touch every member's row on every message.
   */
  unarchiveOthers: boolean;
}

/**
 * What private conversations and rooms share about messages (M11, M12): writing one with its
 * number, reading a page, how a message looks to a reader, reactions, and telling the people
 * who should hear about a change. Who may do what is decided by the callers.
 */
@Injectable()
export class ChatMessages {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
  ) {}

  /**
   * A page of messages, oldest first: the newest ones, the ones before a number, or the ones
   * after it. Messages the reader deleted for themselves are left out.
   */
  async page(
    conversationId: string,
    me: string,
    query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    const forward = query.after !== undefined;
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
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
    return { items: await this.views(page, me), hasMore: rows.length > query.limit };
  }

  /** The message a sender already sent with this Idempotency-Key, if any. */
  sentWith(senderId: string, idempotencyKey: string): Promise<MessageRow | null> {
    return this.prisma.message.findUnique({
      where: { senderId_idempotencyKey: { senderId, idempotencyKey } },
      select: MESSAGE_SELECT,
    });
  }

  /** Refuses a reply to a message of another conversation. */
  async ensureReplyTarget(conversationId: string, replyToId: string | undefined): Promise<void> {
    if (!replyToId) return;
    const target = await this.prisma.message.findFirst({
      where: { id: replyToId, conversationId },
      select: { id: true },
    });
    if (!target) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'replyToId', code: 'chatReplyNotInConversation' },
      ]);
    }
  }

  /**
   * Writes a message with the next number of its conversation. The row lock on the
   * conversation gives the numbers in order, whoever sends at the same moment. A repeated
   * request with the same Idempotency-Key answers the message it already sent.
   */
  async append(input: NewMessage): Promise<{ row: MessageRow; created: boolean }> {
    const { conversationId: id, senderId: me, idempotencyKey } = input;
    const messageId = uuidv7();
    const now = new Date();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
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
            announcement: input.announcement ?? false,
            mentions: [...new Set(input.mentions ?? [])],
            createdAt: now,
          },
          select: MESSAGE_SELECT,
        });
        // Writing reads what came before, and takes the writer's own copy out of the archive.
        await tx.conversationMember.updateMany({
          where: { conversationId: id, userId: me },
          data: { lastReadSeq: seq, lastDeliveredSeq: seq, markedUnread: false, archivedAt: null },
        });
        if (input.unarchiveOthers) {
          // Back from the other person's archive, unless they muted it.
          await tx.$executeRaw`
            UPDATE conversation_members
            SET archived_at = NULL
            WHERE conversation_id = ${id}::uuid
              AND user_id <> ${me}::uuid
              AND archived_at IS NOT NULL
              AND NOT (muted AND (muted_until IS NULL OR muted_until > ${now}))`;
        }
        return created;
      });
      return { row, created: true };
    } catch (error) {
      // The same request arrived twice at once: the first one sent it.
      if (idempotencyKey && isUniqueViolation(error)) {
        const sent = await this.sentWith(me, idempotencyKey);
        if (sent) return { row: sent, created: false };
      }
      throw error;
    }
  }

  /**
   * Tells the people of a conversation about a change: by name in a private conversation, by
   * room in a room.
   */
  async broadcast(
    conversation: { id: string; kind: 'DIRECT' | 'ROOM' },
    event: ChatEvent,
  ): Promise<void> {
    if (conversation.kind === 'ROOM') {
      await this.stream.publishRoom(conversation.id, event);
      return;
    }
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: conversation.id },
      select: { userId: true },
    });
    await this.stream.publish(
      members.map((member) => member.userId),
      event,
    );
  }

  /** Tells the people of a message's conversation that the message changed. */
  async changed(row: MessageRow, type: 'message.edited' | 'message.deleted'): Promise<void> {
    await this.broadcast(
      { id: row.conversationId, kind: row.conversation.kind },
      { type, conversationId: row.conversationId, messageId: row.id, seq: row.seq },
    );
  }

  /** Adds or takes back one of the fixed reactions. Pressing twice changes nothing more. */
  async react(me: string, row: MessageRow, reaction: Reaction, on: boolean): Promise<void> {
    if (row.deletedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatMessageDeleted' }]);
    }
    const key = { messageId_userId_reaction: { messageId: row.id, userId: me, reaction } };
    if (on) {
      await this.prisma.messageReaction.upsert({
        where: key,
        update: {},
        create: { messageId: row.id, userId: me, reaction },
      });
    } else {
      await this.prisma.messageReaction.deleteMany({
        where: { messageId: row.id, userId: me, reaction },
      });
    }
    await this.changed(row, 'message.edited');
  }

  /** How one message looks to a reader. */
  async view(row: MessageRow, me: string): Promise<MessageDto> {
    return (await this.views([row], me))[0]!;
  }

  /**
   * How messages look to a reader: who wrote each, the people mentioned, the reactions with
   * the reader's own marked, and whether the reader blocked its sender.
   */
  async views(rows: readonly MessageRow[], me: string): Promise<MessageDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const people = [
      ...new Set(
        rows.flatMap((row) => [row.senderId, ...row.mentions]).filter((id) => id !== null),
      ),
    ];
    const senders = [...new Set(rows.map((row) => row.senderId).filter((id) => id !== null))];
    const [cards, counts, mine, blocked] = await Promise.all([
      this.directory.cards(people),
      this.prisma.messageReaction.groupBy({
        by: ['messageId', 'reaction'],
        where: { messageId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.messageReaction.findMany({
        where: { messageId: { in: ids }, userId: me },
        select: { messageId: true, reaction: true },
      }),
      this.prisma.chatBlock.findMany({
        where: { blockerId: me, blockedId: { in: senders } },
        select: { blockedId: true },
      }),
    ]);
    const myReactions = new Set(mine.map((row) => `${row.messageId}:${row.reaction}`));
    const blockedIds = new Set(blocked.map((row) => row.blockedId));
    const now = new Date();
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      seq: row.seq,
      senderId: row.senderId,
      sender: personView(row.senderId, row.senderId ? cards.get(row.senderId) : undefined),
      mine: row.senderId === me,
      body: row.body,
      deleted: row.deletedAt !== null,
      removedByModerator: row.removedBy !== null,
      announcement: row.announcement,
      editedAt: row.editedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      canEdit: canEdit(row, me, now),
      senderBlocked: row.senderId !== null && blockedIds.has(row.senderId),
      mentions: row.mentions.map((id) => {
        const card = cards.get(id);
        return { id, firstName: card?.firstName ?? null, lastName: card?.lastName ?? null };
      }),
      // In the fixed order, and only the ones somebody used.
      reactions: REACTIONS.flatMap((reaction) => {
        const count = counts.find((c) => c.messageId === row.id && c.reaction === reaction)?._count
          ._all;
        return count ? [{ reaction, count, mine: myReactions.has(`${row.id}:${reaction}`) }] : [];
      }),
      replyTo: row.replyTo
        ? {
            id: row.replyTo.id,
            seq: row.replyTo.seq,
            senderId: row.replyTo.senderId,
            body: preview(row.replyTo.body),
            deleted: row.replyTo.deletedAt !== null,
          }
        : null,
    }));
  }
}

/** A person as someone in the same conversation sees them. All empty for a deleted account. */
export function personView(id: string | null, card: PersonCard | undefined) {
  return {
    id,
    firstName: card?.firstName ?? null,
    lastName: card?.lastName ?? null,
    photoFileId: card?.photoFileId ?? null,
    listed: card?.listed ?? false,
  };
}
