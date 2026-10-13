import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { DirectoryService } from '../profiles';
import { ChatAccess } from './chat-access';
import { ChatMessages, personView } from './chat-messages';
import { ChatNotifier } from './chat-notifier';
import {
  GROUP_MAX_MEMBERS,
  type GroupSendState,
  type MuteChoice,
  muteActive,
  muteFor,
} from './chat-rules';
import { ChatStream } from './chat-stream';
import {
  type ConversationSettingsDto,
  type GroupDto,
  type GroupMembersDto,
  type MessageDto,
  type MessageListDto,
  type MessageListQueryDto,
  type RoomSendDto,
} from './chat.dto';
import { type ForwardedContent, ensureIdempotencyKey, pinGuard } from './chat.service';

/** Thrown inside a transaction when a group already holds as many people as it may. */
class GroupFull extends Error {}

/**
 * Group chats (M13 plan §2.1): a small group a member made. People are in it only by accepting
 * an invitation. A group is a conversation of kind GROUP, so its messages, reactions, markers
 * and search are the ones private chat and rooms have.
 *
 * A group is private like a conversation of two: every method first finds the reader's own
 * place in it, and for anyone else, staff included, the group is "not found", the same as one
 * that never existed. Staff see a report and nothing else.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccess,
    private readonly msgs: ChatMessages,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly notifier: ChatNotifier,
    private readonly audit: AuditService,
  ) {}

  /** Makes a group with its maker as the admin and nobody else in it yet. */
  async create(principal: Principal, name: string, meta: RequestMeta): Promise<GroupDto> {
    const me = principal.userId;
    this.access.ensureVerified(principal);
    await this.access.ensureNotSuspended(me);
    // The people invited see who invites them, so the maker needs a name.
    await this.access.ensureNamed(me);
    const id = uuidv7();
    await this.prisma.conversation.create({
      data: {
        id,
        kind: 'GROUP',
        nameHe: name,
        createdBy: me,
        memberCount: 1,
        members: { create: [{ userId: me, role: 'ADMIN' }] },
      },
    });
    await this.stream.setPresence(me, id, true);
    // The name is the members' own business; the audit log records that a group was made.
    await this.record('chat.group.create', me, id, meta, {});
    return this.get(principal, id);
  }

  async get(principal: Principal, id: string): Promise<GroupDto> {
    const me = principal.userId;
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: id, userId: me, conversation: { kind: 'GROUP' } },
      select: {
        role: true,
        lastReadSeq: true,
        markedUnread: true,
        muted: true,
        mutedUntil: true,
        archivedAt: true,
        pinnedAt: true,
        conversation: {
          select: {
            nameHe: true,
            memberCount: true,
            createdAt: true,
            lastMessageAt: true,
            lastSeq: true,
          },
        },
      },
    });
    if (!member) throw new AppException('NOT_FOUND');
    const [unread, sendState] = await Promise.all([
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM messages x
        WHERE x.conversation_id = ${id}::uuid
          AND x.seq > ${member.lastReadSeq}
          AND x.sender_id IS DISTINCT FROM ${me}::uuid
          AND x.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM message_hides h WHERE h.message_id = x.id AND h.user_id = ${me}::uuid
          )`,
      this.sendState(principal),
    ]);
    const muted = muteActive(member);
    const group = member.conversation;
    return {
      id,
      name: group.nameHe ?? '',
      memberCount: group.memberCount,
      createdAt: group.createdAt.toISOString(),
      lastMessageAt: group.lastMessageAt?.toISOString() ?? null,
      lastSeq: group.lastSeq,
      myLastReadSeq: member.lastReadSeq,
      role: member.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
      unreadCount: unread[0]?.count ?? 0,
      markedUnread: member.markedUnread,
      muted,
      mutedUntil: muted ? (member.mutedUntil?.toISOString() ?? null) : null,
      archived: member.archivedAt !== null,
      pinned: member.pinnedAt !== null,
      sendState,
    };
  }

  async rename(
    principal: Principal,
    id: string,
    name: string,
    meta: RequestMeta,
  ): Promise<GroupDto> {
    await this.admin(principal.userId, id);
    await this.prisma.conversation.update({ where: { id }, data: { nameHe: name } });
    await this.record('chat.group.rename', principal.userId, id, meta, {});
    await this.stream.publishRoom(id, { type: 'room', conversationId: id });
    return this.get(principal, id);
  }

  /** Mute, archive, pin or mark as unread: the reader's own settings of a group. */
  async update(
    principal: Principal,
    id: string,
    input: ConversationSettingsDto,
  ): Promise<GroupDto> {
    const me = principal.userId;
    await this.member(me, id);
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
    await this.stream.publish([me], { type: 'markers', conversationId: id, userId: me });
    return this.get(principal, id);
  }

  /**
   * Leaves a group. What the person wrote stays. When the admin leaves, whoever has been in
   * the group longest runs it from then on.
   */
  async leave(principal: Principal, id: string): Promise<void> {
    const me = principal.userId;
    if (!(await this.drop(id, me))) throw new AppException('NOT_FOUND');
    await this.gone(id, me);
  }

  /** Everyone in the group, the admin first. For the people in it. */
  async members(principal: Principal, id: string, q?: string): Promise<GroupMembersDto> {
    await this.member(principal.userId, id);
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId: id },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      select: { userId: true, role: true },
    });
    const cards = await this.directory.cards(rows.map((row) => row.userId));
    const wanted = q?.toLocaleLowerCase();
    const items = rows
      .map((row) => ({
        ...personView(row.userId, cards.get(row.userId)),
        role: row.role === 'ADMIN' ? ('ADMIN' as const) : ('MEMBER' as const),
      }))
      .filter(
        (person) =>
          !wanted ||
          `${person.firstName ?? ''} ${person.lastName ?? ''}`.toLocaleLowerCase().includes(wanted),
      );
    items.sort((a, b) => Number(b.role === 'ADMIN') - Number(a.role === 'ADMIN'));
    return { items };
  }

  /** The admin takes a person out of the group. They can be invited again. */
  async removeMember(
    principal: Principal,
    id: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const me = principal.userId;
    await this.admin(me, id);
    if (userId === me) {
      throw new AppException('FORBIDDEN', [{ code: 'chatModerateSelf' }]);
    }
    if (!(await this.drop(id, userId))) throw new AppException('NOT_FOUND');
    await this.gone(id, userId);
    await this.record('chat.group.member.remove', me, id, meta, { userId });
  }

  /** The admin hands the group to another of its people. */
  async passAdmin(
    principal: Principal,
    id: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<GroupDto> {
    const me = principal.userId;
    await this.admin(me, id);
    if (userId !== me) {
      const moved = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.conversationMember.updateMany({
          where: { conversationId: id, userId },
          data: { role: 'ADMIN' },
        });
        if (count === 0) return false;
        await tx.conversationMember.update({
          where: { conversationId_userId: { conversationId: id, userId: me } },
          data: { role: 'MEMBER' },
        });
        return true;
      });
      if (!moved) throw new AppException('NOT_FOUND');
      await this.record('chat.group.admin', me, id, meta, { userId });
      await this.stream.publishRoom(id, { type: 'room', conversationId: id });
    }
    return this.get(principal, id);
  }

  // --- Messages -------------------------------------------------------------------------------

  async messages(
    principal: Principal,
    id: string,
    query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    await this.member(principal.userId, id);
    return this.msgs.page(id, principal.userId, query);
  }

  async send(
    principal: Principal,
    id: string,
    input: Pick<RoomSendDto, 'body' | 'replyToId' | 'mentions' | 'attachmentIds'>,
    idempotencyKey: string | undefined,
    forwarded?: ForwardedContent,
  ): Promise<{ message: MessageDto; created: boolean }> {
    const me = principal.userId;
    ensureIdempotencyKey(idempotencyKey);
    await this.member(me, id);
    switch (await this.sendState(principal)) {
      case 'membersOnly':
        throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
      case 'suspended':
        throw new AppException('FORBIDDEN', [{ code: 'chatSuspended' }]);
      case 'none':
    }
    if (idempotencyKey) {
      const sent = await this.msgs.sentWith(me, idempotencyKey);
      if (sent) return { message: await this.msgs.view(sent, me), created: false };
    }
    await this.msgs.ensureReplyTarget(id, input.replyToId);
    const others = (
      await this.prisma.conversationMember.findMany({
        where: { conversationId: id, userId: { not: me } },
        select: { userId: true },
      })
    ).map((row) => row.userId);
    const mentions = [...new Set(input.mentions ?? [])].filter((userId) => userId !== me);
    if (mentions.some((userId) => !others.includes(userId))) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'mentions', code: 'chatMentionNotInRoom' },
      ]);
    }
    const { row, created } = await this.msgs.append({
      conversationId: id,
      senderId: me,
      body: forwarded?.body ?? input.body,
      replyToId: input.replyToId,
      idempotencyKey,
      mentions,
      forwarded: forwarded !== undefined,
      attachmentIds:
        forwarded?.fileIds ?? (await this.msgs.ownUnusedFiles(me, input.attachmentIds)),
      // A group is small, so a new message brings it back from its people's archive.
      unarchiveOthers: true,
    });
    if (created) {
      await this.stream.publishRoom(id, {
        type: 'message.new',
        conversationId: id,
        messageId: row.id,
        seq: row.seq,
      });
      await this.notifier.messageSent(id, others, `/chat/groups/${id}`);
    }
    return { message: await this.msgs.view(row, me), created };
  }

  /** Marks the group as read for the reader, up to a message or to its end. */
  async read(principal: Principal, id: string, seq?: number): Promise<void> {
    const me = principal.userId;
    const member = await this.member(me, id);
    const last = member.conversation.lastSeq;
    const lastReadSeq = Math.max(member.lastReadSeq, Math.min(seq ?? last, last));
    if (lastReadSeq === member.lastReadSeq && !member.markedUnread) return;
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: me } },
      data: { lastReadSeq, lastDeliveredSeq: lastReadSeq, markedUnread: false },
    });
    // Only the reader's own windows are told: a group shows nobody who read what.
    await this.stream.publish([me], { type: 'markers', conversationId: id, userId: me });
  }

  /** "… is typing", to the others in the group. Nothing is stored. */
  async typing(principal: Principal, id: string): Promise<void> {
    const me = principal.userId;
    await this.member(me, id);
    const [settings, state] = await Promise.all([
      this.access.settings([me]),
      this.sendState(principal),
    ]);
    if (!settings.get(me)!.typing || state !== 'none') return;
    await this.stream.publishRoom(id, { type: 'typing', conversationId: id, userId: me }, me);
  }

  // --- Used by invitations --------------------------------------------------------------------

  /**
   * Adds a person to a group inside the caller's transaction, counting them once and never
   * past the limit. Answers whether they were new; throws when the group is full.
   */
  async addInside(tx: Prisma.TransactionClient, id: string, userId: string): Promise<boolean> {
    const inserted = await tx.$queryRaw<{ userId: string }[]>`
      INSERT INTO conversation_members
        (conversation_id, user_id, role, last_read_seq, last_delivered_seq)
      SELECT c.id, ${userId}::uuid, 'MEMBER', c.last_seq, c.last_seq
      FROM conversations c
      WHERE c.id = ${id}::uuid AND c.kind = 'GROUP'
      ON CONFLICT (conversation_id, user_id) DO NOTHING
      RETURNING user_id AS "userId"`;
    if (inserted.length === 0) return false;
    const counted = await tx.$executeRaw`
      UPDATE conversations SET member_count = member_count + 1
      WHERE id = ${id}::uuid AND member_count < ${GROUP_MAX_MEMBERS}`;
    if (counted === 0) throw new GroupFull();
    return true;
  }

  /** Turns "the group is full" from inside a transaction into the answer a person gets. */
  static full(error: unknown): unknown {
    return error instanceof GroupFull
      ? new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatGroupFull' }])
      : error;
  }

  /** The reader's role in a group, or null when they are not in it. */
  async roleOf(userId: string, id: string): Promise<'ADMIN' | 'MEMBER' | null> {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: id, userId, conversation: { kind: 'GROUP' } },
      select: { role: true },
    });
    return member ? (member.role === 'ADMIN' ? 'ADMIN' : 'MEMBER') : null;
  }

  // --- Internals ------------------------------------------------------------------------------

  /** The reader's own place in a group, or "not found" (also for a room or a conversation). */
  private async member(userId: string, id: string) {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: id, userId, conversation: { kind: 'GROUP' } },
      select: {
        role: true,
        lastReadSeq: true,
        markedUnread: true,
        conversation: { select: { lastSeq: true } },
      },
    });
    if (!member) throw new AppException('NOT_FOUND');
    return member;
  }

  /** The group's admin. One of its other people is refused; anyone else finds nothing. */
  private async admin(userId: string, id: string): Promise<void> {
    const member = await this.member(userId, id);
    if (member.role !== 'ADMIN') throw new AppException('FORBIDDEN');
  }

  private async sendState(principal: Principal): Promise<GroupSendState> {
    if (!this.access.isVerified(principal)) return 'membersOnly';
    if (await this.access.suspended(principal.userId)) return 'suspended';
    return 'none';
  }

  /**
   * Takes a person out of a group, counting them out once. When they ran it, the person who
   * has been in it longest runs it now. Answers whether they were in it.
   */
  private drop(id: string, userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.$queryRaw<{ role: string }[]>`
        DELETE FROM conversation_members m
        USING conversations c
        WHERE c.id = m.conversation_id AND c.kind = 'GROUP'
          AND m.conversation_id = ${id}::uuid AND m.user_id = ${userId}::uuid
        RETURNING m.role::text AS role`;
      if (removed.length === 0) return false;
      await tx.$executeRaw`
        UPDATE conversations SET member_count = member_count - 1 WHERE id = ${id}::uuid`;
      if (removed[0]!.role === 'ADMIN') {
        await tx.$executeRaw`
          UPDATE conversation_members SET role = 'ADMIN'
          WHERE conversation_id = ${id}::uuid
            AND user_id = (
              SELECT user_id FROM conversation_members
              WHERE conversation_id = ${id}::uuid
              ORDER BY joined_at, user_id
              LIMIT 1
            )`;
      }
      // An empty group is closed: nobody can be waiting to come into it.
      await tx.$executeRaw`
        UPDATE conversation_invitations
        SET status = 'WITHDRAWN', resolved_at = now()
        WHERE conversation_id = ${id}::uuid AND status = 'OPEN'
          AND NOT EXISTS (
            SELECT 1 FROM conversation_members WHERE conversation_id = ${id}::uuid
          )`;
      return true;
    });
  }

  /** A person is out: their open pages stop hearing the group, and the others see the change. */
  private async gone(id: string, userId: string): Promise<void> {
    await this.stream.setPresence(userId, id, false);
    await this.stream.publish([userId], { type: 'room.left', conversationId: id });
    await this.stream.publishRoom(id, { type: 'room', conversationId: id });
  }

  private async record(
    action: string,
    actorUserId: string,
    id: string,
    meta: RequestMeta,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId,
      actorIp: meta.ip,
      entityType: 'chat_group',
      entityId: id,
      changes,
    });
  }
}
