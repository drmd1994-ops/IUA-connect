import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import {
  OWNER_PROBLEM_CODES,
  covers,
  ownedWhere,
  ownerOfNew,
  scopeOf,
} from '../../common/auth/scope';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { FilesService } from '../files';
import { ORGANISATION_REF } from '../organisations';
import { DirectoryService } from '../profiles';
import { ChatAccess } from './chat-access';
import { lockActive, roomOpensTo } from './chat-rules';
import { ChatStream } from './chat-stream';
import {
  type AdminReportCategoriesDto,
  type AdminReportCategoryDto,
  type AdminRoomCategoriesDto,
  type AdminRoomCategoryDto,
  type AdminRoomDto,
  type AdminRoomInputDto,
  type AdminRoomListDto,
  type AdminRoomListQueryDto,
  REPORTS_PAGE_SIZE,
  type ReportCategoryCreateDto,
  type ReportCategoryInputDto,
  type RoomCategoryCreateDto,
  type RoomCategoryInputDto,
} from './chat.dto';
import { RoomsService } from './rooms.service';

const ROOM_SELECT = {
  id: true,
  organisationId: true,
  organisation: { select: ORGANISATION_REF },
  nameHe: true,
  nameEn: true,
  descriptionHe: true,
  descriptionEn: true,
  pictureFileId: true,
  memberCount: true,
  moderatorsOnly: true,
  inviteOnly: true,
  locked: true,
  lockedUntil: true,
  archivedAt: true,
  createdAt: true,
  lastMessageAt: true,
  category: { select: { id: true, key: true, nameHe: true, nameEn: true } },
  members: { where: { role: 'MODERATOR' }, select: { userId: true }, orderBy: { joinedAt: 'asc' } },
} satisfies Prisma.ConversationSelect;
type RoomRow = Prisma.ConversationGetPayload<{ select: typeof ROOM_SELECT }>;

/**
 * Rooms in the admin area (M12 plan §2.9, permission chat.rooms.manage): staff open, edit and
 * archive rooms, appoint their moderators, and keep the lists of room categories and report
 * reasons. Rooms are archived, never deleted. Every change is audited.
 *
 * A room belongs to an organisation or to the platform (M16), and chat.rooms.manage is used
 * where it is held: a room of an owner the caller does not work for reads as "not found".
 */
