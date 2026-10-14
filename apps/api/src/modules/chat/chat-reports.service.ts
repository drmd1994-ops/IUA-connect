import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { type StaffScope, covers, mayActOn, scopeOf } from '../../common/auth/scope';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { JobQueue } from '../../infra/jobs/job-queue';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { DirectoryService, type PersonCard } from '../profiles';
import { ChatAccess } from './chat-access';
import { roomOpensTo } from './chat-rules';
import { ChatStream } from './chat-stream';
import {
  type AdminReportDto,
  type AdminReportListDto,
  type AdminReportListQueryDto,
  type AdminSuspensionDto,
  type AdminSuspensionListDto,
  REPORTS_PAGE_SIZE,
  type ReportCategoriesDto,
  type ReportInputDto,
  type ResolveReportDto,
  type SnapshotMessage,
  type SuspendInputDto,
} from './chat.dto';
import { ChatService } from './chat.service';

export const CHAT_REPORTS_CLEANUP_JOB = 'chat.reports-cleanup';
/** How many messages before and after the reported one a reviewer sees. */
export const REPORT_CONTEXT = 5;
/** The kept copy of the messages is erased this long after a report is closed. */
export const REPORT_COPY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const REPORT_SELECT = {
  id: true,
  status: true,
  action: true,
  reporterId: true,
  reportedUserId: true,
  messageId: true,
  description: true,
  snapshot: true,
  reviewedBy: true,
  reviewedAt: true,
  resolution: true,
  createdAt: true,
  category: { select: { key: true, nameHe: true, nameEn: true } },
  conversation: {
    select: { id: true, kind: true, nameHe: true, nameEn: true, organisationId: true },
  },
} satisfies Prisma.ChatReportSelect;
type ReportRow = Prisma.ChatReportGetPayload<{ select: typeof REPORT_SELECT }>;

const SUSPENSION_SELECT = {
  id: true,
  userId: true,
  reason: true,
  startsAt: true,
  endsAt: true,
  liftedAt: true,
} satisfies Prisma.ChatSuspensionSelect;
type SuspensionRow = Prisma.ChatSuspensionGetPayload<{ select: typeof SUSPENSION_SELECT }>;

/**
 * Reports and what staff do about them (M11 plan §2.11, §2.14). Staff never browse
 * conversations: a report shows the reported message with the five before and after it, as
 * they were when it was reported, and every look at a report is written to the audit log.
 *
 * A report about a room of an organisation, or about a message in one, is for that
 * organisation's chat staff (M16); every other report (private chat, groups, the platform's
 * rooms) is for the platform's. Suspending a person from chat reaches the whole platform, so
 * only the platform's staff do it.
 */
