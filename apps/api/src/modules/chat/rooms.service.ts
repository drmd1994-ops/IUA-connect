import { Injectable, type OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { FilesService } from '../files';
import { DirectoryService } from '../profiles';
import { ChatAccess } from './chat-access';
import { ChatMessages, MESSAGE_SELECT, personView } from './chat-messages';
import {
  MAX_PINS,
  type MuteChoice,
  ROOM_MEMBERS_PAGE_SIZE,
  type RoomSendState,
  lockActive,
  muteActive,
  muteFor,
  roomSendState,
} from './chat-rules';
import { ChatStream } from './chat-stream';
import {
  type MessageDto,
  type MessageListDto,
  type MessageListQueryDto,
  type RoomBanDto,
  type RoomBanInputDto,
  type RoomBanListDto,
  type RoomCategoriesDto,
  type RoomDetailDto,
  type RoomListDto,
  type RoomListQueryDto,
  type RoomMembersDto,
  type RoomMembersQueryDto,
  type RoomPinsDto,
  type RoomSendDto,
  type RoomSettingsDto,
} from './chat.dto';
import { ChatService, ensureIdempotencyKey } from './chat.service';
import { RoomNotifier } from './room-notifier';

const DAY_MS = 24 * 60 * 60 * 1000;

interface RoomRow {
  id: string;
  nameHe: string;
  nameEn: string | null;
  descriptionHe: string | null;
  descriptionEn: string | null;
  pictureFileId: string | null;
  memberCount: number;
  moderatorsOnly: boolean;
  locked: boolean;
  lockedUntil: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  lastMessageAt: Date | null;
  lastSeq: number;
  activityAt: Date;
  categoryId: string | null;
  categoryKey: string | null;
  categoryNameHe: string | null;
  categoryNameEn: string | null;
  role: 'MEMBER' | 'MODERATOR' | null;
  lastReadSeq: number | null;
  markedUnread: boolean | null;
  muted: boolean | null;
  mutedUntil: Date | null;
  unreadCount: number;
}

/** Who is asking about a room, as far as its rules are concerned. */
interface Standing {
  /** The reader's place in the room; null when they are not in it. */
  role: 'MEMBER' | 'MODERATOR' | null;
  /** Staff with the chat permission: may read any room and act as a moderator. */
  staff: boolean;
  activeMember: boolean;
}

/**
 * Chat rooms (M12 plan §2–§5): rooms the association opened, which any active member can
 * join. A room is a conversation of kind ROOM, so its messages, markers and search are the
 * ones private chat has.
 *
 * Who may do what:
 * - **See the list of rooms and a room's details:** active members, and staff with the chat
 *   permission. Someone in a room keeps seeing it after their membership ends.
 * - **Read its messages:** people in the room, and staff.
 * - **Write:** people in the room with an active membership who are not suspended, unless the
 *   room is locked, archived or for announcements (moderators still write).
 * - **Moderate:** the room's moderators, and staff.
 * Nothing of a room's content is ever returned to someone who may not read it.
 */
@Injectable()
export class RoomsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccess,
    private readonly msgs: ChatMessages,
    private readonly chat: ChatService,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly notifier: RoomNotifier,
  ) {}

  /** A room's picture is readable by whoever may see the list of rooms. */
  onModuleInit(): void {
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const room = await this.prisma.conversation.findFirst({
          where: { pictureFileId: fileId, kind: 'ROOM' },
          select: { id: true },
        });
        if (!room) return null;
        if (!principal) return false;
        return isStaff(principal) || (await this.access.isActiveMember(principal));
      },
    });
  }

  // --- Finding rooms --------------------------------------------------------------------------

  /** Every open room, newest activity first, for "Browse rooms". */
  async browse(principal: Principal, query: RoomListQueryDto): Promise<RoomListDto> {
    await this.ensureMayBrowse(principal);
    return this.list(
      principal.userId,
      Prisma.sql`c.archived_at IS NULL
        ${query.categoryId ? Prisma.sql`AND c.category_id = ${query.categoryId}::uuid` : Prisma.empty}`,
      query,
    );
  }

  /** The rooms the reader is in, newest activity first, each with its unread count. */
  async mine(principal: Principal, query: RoomListQueryDto): Promise<RoomListDto> {
    return this.list(principal.userId, Prisma.sql`m.user_id IS NOT NULL`, query);
  }

  async categories(principal: Principal): Promise<RoomCategoriesDto> {
    await this.ensureMayBrowse(principal);
    const items = await this.prisma.chatRoomCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: { id: true, key: true, nameHe: true, nameEn: true },
    });
    return { items };
  }

  async get(principal: Principal, id: string): Promise<RoomDetailDto> {
    const me = principal.userId;
    const { row, standing } = await this.room(principal, id);
    const [moderators, suspended, banned] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { conversationId: id, role: 'MODERATOR' },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true },
      }),
      this.access.suspended(me),
      this.banned(id, me),
    ]);
    const cards = await this.directory.cards(moderators.map((m) => m.userId));
    // Staff reading a room they are not in still hear its events while their page is open.
    if (standing.role === null && standing.staff) await this.stream.setPresence(me, id, true);
    return {
      ...roomView(row),
      lastSeq: row.lastSeq,
      myLastReadSeq: row.lastReadSeq ?? 0,
      sendState: roomSendState(row, { ...standing, suspended }),
      canModerate: canModerate(standing),
      banned,
      moderators: moderators.map((m) => personView(m.userId, cards.get(m.userId))),
    };
  }

  // --- Joining and leaving --------------------------------------------------------------------

  /**
   * Joins a room. The newcomer starts at the room's end: what was said before is there to
   * read, and doesn't count as unread. Their name is shown to the people in the room.
   */
  async join(principal: Principal, id: string): Promise<RoomDetailDto> {
    const me = principal.userId;
    await this.access.ensureActiveMember(principal);
    const room = await this.prisma.conversation.findFirst({
      where: { id, kind: 'ROOM', archivedAt: null },
      select: { id: true },
    });
    if (!room) throw new AppException('NOT_FOUND');
    if (await this.banned(id, me)) {
      throw new AppException('FORBIDDEN', [{ code: 'chatRoomBanned' }]);
    }
    const own = (await this.directory.cards([me])).get(me);
    if (!own?.firstName?.trim() || !own.lastName?.trim()) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatNameRequired' }]);
    }
    const joined = await this.addMember(id, me, 'MEMBER');
    if (joined) await this.stream.setPresence(me, id, true);
    return this.get(principal, id);
  }

  /** Leaves a room. What the person wrote stays; their place in it is forgotten. */
  async leave(principal: Principal, id: string): Promise<void> {
    const me = principal.userId;
    if (await this.dropMember(id, me)) {
      await this.stream.setPresence(me, id, false);
      await this.stream.publish([me], { type: 'room.left', conversationId: id });
    }
  }

  /** The people in a room, moderators first. For people in the room, and staff. */
  async members(
    principal: Principal,
    id: string,
    query: RoomMembersQueryDto,
  ): Promise<RoomMembersDto> {
    await this.reader(principal, id);
    const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
    const filter = pattern
      ? Prisma.sql`AND (
          normalize_he(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
            LIKE normalize_he(${pattern})
          OR normalize_he(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, ''))
            LIKE normalize_he(${pattern})
        )`
      : Prisma.empty;
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<{ userId: string; role: 'MEMBER' | 'MODERATOR' }[]>`
        SELECT m.user_id AS "userId", m.role::text AS role
        FROM conversation_members m
        LEFT JOIN profiles p ON p.user_id = m.user_id
        WHERE m.conversation_id = ${id}::uuid ${filter}
        ORDER BY (m.role = 'MODERATOR') DESC, p.last_name NULLS LAST, p.first_name NULLS LAST,
                 m.user_id
        LIMIT ${ROOM_MEMBERS_PAGE_SIZE} OFFSET ${(query.page - 1) * ROOM_MEMBERS_PAGE_SIZE}`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM conversation_members m
        LEFT JOIN profiles p ON p.user_id = m.user_id
        WHERE m.conversation_id = ${id}::uuid ${filter}`,
    ]);
    const cards = await this.directory.cards(rows.map((row) => row.userId));
    return {
      items: rows.map((row) => ({
        ...personView(row.userId, cards.get(row.userId)),
        role: row.role,
      })),
      total: total[0]?.count ?? 0,
      page: query.page,
      pageSize: ROOM_MEMBERS_PAGE_SIZE,
    };
  }

  // --- Messages -------------------------------------------------------------------------------

  async messages(
    principal: Principal,
    id: string,
    query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    await this.reader(principal, id);
    return this.msgs.page(id, principal.userId, query);
  }

  async send(
    principal: Principal,
    id: string,
    input: RoomSendDto,
    idempotencyKey: string | undefined,
  ): Promise<{ message: MessageDto; created: boolean }> {
    const me = principal.userId;
    ensureIdempotencyKey(idempotencyKey);
    const { row: room, standing } = await this.room(principal, id);
    this.ensureCanSend(
      roomSendState(room, { ...standing, suspended: await this.access.suspended(me) }),
    );
    if (input.announcement && standing.role !== 'MODERATOR') {
      throw new AppException('FORBIDDEN', [{ code: 'chatModeratorsOnly' }]);
    }

    if (idempotencyKey) {
      const sent = await this.msgs.sentWith(me, idempotencyKey);
      if (sent) return { message: await this.msgs.view(sent, me), created: false };
    }
    await this.msgs.ensureReplyTarget(id, input.replyToId);
    const mentions = [...new Set(input.mentions ?? [])].filter((userId) => userId !== me);
    if (mentions.length > 0) {
      const present = await this.prisma.conversationMember.count({
        where: { conversationId: id, userId: { in: mentions } },
      });
      if (present !== mentions.length) {
        throw new AppException('VALIDATION_FAILED', [
          { field: 'mentions', code: 'chatMentionNotInRoom' },
        ]);
      }
    }
    const { row, created } = await this.msgs.append({
      conversationId: id,
      senderId: me,
      body: input.body,
      replyToId: input.replyToId,
      idempotencyKey,
      announcement: input.announcement ?? false,
      mentions,
      unarchiveOthers: false,
    });
    if (created) {
      await this.stream.publishRoom(id, {
        type: 'message.new',
        conversationId: id,
        messageId: row.id,
        seq: row.seq,
      });
      await this.notifier.roomMessage({
        roomId: id,
        nameHe: room.nameHe,
        nameEn: room.nameEn,
        senderId: me,
        mentions,
        replyToSenderId: row.replyTo?.senderId ?? null,
        announcement: row.announcement,
      });
    }
    return { message: await this.msgs.view(row, me), created };
  }

  /** Marks the room as read for the reader, up to a message or to its end. */
  async read(principal: Principal, id: string, seq?: number): Promise<void> {
    const me = principal.userId;
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: id, userId: me, conversation: { kind: 'ROOM' } },
      select: {
        lastReadSeq: true,
        markedUnread: true,
        conversation: { select: { lastSeq: true } },
      },
    });
    if (!member) throw new AppException('NOT_FOUND');
    const last = member.conversation.lastSeq;
    const lastReadSeq = Math.max(member.lastReadSeq, Math.min(seq ?? last, last));
    if (lastReadSeq === member.lastReadSeq && !member.markedUnread) return;
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: me } },
      data: { lastReadSeq, lastDeliveredSeq: lastReadSeq, markedUnread: false },
    });
    // Only the reader's own windows are told: a room shows nobody who read what.
    await this.stream.publish([me], { type: 'markers', conversationId: id, userId: me });
  }

  /** Mute, or mark as unread: the reader's own settings of a room. */
  async update(principal: Principal, id: string, input: RoomSettingsDto): Promise<RoomDetailDto> {
    const me = principal.userId;
    const { count } = await this.prisma.conversationMember.updateMany({
      where: { conversationId: id, userId: me, conversation: { kind: 'ROOM' } },
      data: {
        ...(input.mute ? muteFor(input.mute as MuteChoice) : {}),
        ...(input.markedUnread ? { markedUnread: true } : {}),
      },
    });
    if (count === 0) throw new AppException('NOT_FOUND');
    await this.stream.publish([me], { type: 'markers', conversationId: id, userId: me });
    return this.get(principal, id);
  }

  /** "… is typing", to the others in the room. Nothing is stored. */
  async typing(principal: Principal, id: string): Promise<void> {
    const me = principal.userId;
    const { row, standing } = await this.room(principal, id);
    if (standing.role === null) return;
    const [settings, suspended] = await Promise.all([
      this.access.settings([me]),
      this.access.suspended(me),
    ]);
    if (!settings.get(me)!.typing) return;
    if (roomSendState(row, { ...standing, suspended }) !== 'none') return;
    await this.stream.publishRoom(id, { type: 'typing', conversationId: id, userId: me }, me);
  }

  // --- Pins -----------------------------------------------------------------------------------

  async pins(principal: Principal, id: string): Promise<RoomPinsDto> {
    await this.reader(principal, id);
    const rows = await this.prisma.messagePin.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, message: { select: MESSAGE_SELECT } },
    });
    const views = await this.msgs.views(
      rows.map((row) => row.message),
      principal.userId,
    );
    return {
      items: rows.map((row, index) => ({
        message: views[index]!,
        pinnedAt: row.createdAt.toISOString(),
      })),
    };
  }

  async pin(principal: Principal, id: string, messageId: string, meta: RequestMeta): Promise<void> {
    await this.moderator(principal, id);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: id, deletedAt: null },
      select: { id: true },
    });
    if (!message) throw new AppException('NOT_FOUND');
    const pinned = await this.prisma.messagePin.findMany({
      where: { conversationId: id },
      select: { messageId: true },
    });
    if (pinned.some((pin) => pin.messageId === messageId)) return;
    if (pinned.length >= MAX_PINS) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatPinLimit' }]);
    }
    try {
      await this.prisma.messagePin.create({
        data: { conversationId: id, messageId, pinnedBy: principal.userId },
      });
    } catch (error) {
      // Two moderators pinned the fifth at once: the database kept the limit.
      if (String((error as Error).message).includes('at most five')) {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatPinLimit' }]);
      }
      throw error;
    }
    await this.moderated('chat.room.pin', principal, id, meta, { messageId });
  }

  async unpin(
    principal: Principal,
    id: string,
    messageId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.moderator(principal, id);
    const { count } = await this.prisma.messagePin.deleteMany({
      where: { conversationId: id, messageId },
    });
    if (count > 0) await this.moderated('chat.room.unpin', principal, id, meta, { messageId });
  }

  // --- Moderation -----------------------------------------------------------------------------

  /** A moderator deletes a message: "removed by a moderator" stays in its place. */
  async removeMessage(
    principal: Principal,
    id: string,
    messageId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.moderator(principal, id);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: id },
      select: { id: true, senderId: true },
    });
    if (!message) throw new AppException('NOT_FOUND');
    if (await this.chat.removeAsStaff(messageId, principal.userId)) {
      // The text is never written to the audit log.
      await this.moderated('chat.room.message.remove', principal, id, meta, {
        messageId,
        senderId: message.senderId,
      });
    }
  }

  /** Stops writing for everyone but moderators, until unlocked or until a time. */
  async lock(
    principal: Principal,
    id: string,
    minutes: number | null,
    meta: RequestMeta,
  ): Promise<RoomDetailDto> {
    await this.moderator(principal, id);
    await this.prisma.conversation.update({
      where: { id },
      data: {
        locked: true,
        lockedUntil: minutes === null ? null : new Date(Date.now() + minutes * 60 * 1000),
      },
    });
    await this.moderated('chat.room.lock', principal, id, meta, { minutes });
    return this.get(principal, id);
  }

  async unlock(principal: Principal, id: string, meta: RequestMeta): Promise<RoomDetailDto> {
    await this.moderator(principal, id);
    await this.prisma.conversation.update({
      where: { id },
      data: { locked: false, lockedUntil: null },
    });
    await this.moderated('chat.room.unlock', principal, id, meta, {});
    return this.get(principal, id);
  }

  /** Takes a person out of the room. They may join again. */
  async removeMember(
    principal: Principal,
    id: string,
    userId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    const standing = await this.moderator(principal, id);
    await this.ensureMayActOn(standing, principal, id, userId);
    if (!(await this.dropMember(id, userId))) throw new AppException('NOT_FOUND');
    await this.expel(id, userId);
    await this.moderated('chat.room.member.remove', principal, id, meta, { userId, reason });
  }

  /** Bans a person from the room: out now, and unable to join until it ends or is lifted. */
  async ban(
    principal: Principal,
    id: string,
    input: RoomBanInputDto,
    meta: RequestMeta,
  ): Promise<RoomBanDto> {
    const standing = await this.moderator(principal, id);
    await this.ensureMayActOn(standing, principal, id, input.userId);
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) throw new AppException('NOT_FOUND');
    if (await this.banned(id, input.userId)) {
      throw new AppException('CONFLICT', [{ code: 'chatAlreadyBanned' }]);
    }
    const banId = uuidv7();
    const now = new Date();
    await this.prisma.conversationBan.create({
      data: {
        id: banId,
        conversationId: id,
        userId: input.userId,
        createdBy: principal.userId,
        reason: input.reason,
        startsAt: now,
        endsAt: input.days === null ? null : new Date(now.getTime() + input.days * DAY_MS),
      },
    });
    if (await this.dropMember(id, input.userId)) await this.expel(id, input.userId);
    await this.moderated('chat.room.ban', principal, id, meta, {
      userId: input.userId,
      days: input.days,
      reason: input.reason,
    });
    return (await this.banViews([banId]))[0]!;
  }

  async bans(principal: Principal, id: string): Promise<RoomBanListDto> {
    await this.moderator(principal, id);
    const rows = await this.prisma.conversationBan.findMany({
      where: { conversationId: id },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true },
    });
    return { items: await this.banViews(rows.map((row) => row.id)) };
  }

  async liftBan(
    principal: Principal,
    id: string,
    banId: string,
    meta: RequestMeta,
  ): Promise<RoomBanDto> {
    await this.moderator(principal, id);
    const ban = await this.prisma.conversationBan.findFirst({
      where: { id: banId, conversationId: id },
      select: { userId: true, liftedAt: true },
    });
    if (!ban) throw new AppException('NOT_FOUND');
    if (!ban.liftedAt) {
      await this.prisma.conversationBan.update({
        where: { id: banId },
        data: { liftedAt: new Date(), liftedBy: principal.userId },
      });
      await this.audit.record({
        action: 'chat.room.ban.lift',
        correlationId: meta.correlationId,
        actorUserId: principal.userId,
        actorIp: meta.ip,
        entityType: 'chat_room',
        entityId: id,
        changes: { userId: ban.userId },
      });
    }
    return (await this.banViews([banId]))[0]!;
  }

  // --- Used by the admin service --------------------------------------------------------------

  /** Adds a person to a room, counting them once. Answers whether they were new. */
  async addMember(id: string, userId: string, role: 'MEMBER' | 'MODERATOR'): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<{ userId: string }[]>`
        INSERT INTO conversation_members
          (conversation_id, user_id, role, last_read_seq, last_delivered_seq)
        SELECT c.id, ${userId}::uuid, ${role}::conversation_member_role, c.last_seq, c.last_seq
        FROM conversations c
        WHERE c.id = ${id}::uuid
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        RETURNING user_id AS "userId"`;
      if (inserted.length === 0) return false;
      await tx.$executeRaw`
        UPDATE conversations SET member_count = member_count + 1 WHERE id = ${id}::uuid`;
      return true;
    });
  }

  /** Takes a person out of a room, counting them out once. Answers whether they were in it. */
  async dropMember(id: string, userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.$queryRaw<{ userId: string }[]>`
        DELETE FROM conversation_members m
        USING conversations c
        WHERE c.id = m.conversation_id AND c.kind = 'ROOM'
          AND m.conversation_id = ${id}::uuid AND m.user_id = ${userId}::uuid
        RETURNING m.user_id AS "userId"`;
      if (removed.length === 0) return false;
      await tx.$executeRaw`
        UPDATE conversations SET member_count = member_count - 1 WHERE id = ${id}::uuid`;
      return true;
    });
  }

  /** Whether a ban of this person from this room is in force now. */
  async banned(id: string, userId: string, now = new Date()): Promise<boolean> {
    const ban = await this.prisma.conversationBan.findFirst({
      where: {
        conversationId: id,
        userId,
        liftedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true },
    });
    return ban !== null;
  }

  // --- Internals ------------------------------------------------------------------------------

  private async standing(principal: Principal, role: Standing['role']): Promise<Standing> {
    return {
      role,
      staff: isStaff(principal),
      activeMember: await this.access.isActiveMember(principal),
    };
  }

  private async ensureMayBrowse(principal: Principal): Promise<void> {
    if (isStaff(principal)) return;
    await this.access.ensureActiveMember(principal);
  }

  /**
   * A room the reader may know about: they are in it, or they are an active member or staff
   * and the room is not archived. Anything else is "members only" (for someone with no place
   * in chat) or "not found".
   */
  private async room(
    principal: Principal,
    id: string,
  ): Promise<{ row: RoomRow; standing: Standing }> {
    const [row] = await this.rows(principal.userId, Prisma.sql`c.id = ${id}::uuid`, 1);
    const standing = await this.standing(principal, row?.role ?? null);
    if (standing.role === null && !standing.staff && !standing.activeMember) {
      throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
    }
    if (!row) throw new AppException('NOT_FOUND');
    if (row.archivedAt && standing.role === null && !standing.staff) {
      throw new AppException('NOT_FOUND');
    }
    return { row, standing };
  }

  /** Someone who may read the room's messages: in the room, or staff. */
  private async reader(principal: Principal, id: string): Promise<Standing> {
    const { standing } = await this.room(principal, id);
    if (standing.role === null && !standing.staff) {
      throw new AppException('FORBIDDEN', [{ code: 'chatRoomNotJoined' }]);
    }
    return standing;
  }

  /**
   * Someone who may moderate the room: one of its moderators (with an active membership), or
   * staff. A member of the room who is not a moderator is refused; for anyone else the room's
   * moderation doesn't exist.
   */
  private async moderator(principal: Principal, id: string): Promise<Standing> {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: id, userId: principal.userId, conversation: { kind: 'ROOM' } },
      select: { role: true },
    });
    const standing = await this.standing(principal, member?.role ?? null);
    if (canModerate(standing)) {
      const exists = await this.prisma.conversation.count({ where: { id, kind: 'ROOM' } });
      if (exists === 0) throw new AppException('NOT_FOUND');
      return standing;
    }
    throw new AppException(member ? 'FORBIDDEN' : 'NOT_FOUND');
  }

  /** Nobody acts on themselves, and a moderator doesn't act on another moderator (staff do). */
  private async ensureMayActOn(
    standing: Standing,
    principal: Principal,
    id: string,
    userId: string,
  ): Promise<void> {
    if (userId === principal.userId) {
      throw new AppException('FORBIDDEN', [{ code: 'chatModerateSelf' }]);
    }
    if (standing.staff) return;
    const target = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
      select: { role: true },
    });
    if (target?.role === 'MODERATOR') {
      throw new AppException('FORBIDDEN', [{ code: 'chatModerateModerator' }]);
    }
  }

  private ensureCanSend(state: RoomSendState): void {
    switch (state) {
      case 'none':
        return;
      case 'membersOnly':
        throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
      case 'suspended':
        throw new AppException('FORBIDDEN', [{ code: 'chatSuspended' }]);
      case 'notJoined':
        throw new AppException('FORBIDDEN', [{ code: 'chatRoomNotJoined' }]);
      case 'archived':
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatRoomArchived' }]);
      case 'locked':
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatRoomLocked' }]);
      case 'moderatorsOnly':
        throw new AppException('FORBIDDEN', [{ code: 'chatModeratorsOnly' }]);
    }
  }

  /** A person was taken out: their open pages stop hearing the room, and are told. */
  private async expel(id: string, userId: string): Promise<void> {
    await this.stream.setPresence(userId, id, false);
    await this.stream.publish([userId], { type: 'room.left', conversationId: id });
  }

  /** Records a moderation action and tells the room's open pages that it changed. */
  private async moderated(
    action: string,
    principal: Principal,
    id: string,
    meta: RequestMeta,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'chat_room',
      entityId: id,
      changes,
    });
    await this.stream.publishRoom(id, { type: 'room', conversationId: id });
  }

  private async banViews(ids: readonly string[]): Promise<RoomBanDto[]> {
    const rows = await this.prisma.conversationBan.findMany({
      where: { id: { in: [...ids] } },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    });
    const cards = await this.directory.cards(rows.map((row) => row.userId));
    const now = new Date();
    return rows.map((row) => {
      const card = cards.get(row.userId);
      return {
        id: row.id,
        user: {
          id: row.userId,
          firstName: card?.firstName ?? null,
          lastName: card?.lastName ?? null,
        },
        reason: row.reason,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
        liftedAt: row.liftedAt?.toISOString() ?? null,
        active: row.liftedAt === null && (row.endsAt === null || row.endsAt > now),
      };
    });
  }

  private async list(me: string, where: Prisma.Sql, query: RoomListQueryDto): Promise<RoomListDto> {
    const cursor = query.cursor ? parseCursor(query.cursor) : null;
    const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
    const rows = await this.rows(
      me,
      Prisma.sql`${where}
        ${
          cursor
            ? Prisma.sql`AND (coalesce(c.last_message_at, c.created_at), c.id)
                           < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
            : Prisma.empty
        }
        ${
          pattern
            ? Prisma.sql`AND (
                normalize_he(c.name_he) LIKE normalize_he(${pattern})
                OR normalize_he(coalesce(c.name_en, '')) LIKE normalize_he(${pattern})
              )`
            : Prisma.empty
        }`,
      query.limit + 1,
    );
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(roomView),
      nextCursor:
        rows.length > query.limit && last ? `${last.activityAt.toISOString()}|${last.id}` : null,
    };
  }

  /** Rooms that match, each with the reader's own place in it (empty when they are not in it). */
  private rows(me: string, where: Prisma.Sql, limit: number): Promise<RoomRow[]> {
    return this.prisma.$queryRaw<RoomRow[]>`
      SELECT c.id, c.name_he AS "nameHe", c.name_en AS "nameEn",
             c.description_he AS "descriptionHe", c.description_en AS "descriptionEn",
             c.picture_file_id AS "pictureFileId", c.member_count AS "memberCount",
             c.moderators_only AS "moderatorsOnly", c.locked, c.locked_until AS "lockedUntil",
             c.archived_at AS "archivedAt", c.created_at AS "createdAt",
             c.last_message_at AS "lastMessageAt", c.last_seq AS "lastSeq",
             coalesce(c.last_message_at, c.created_at) AS "activityAt",
             cat.id AS "categoryId", cat.key AS "categoryKey",
             cat.name_he AS "categoryNameHe", cat.name_en AS "categoryNameEn",
             m.role::text AS role, m.last_read_seq AS "lastReadSeq",
             m.marked_unread AS "markedUnread", m.muted, m.muted_until AS "mutedUntil",
             CASE WHEN m.user_id IS NULL THEN 0 ELSE (
               SELECT count(*)::int FROM messages x
               WHERE x.conversation_id = c.id
                 AND x.seq > m.last_read_seq
                 AND x.sender_id IS DISTINCT FROM ${me}::uuid
                 AND x.deleted_at IS NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM message_hides h
                   WHERE h.message_id = x.id AND h.user_id = ${me}::uuid
                 )
             ) END AS "unreadCount"
      FROM conversations c
      LEFT JOIN chat_room_categories cat ON cat.id = c.category_id
      LEFT JOIN conversation_members m
        ON m.conversation_id = c.id AND m.user_id = ${me}::uuid
      WHERE c.kind = 'ROOM' AND ${where}
      ORDER BY coalesce(c.last_message_at, c.created_at) DESC, c.id DESC
      LIMIT ${limit}`;
  }
}