@Injectable()
export class RoomsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly access: ChatAccess,
    private readonly directory: DirectoryService,
    private readonly files: FilesService,
    private readonly stream: ChatStream,
    private readonly audit: AuditService,
  ) {}

  // --- Rooms ----------------------------------------------------------------------------------

  async list(principal: Principal, query: AdminRoomListQueryDto): Promise<AdminRoomListDto> {
    const scope = scopeOf(principal, 'chat.rooms.manage');
    if (query.organisation && !covers(scope, query.organisation)) {
      throw new AppException('NOT_FOUND');
    }
    const where: Prisma.ConversationWhereInput = {
      kind: 'ROOM',
      AND: [ownedWhere(scope)],
      ...(query.organisation ? { organisationId: query.organisation } : {}),
      ...(query.archived === undefined
        ? {}
        : { archivedAt: query.archived === 'true' ? { not: null } : null }),
      ...(query.q
        ? {
            OR: [
              { nameHe: { contains: query.q, mode: 'insensitive' } },
              { nameEn: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: [
          { archivedAt: { sort: 'asc', nulls: 'first' } },
          { nameHe: 'asc' },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * REPORTS_PAGE_SIZE,
        take: REPORTS_PAGE_SIZE,
        select: ROOM_SELECT,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return {
      items: await this.views(rows),
      total,
      page: query.page,
      pageSize: REPORTS_PAGE_SIZE,
    };
  }

  async get(principal: Principal, id: string): Promise<AdminRoomDto> {
    return (await this.views([await this.mine(principal, id)]))[0]!;
  }

  /** A room the caller manages, or "not found": another owner's does not exist for them. */
  private async mine(principal: Principal, id: string): Promise<RoomRow> {
    const row = await this.prisma.conversation.findFirst({
      where: { id, kind: 'ROOM' },
      select: ROOM_SELECT,
    });
    if (!row || !covers(scopeOf(principal, 'chat.rooms.manage'), row.organisationId)) {
      throw new AppException('NOT_FOUND');
    }
    return row;
  }

  async create(
    principal: Principal,
    input: AdminRoomInputDto,
    meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    const owner = ownerOfNew(scopeOf(principal, 'chat.rooms.manage'), input.organisationId);
    if ('problem' in owner) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'organisationId', code: OWNER_PROBLEM_CODES[owner.problem] },
      ]);
    }
    await this.checkLinks(input);
    const id = uuidv7();
    try {
      await this.prisma.conversation.create({
        data: {
          id,
          kind: 'ROOM',
          createdBy: principal.userId,
          organisationId: owner.organisationId,
          ...roomData(input),
        },
      });
    } catch (error) {
      throw nameTaken(error);
    }
    if (input.pictureFileId) await this.files.markAttached(input.pictureFileId);
    await this.record('chat.room.create', principal, id, meta, { nameHe: input.nameHe });
    return this.get(principal, id);
  }

  async update(
    principal: Principal,
    id: string,
    input: AdminRoomInputDto,
    meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    const before = await this.mine(principal, id);
    if (input.organisationId !== undefined && input.organisationId !== before.organisationId) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'organisationId', code: 'ownerCannotChange' },
      ]);
    }
    await this.checkLinks(input);
    try {
      await this.prisma.conversation.update({ where: { id }, data: roomData(input) });
    } catch (error) {
      throw nameTaken(error);
    }
    if (input.pictureFileId) await this.files.markAttached(input.pictureFileId);
    await this.record('chat.room.update', principal, id, meta, {
      nameHe: input.nameHe,
      ...(before.nameHe === input.nameHe ? {} : { previousNameHe: before.nameHe }),
      moderatorsOnly: input.moderatorsOnly,
      inviteOnly: input.inviteOnly,
    });
    await this.stream.publishRoom(id, { type: 'room', conversationId: id });
    return this.get(principal, id);
  }

  /** An archived room leaves the lists and becomes read-only for the people in it. */
  async archive(principal: Principal, id: string, meta: RequestMeta): Promise<AdminRoomDto> {
    await this.setArchived(principal, id, true, meta);
    return this.get(principal, id);
  }

  async restore(principal: Principal, id: string, meta: RequestMeta): Promise<AdminRoomDto> {
    await this.setArchived(principal, id, false, meta);
    return this.get(principal, id);
  }

  // --- Moderators -----------------------------------------------------------------------------

  /**
   * Makes a member a moderator of a room. Someone who is not in the room yet is added to it.
   * Only someone the room is for, with a name, can moderate: a verified person in the
   * platform's rooms, an active member in an organisation's.
   */
  async addModerator(
    principal: Principal,
    id: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    const room = await this.mine(principal, id);
    const fits = roomOpensTo(await this.access.roomKeyOf(userId), room.organisationId);
    const card = (await this.directory.cards([userId])).get(userId);
    if (!fits || !card?.firstName?.trim() || !card.lastName?.trim()) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatModeratorNotMember' }]);
    }
    if (await this.rooms.banned(id, userId)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatModeratorBanned' }]);
    }
    const added = await this.rooms.addMember(id, userId, 'MODERATOR');
    if (added) {
      await this.stream.setPresence(userId, id, true);
    } else {
      await this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: id, userId } },
        data: { role: 'MODERATOR' },
      });
    }
    await this.record('chat.room.moderator.add', principal, id, meta, { userId });
    await this.stream.publishRoom(id, { type: 'room', conversationId: id });
    return this.get(principal, id);
  }

  /** The person stays in the room as an ordinary member. */
  async removeModerator(
    principal: Principal,
    id: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    await this.mine(principal, id);
    const { count } = await this.prisma.conversationMember.updateMany({
      where: { conversationId: id, userId, role: 'MODERATOR' },
      data: { role: 'MEMBER' },
    });
    if (count === 0) throw new AppException('NOT_FOUND');
    await this.record('chat.room.moderator.remove', principal, id, meta, { userId });
    await this.stream.publishRoom(id, { type: 'room', conversationId: id });
    return this.get(principal, id);
  }

  // --- Room categories ------------------------------------------------------------------------

  async categories(): Promise<AdminRoomCategoriesDto> {
    const rows = await this.prisma.chatRoomCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: { _count: { select: { rooms: true } } },
    });
    return {
      items: rows.map(({ _count, ...row }) => ({ ...row, rooms: _count.rooms })),
    };
  }

  async createCategory(
    principal: Principal,
    input: RoomCategoryCreateDto,
    meta: RequestMeta,
  ): Promise<AdminRoomCategoryDto> {
    const id = uuidv7();
    try {
      await this.prisma.chatRoomCategory.create({ data: { id, ...input } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'key', code: 'categoryKeyTaken' }]);
      }
      throw error;
    }
    await this.record('chat.room.category.create', principal, id, meta, { key: input.key });
    return { id, ...input, rooms: 0 };
  }

  async updateCategory(
    principal: Principal,
    id: string,
    input: RoomCategoryInputDto,
    meta: RequestMeta,
  ): Promise<AdminRoomCategoryDto> {
    const { count } = await this.prisma.chatRoomCategory.updateMany({ where: { id }, data: input });
    if (count === 0) throw new AppException('NOT_FOUND');
    await this.record('chat.room.category.update', principal, id, meta, { ...input });
    return (await this.categories()).items.find((item) => item.id === id)!;
  }

  /** Only a category that no room uses can be deleted. */
  async removeCategory(principal: Principal, id: string, meta: RequestMeta): Promise<void> {
    const row = await this.prisma.chatRoomCategory.findUnique({
      where: { id },
      include: { _count: { select: { rooms: true } } },
    });
    if (!row) throw new AppException('NOT_FOUND');
    if (row._count.rooms > 0) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatCategoryInUse' }]);
    }
    await this.prisma.chatRoomCategory.delete({ where: { id } });
    await this.record('chat.room.category.delete', principal, id, meta, { key: row.key });
  }

  // --- Report reasons (left open by M11) ------------------------------------------------------

  async reportCategories(): Promise<AdminReportCategoriesDto> {
    const items = await this.prisma.chatReportCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    return { items };
  }

  async createReportCategory(
    principal: Principal,
    input: ReportCategoryCreateDto,
    meta: RequestMeta,
  ): Promise<AdminReportCategoryDto> {
    const id = uuidv7();
    try {
      await this.prisma.chatReportCategory.create({ data: { id, ...input } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'key', code: 'categoryKeyTaken' }]);
      }
      throw error;
    }
    await this.record('chat.report.category.create', principal, id, meta, { key: input.key });
    return { id, ...input };
  }

  /** A reason is renamed, reordered, or switched off. It is never deleted: reports name it. */
  async updateReportCategory(
    principal: Principal,
    id: string,
    input: ReportCategoryInputDto,
    meta: RequestMeta,
  ): Promise<AdminReportCategoryDto> {
    const before = await this.prisma.chatReportCategory.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    if (before.active && !input.active) {
      const others = await this.prisma.chatReportCategory.count({
        where: { active: true, id: { not: id } },
      });
      // Reporting needs at least one reason to choose.
      if (others === 0) {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatLastReportReason' }]);
      }
    }
    const row = await this.prisma.chatReportCategory.update({ where: { id }, data: input });
    await this.record('chat.report.category.update', principal, id, meta, { ...input });
    return row;
  }

  // --- Internals ------------------------------------------------------------------------------

  private async setArchived(
    principal: Principal,
    id: string,
    archived: boolean,
    meta: RequestMeta,
  ): Promise<void> {
    await this.mine(principal, id); // "not found" for a room that isn't there, or isn't theirs
    const { count } = await this.prisma.conversation.updateMany({
      where: { id, kind: 'ROOM', archivedAt: archived ? null : { not: null } },
      data: { archivedAt: archived ? new Date() : null },
    });
    if (count === 0) return; // already so: nothing to do
    await this.record(
      archived ? 'chat.room.archive' : 'chat.room.restore',
      principal,
      id,
      meta,
      {},
    );
    await this.stream.publishRoom(id, { type: 'room', conversationId: id });
  }

  /** The category exists, and the picture is an image that was uploaded. */
  private async checkLinks(input: AdminRoomInputDto): Promise<void> {
    if (input.categoryId) {
      const category = await this.prisma.chatRoomCategory.count({
        where: { id: input.categoryId },
      });
      if (category === 0) {
        throw new AppException('VALIDATION_FAILED', [
          { field: 'categoryId', code: 'unknownCategory' },
        ]);
      }
    }
    if (input.pictureFileId) {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: input.pictureFileId },
        select: { kind: true },
      });
      if (file?.kind !== 'IMAGE') {
        throw new AppException('VALIDATION_FAILED', [
          { field: 'pictureFileId', code: 'unknownImage' },
        ]);
      }
    }
  }

  private async views(rows: readonly RoomRow[]): Promise<AdminRoomDto[]> {
    const cards = await this.directory.cards(
      rows.flatMap((row) => row.members.map((m) => m.userId)),
    );
    const now = new Date();
    return rows.map((row) => ({
      id: row.id,
      organisation: row.organisation,
      nameHe: row.nameHe ?? '',
      nameEn: row.nameEn,
      descriptionHe: row.descriptionHe,
      descriptionEn: row.descriptionEn,
      category: row.category,
      pictureFileId: row.pictureFileId,
      memberCount: row.memberCount,
      moderatorsOnly: row.moderatorsOnly,
      inviteOnly: row.inviteOnly,
      locked: lockActive(row, now),
      archived: row.archivedAt !== null,
      createdAt: row.createdAt.toISOString(),
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      moderators: row.members.map((m) => {
        const card = cards.get(m.userId);
        return {
          id: m.userId,
          firstName: card?.firstName ?? null,
          lastName: card?.lastName ?? null,
        };
      }),
    }));
  }

  private async record(
    action: string,
    principal: Principal,
    entityId: string,
    meta: RequestMeta,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'chat_room',
      entityId,
      changes,
    });
  }
}

function roomData(input: AdminRoomInputDto) {
  return {
    nameHe: input.nameHe,
    nameEn: input.nameEn,
    descriptionHe: input.descriptionHe,
    descriptionEn: input.descriptionEn,
    categoryId: input.categoryId ?? null,
    pictureFileId: input.pictureFileId ?? null,
    moderatorsOnly: input.moderatorsOnly,
    inviteOnly: input.inviteOnly,
  };
}

/** Two rooms can't share a name. */
function nameTaken(error: unknown): unknown {
  return isUniqueViolation(error)
    ? new AppException('CONFLICT', [{ field: 'nameHe', code: 'chatRoomNameTaken' }])
    : error;
}