@Injectable()
export class ChatReportsService implements OnModuleInit {
  private readonly logger = new Logger(ChatReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly access: ChatAccess,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly audit: AuditService,
    private readonly jobs: JobQueue,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: CHAT_REPORTS_CLEANUP_JOB,
      cron: '45 2 * * *',
      run: async () => {
        const erased = await this.eraseOldCopies();
        if (erased) this.logger.log({ erased }, 'Erased the kept messages of old reports');
      },
    });
  }

  // --- Members --------------------------------------------------------------------------------

  async categories(): Promise<ReportCategoriesDto> {
    const items = await this.prisma.chatReportCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: { id: true, key: true, nameHe: true, nameEn: true },
    });
    return { items };
  }

  /**
   * Reports a message, or a person the reader has a conversation with. Reporting the same
   * thing again while the first report is open changes nothing.
   */
  async create(
    principal: Principal,
    input: ReportInputDto,
    meta: RequestMeta,
  ): Promise<{ id: string; created: boolean }> {
    const me = principal.userId;
    const category = await this.prisma.chatReportCategory.findFirst({
      where: { id: input.categoryId, active: true },
      select: { id: true },
    });
    if (!category) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'categoryId', code: 'chatReportCategoryInvalid' },
      ]);
    }

    let reportedUserId: string | null;
    let conversationId: string;
    let snapshot: SnapshotMessage[] | null = null;
    if (input.messageId) {
      const message = await this.prisma.message.findFirst({
        where: { id: input.messageId, conversation: { members: { some: { userId: me } } } },
        select: { id: true, seq: true, senderId: true, conversationId: true },
      });
      if (!message) throw new AppException('NOT_FOUND');
      if (message.senderId === me) {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatReportOwnMessage' }]);
      }
      // The sender's account is gone: there is nobody to report.
      if (!message.senderId) throw new AppException('NOT_FOUND');
      reportedUserId = message.senderId;
      conversationId = message.conversationId;
      const around = await this.prisma.message.findMany({
        where: {
          conversationId,
          seq: { gte: message.seq - REPORT_CONTEXT, lte: message.seq + REPORT_CONTEXT },
        },
        orderBy: { seq: 'asc' },
        select: {
          seq: true,
          senderId: true,
          body: true,
          deletedAt: true,
          createdAt: true,
          _count: { select: { attachments: true } },
        },
      });
      // The files of a message are not kept with a report, only how many there were.
      snapshot = around.map((row) => ({
        seq: row.seq,
        senderId: row.senderId,
        body: row.body,
        deleted: row.deletedAt !== null,
        createdAt: row.createdAt.toISOString(),
        reported: row.seq === message.seq,
        files: row._count.attachments,
      }));
    } else if (input.roomId) {
      // A room as such: by someone who may see rooms. Nobody in particular is reported.
      const room = await this.prisma.conversation.findFirst({
        where: { id: input.roomId, kind: 'ROOM', archivedAt: null },
        select: {
          id: true,
          inviteOnly: true,
          organisationId: true,
          members: { where: { userId: me }, select: { userId: true } },
        },
      });
      if (!room) throw new AppException('NOT_FOUND');
      // A room by invitation exists only for the people in it.
      if (
        room.members.length === 0 &&
        (room.inviteOnly || !roomOpensTo(await this.access.roomKey(principal), room.organisationId))
      ) {
        throw new AppException('NOT_FOUND');
      }
      reportedUserId = null;
      conversationId = room.id;
    } else {
      const userId = input.userId!;
      const shared = await this.prisma.conversation.findFirst({
        where: {
          AND: [{ members: { some: { userId: me } } }, { members: { some: { userId } } }],
        },
        select: { id: true },
      });
      if (userId === me || !shared) throw new AppException('NOT_FOUND');
      reportedUserId = userId;
      conversationId = shared.id;
    }

    const open = await this.prisma.chatReport.findFirst({
      where: {
        reporterId: me,
        reportedUserId,
        messageId: input.messageId ?? null,
        ...(input.roomId ? { conversationId } : {}),
        status: 'OPEN',
      },
      select: { id: true },
    });
    if (open) return { id: open.id, created: false };

    const id = uuidv7();
    await this.prisma.chatReport.create({
      data: {
        id,
        reporterId: me,
        reportedUserId,
        conversationId,
        messageId: input.messageId ?? null,
        categoryId: category.id,
        description: input.description || null,
        ...(snapshot ? { snapshot: snapshot as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.record({
      action: 'chat.report.create',
      correlationId: meta.correlationId,
      actorUserId: me,
      actorIp: meta.ip,
      entityType: 'chat_report',
      entityId: id,
      changes: {
        aboutMessage: input.messageId !== undefined,
        aboutRoom: input.roomId !== undefined,
      },
    });
    return { id, created: true };
  }

  // --- Staff ----------------------------------------------------------------------------------

  async list(principal: Principal, query: AdminReportListQueryDto): Promise<AdminReportListDto> {
    const where: Prisma.ChatReportWhereInput = {
      ...reportsWhere(scopeOf(principal, 'chat.moderate')),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.chatReport.findMany({
        where,
        // Open ones first, then the newest.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * REPORTS_PAGE_SIZE,
        take: REPORTS_PAGE_SIZE,
        select: REPORT_SELECT,
      }),
      this.prisma.chatReport.count({ where }),
    ]);
    const cards = await this.directory.cards(
      rows.flatMap((row) => [row.reporterId, row.reportedUserId]).filter((id) => id !== null),
    );
    return {
      items: rows.map((row) => summary(row, cards)),
      total,
      page: query.page,
      pageSize: REPORTS_PAGE_SIZE,
    };
  }

  /** One report with the kept messages. Each look is written to the audit log. */
  async get(principal: Principal, id: string, meta: RequestMeta): Promise<AdminReportDto> {
    const row = await this.mine(principal, id);
    await this.audit.record({
      action: 'chat.report.view',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'chat_report',
      entityId: id,
    });
    return this.detail(principal, row);
  }

  /**
   * Closes a report: dismiss it, delete the reported message, or suspend the reported person
   * from chat. Never by one of the report's own two people.
   */
  async resolve(
    principal: Principal,
    id: string,
    input: ResolveReportDto,
    meta: RequestMeta,
  ): Promise<AdminReportDto> {
    const me = principal.userId;
    const row = await this.mine(principal, id);
    if (row.status !== 'OPEN') throw new AppException('CONFLICT', [{ code: 'chatReportClosed' }]);
    if (row.reporterId === me || row.reportedUserId === me) {
      throw new AppException('FORBIDDEN', [{ code: 'chatReportOwn' }]);
    }
    if (input.decision === 'deleteMessage' && !row.messageId) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatReportNoMessage' }]);
    }
    if (input.decision === 'suspend' && !row.reportedUserId) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatReportNoPerson' }]);
    }
    // A suspension reaches the whole platform; an organisation's staff ban from their rooms.
    if (input.decision === 'suspend' && !principal.permissions.has('chat.moderate')) {
      throw new AppException('FORBIDDEN');
    }
    if (input.decision === 'archiveRoom') {
      if (row.conversation?.kind !== 'ROOM') {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatReportNoRoom' }]);
      }
      // Archiving a room is the room managers' decision, also when it starts from a report.
      if (!mayActOn(principal, 'chat.rooms.manage', row.conversation.organisationId)) {
        throw new AppException('FORBIDDEN');
      }
    }

    // Claimed first, so two reviewers can't both act on it.
    const claimed = await this.prisma.chatReport.updateMany({
      where: { id, status: 'OPEN' },
      data: {
        status: input.decision === 'dismiss' ? 'DISMISSED' : 'UPHELD',
        action:
          input.decision === 'deleteMessage'
            ? 'MESSAGE_DELETED'
            : input.decision === 'suspend'
              ? 'SUSPENDED'
              : input.decision === 'archiveRoom'
                ? 'ROOM_ARCHIVED'
                : 'NONE',
        reviewedBy: me,
        reviewedAt: new Date(),
        resolution: input.reason,
      },
    });
    if (claimed.count === 0) throw new AppException('CONFLICT', [{ code: 'chatReportClosed' }]);

    if (input.decision === 'deleteMessage') await this.chat.removeAsStaff(row.messageId!, me);
    if (input.decision === 'archiveRoom') {
      await this.prisma.conversation.updateMany({
        where: { id: row.conversation!.id, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      await this.stream.publishRoom(row.conversation!.id, {
        type: 'room',
        conversationId: row.conversation!.id,
      });
    }
    if (input.decision === 'suspend') {
      await this.createSuspension(me, row.reportedUserId!, input.reason, input.days ?? null, id);
    }
    await this.audit.record({
      action: 'chat.report.resolve',
      correlationId: meta.correlationId,
      actorUserId: me,
      actorIp: meta.ip,
      entityType: 'chat_report',
      entityId: id,
      changes: {
        decision: input.decision,
        ...(input.decision === 'suspend' ? { days: input.days ?? null } : {}),
      },
    });
    const after = await this.prisma.chatReport.findUniqueOrThrow({
      where: { id },
      select: REPORT_SELECT,
    });
    return this.detail(principal, after);
  }

  /**
   * A report the caller reviews, or "not found": a report about another owner's room does not
   * exist for them.
   */
  private async mine(principal: Principal, id: string): Promise<ReportRow> {
    const row = await this.prisma.chatReport.findUnique({ where: { id }, select: REPORT_SELECT });
    const owner = row?.conversation?.organisationId ?? null;
    if (!row || !covers(scopeOf(principal, 'chat.moderate'), owner)) {
      throw new AppException('NOT_FOUND');
    }
    return row;
  }

  async suspensions(page: number): Promise<AdminSuspensionListDto> {
    const [rows, total] = await Promise.all([
      this.prisma.chatSuspension.findMany({
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * REPORTS_PAGE_SIZE,
        take: REPORTS_PAGE_SIZE,
        select: SUSPENSION_SELECT,
      }),
      this.prisma.chatSuspension.count(),
    ]);
    const cards = await this.directory.cards(rows.map((row) => row.userId));
    return {
      items: rows.map((row) => suspensionView(row, cards)),
      total,
      page,
      pageSize: REPORTS_PAGE_SIZE,
    };
  }

  /** Suspends a person from sending in chat, without a report. */
  async suspend(
    principal: Principal,
    input: SuspendInputDto,
    meta: RequestMeta,
  ): Promise<AdminSuspensionDto> {
    const me = principal.userId;
    if (input.userId === me) throw new AppException('FORBIDDEN', [{ code: 'chatSuspendSelf' }]);
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) throw new AppException('NOT_FOUND');
    if (await this.access.suspended(input.userId)) {
      throw new AppException('CONFLICT', [{ code: 'chatAlreadySuspended' }]);
    }
    const id = await this.createSuspension(me, input.userId, input.reason, input.days, null);
    await this.audit.record({
      action: 'chat.suspend',
      correlationId: meta.correlationId,
      actorUserId: me,
      actorIp: meta.ip,
      entityType: 'user',
      entityId: input.userId,
      changes: { days: input.days },
    });
    return this.suspensionById(id);
  }

  async lift(
    principal: Principal,
    id: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<AdminSuspensionDto> {
    const row = await this.prisma.chatSuspension.findUnique({
      where: { id },
      select: { userId: true, liftedAt: true },
    });
    if (!row) throw new AppException('NOT_FOUND');
    if (!row.liftedAt) {
      await this.prisma.chatSuspension.update({
        where: { id },
        data: { liftedAt: new Date(), liftedBy: principal.userId },
      });
      await this.audit.record({
        action: 'chat.suspension.lift',
        correlationId: meta.correlationId,
        actorUserId: principal.userId,
        actorIp: meta.ip,
        entityType: 'user',
        entityId: row.userId,
        changes: { reason },
      });
      await this.stream.publish([row.userId], { type: 'refresh' });
    }
    return this.suspensionById(id);
  }

  /** Erases the kept messages of reports closed more than 90 days ago. */
  async eraseOldCopies(now = new Date()): Promise<number> {
    const { count } = await this.prisma.chatReport.updateMany({
      where: {
        status: { not: 'OPEN' },
        reviewedAt: { lt: new Date(now.getTime() - REPORT_COPY_DAYS * DAY_MS) },
        snapshot: { not: Prisma.DbNull },
      },
      data: { snapshot: Prisma.DbNull },
    });
    return count;
  }

  // --- Internals ------------------------------------------------------------------------------

  private async createSuspension(
    createdBy: string,
    userId: string,
    reason: string,
    days: number | null,
    reportId: string | null,
  ): Promise<string> {
    const id = uuidv7();
    const now = new Date();
    await this.prisma.chatSuspension.create({
      data: {
        id,
        userId,
        createdBy,
        reason,
        reportId,
        startsAt: now,
        endsAt: days === null ? null : new Date(now.getTime() + days * DAY_MS),
      },
    });
    // The person's open pages show at once that they can't send.
    await this.stream.publish([userId], { type: 'refresh' });
    return id;
  }

  private async suspensionById(id: string): Promise<AdminSuspensionDto> {
    const row = await this.prisma.chatSuspension.findUniqueOrThrow({
      where: { id },
      select: SUSPENSION_SELECT,
    });
    return suspensionView(row, await this.directory.cards([row.userId]));
  }

  private async detail(principal: Principal, row: ReportRow): Promise<AdminReportDto> {
    const ids = [row.reporterId, row.reportedUserId, row.reviewedBy].filter((id) => id !== null);
    const [cards, reportedSuspended] = await Promise.all([
      this.directory.cards(ids),
      row.reportedUserId ? this.access.suspended(row.reportedUserId) : false,
    ]);
    const me = principal.userId;
    return {
      ...summary(row, cards),
      description: row.description,
      messages: Array.isArray(row.snapshot) ? (row.snapshot as unknown as SnapshotMessage[]) : [],
      reviewer: personOf(row.reviewedBy, cards),
      resolution: row.resolution,
      reportedSuspended,
      canResolve: row.status === 'OPEN' && row.reporterId !== me && row.reportedUserId !== me,
    };
  }
}

/**
 * The reports a scope of `chat.moderate` covers: those about an organisation's room are that
 * organisation's; every other report (private chat, groups, the platform's rooms, a person as
 * such) is the platform's.
 */
export function reportsWhere(scope: StaffScope): Prisma.ChatReportWhereInput {
  if (scope.everywhere) return {};
  return {
    OR: [
      ...(scope.platform
        ? [{ conversationId: null }, { conversation: { organisationId: null } }]
        : []),
      { conversation: { organisationId: { in: [...scope.organisationIds] } } },
    ],
  };
}

function personOf(id: string | null, cards: Map<string, PersonCard>) {
  const card = id ? cards.get(id) : undefined;
  return { id, firstName: card?.firstName ?? null, lastName: card?.lastName ?? null };
}

function summary(row: ReportRow, cards: Map<string, PersonCard>) {
  return {
    id: row.id,
    status: row.status,
    action: row.action,
    category: row.category,
    reporter: personOf(row.reporterId, cards),
    reported: personOf(row.reportedUserId, cards),
    aboutMessage: row.messageId !== null || Array.isArray(row.snapshot),
    room:
      row.conversation?.kind === 'ROOM' && row.conversation.nameHe
        ? {
            id: row.conversation.id,
            nameHe: row.conversation.nameHe,
            nameEn: row.conversation.nameEn,
          }
        : null,
    aboutRoom:
      row.conversation?.kind === 'ROOM' &&
      row.messageId === null &&
      row.reportedUserId === null &&
      !Array.isArray(row.snapshot),
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function suspensionView(
  row: SuspensionRow,
  cards: Map<string, PersonCard>,
  now = new Date(),
): AdminSuspensionDto {
  return {
    id: row.id,
    user: personOf(row.userId, cards),
    reason: row.reason,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    liftedAt: row.liftedAt?.toISOString() ?? null,
    active: row.liftedAt === null && (row.endsAt === null || row.endsAt > now),
  };
}