const isStaff = (principal: Principal): boolean => principal.permissions.has('chat.moderate');

/** A moderator must still be an active member; staff moderate by their permission. */
const canModerate = (standing: Standing): boolean =>
  standing.staff || (standing.role === 'MODERATOR' && standing.activeMember);

function roomView(row: RoomRow): RoomListDto['items'][number] {
  const now = new Date();
  const muted =
    row.muted !== null && muteActive({ muted: row.muted, mutedUntil: row.mutedUntil }, now);
  const locked = lockActive(row, now);
  return {
    id: row.id,
    nameHe: row.nameHe,
    nameEn: row.nameEn,
    descriptionHe: row.descriptionHe,
    descriptionEn: row.descriptionEn,
    category:
      row.categoryId && row.categoryKey && row.categoryNameHe && row.categoryNameEn
        ? {
            id: row.categoryId,
            key: row.categoryKey,
            nameHe: row.categoryNameHe,
            nameEn: row.categoryNameEn,
          }
        : null,
    pictureFileId: row.pictureFileId,
    memberCount: row.memberCount,
    moderatorsOnly: row.moderatorsOnly,
    locked,
    lockedUntil: locked ? (row.lockedUntil?.toISOString() ?? null) : null,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    role: row.role ?? 'NONE',
    unreadCount: row.unreadCount,
    markedUnread: row.markedUnread ?? false,
    muted,
    mutedUntil: muted ? (row.mutedUntil?.toISOString() ?? null) : null,
  };
}

/** "<time>|<id>" of the last room of the page before. */
function parseCursor(cursor: string): { at: Date; id: string } {
  const [time, id] = cursor.split('|');
  const at = new Date(time ?? '');
  if (!id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppException('VALIDATION_FAILED', [{ field: 'cursor', code: 'cursorInvalid' }]);
  }
  return { at, id };
}
