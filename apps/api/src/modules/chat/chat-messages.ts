import { Injectable, type OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { mayActOn } from '../../common/auth/scope';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FilesService } from '../files';
import { DirectoryService, type PersonCard } from '../profiles';
import { REACTIONS, type Reaction, attachmentsAllowed, canEdit, preview } from './chat-rules';
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
  forwarded: true,
  attachments: {
    orderBy: { position: 'asc' },
    select: {
      file: {
        select: {
          id: true,
          kind: true,
          mimeType: true,
          originalName: true,
          sizeBytes: true,
          width: true,
          height: true,
        },
      },
    },
  },
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
  /** A copy of a message from elsewhere (M13). */
  forwarded?: boolean;
  /** Files to send with it, in order; the caller has checked that they may be used (M13). */
  attachmentIds?: readonly string[];
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
export class ChatMessages implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly files: FilesService,
  ) {}

  /**
   * A file of a message is readable by whoever can read that message (M13): the people of its
   * conversation, group or room, and for a room also staff with the chat permission. Nobody
   * else, whoever uploaded it. A file not yet sent is left to the files module (its uploader).
   */
  onModuleInit(): void {
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const uses = await this.prisma.messageAttachment.findMany({
          where: { fileId },
          select: {
            message: {
              select: {
                deletedAt: true,
                conversationId: true,
                conversation: { select: { kind: true, organisationId: true } },
              },
            },
          },
        });
        if (uses.length === 0) return null;
        if (!principal) return false;
        const live = uses.map((use) => use.message).filter((message) => !message.deletedAt);
        if (live.length === 0) return false;
        if (
          live.some(
            (message) =>
              message.conversation.kind === 'ROOM' &&
              mayActOn(principal, 'chat.moderate', message.conversation.organisationId),
          )
        ) {
          return true;
        }
        const mine = await this.prisma.conversationMember.count({
          where: {
            userId: principal.userId,
            conversationId: { in: live.map((message) => message.conversationId) },
          },
        });
        return mine > 0;
      },
    });
  }

  /**
   * A page of messages, oldest first: the newest ones, the ones before a number, or the ones
   * after it. Messages the reader deleted for themselves are left out.
   */
  async page(
    conversationId: string,
    me: string,
    query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    if (query.around !== undefined) return this.pageAround(conversationId, me, query);
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

  /**
   * The messages around one number: half a page before it and half after, so a found message
   * opens in its place (M13). "hasMore" then means there are older ones.
   */
  private async pageAround(
    conversationId: string,
    me: string,
    query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    const half = Math.ceil(query.limit / 2);
    const visible = { conversationId, hides: { none: { userId: me } } };
    const [before, after] = await Promise.all([
      this.prisma.message.findMany({
        where: { ...visible, seq: { lt: query.around! } },
        select: MESSAGE_SELECT,
        orderBy: { seq: 'desc' },
        take: half + 1,
      }),
      this.prisma.message.findMany({
        where: { ...visible, seq: { gte: query.around! } },
        select: MESSAGE_SELECT,
        orderBy: { seq: 'asc' },
        take: half,
      }),
    ]);
    const rows = [...before.slice(0, half).reverse(), ...after];
    return { items: await this.views(rows, me), hasMore: before.length > half };
  }

  /**
   * Checks the files a person wants to send with a message: each one they uploaded for chat
   * and have not used yet, three at most, one video at most. Anything else is one answer.
   */
  async ownUnusedFiles(me: string, ids: readonly string[] | undefined): Promise<string[]> {
    const wanted = [...new Set(ids ?? [])];
    if (wanted.length === 0) return [];
    const files = await this.prisma.storedFile.findMany({
      where: { id: { in: wanted }, purpose: 'CHAT', ownerUserId: me, attachedAt: null },
      select: { id: true, kind: true },
    });
    if (files.length !== wanted.length || !attachmentsAllowed(files.map((file) => file.kind))) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'attachmentIds', code: 'chatAttachmentInvalid' },
      ]);
    }
    return wanted;
  }

  /**
   * Erases the files of a message that was deleted for everyone. A file a forwarded copy
   * still uses stays until its last message goes.
   */
  async eraseFiles(messageId: string): Promise<void> {
    const rows = await this.prisma.messageAttachment.findMany({
      where: { messageId },
      select: { fileId: true },
    });
    if (rows.length === 0) return;
    await this.prisma.messageAttachment.deleteMany({ where: { messageId } });
    for (const { fileId } of rows) {
      const left = await this.prisma.messageAttachment.count({ where: { fileId } });
      if (left === 0) await this.files.remove(fileId);
    }
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
            forwarded: input.forwarded ?? false,
            createdAt: now,
            attachments: {
              create: (input.attachmentIds ?? []).map((fileId, position) => ({ fileId, position })),
            },
          },
          select: MESSAGE_SELECT,
        });
        if (input.attachmentIds?.length) {
          // Used now: no longer its uploader's alone, and not cleared away as an unused upload.
          await tx.storedFile.updateMany({
            where: { id: { in: [...input.attachmentIds] }, attachedAt: null },
            data: { attachedAt: now },
          });
        }
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
   * room in a room or a group.
   */
  async broadcast(
    conversation: { id: string; kind: 'DIRECT' | 'ROOM' | 'GROUP' },
    event: ChatEvent,
  ): Promise<void> {
    if (conversation.kind !== 'DIRECT') {
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
      forwarded: row.forwarded,
      attachments: row.deletedAt
        ? []
        : row.attachments.map(({ file }) => ({
            id: file.id,
            kind: file.kind,
            mimeType: file.mimeType,
            name: file.originalName,
            sizeBytes: file.sizeBytes,
            width: file.width,
            height: file.height,
          })),
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
    mark: card?.mark ?? null,
  };
}
