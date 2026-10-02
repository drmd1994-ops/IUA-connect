import { Injectable } from '@nestjs/common';
import {
  CONTENT_NOTIFICATION_KINDS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_PREFERENCE_KINDS,
  type NotificationKind,
  notificationEnabled,
} from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { NOTIFICATION_RETENTION_DAYS, activeMembershipType } from './content-announcer';
import {
  type NotificationListDto,
  type NotificationListQueryDto,
  type NotificationPreferencesDto,
  type NotificationPreferencesInputDto,
  type UnsubscribeResultDto,
} from './notifications.dto';
import { UnsubscribeTokens } from './unsubscribe-tokens';

interface Reader {
  userId: string;
  since: Date;
  /** The kinds of new content the person has switched on in the app. */
  kinds: string[];
  /** The membership type, when the membership is active. */
  activeTypeId: string | null;
  /** "Mark all as read" was last used at this moment. */
  readUntil: Date | null;
}

interface NoticeRow {
  id: string;
  kind: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * The announcements a person sees (the table is aliased `a`): of a kind they have switched on,
 * that they may read under the tier the item was published with, since their account exists.
 */
function visibleAnnouncements(reader: Reader): Prisma.Sql {
  return Prisma.sql`a.created_at >= ${reader.since}
    AND a.kind::text = ANY(${reader.kinds})
    AND (
      a.access_tier = 'PUBLIC'
      OR (
        ${reader.activeTypeId !== null}
        AND (a.access_tier = 'MEMBERS' OR ${reader.activeTypeId}::uuid = ANY(a.type_ids))
      )
    )`;
}

/**
 * A person's notices and switches (M7 plan §2.1–2.3). The list is the person's own notices
 * (stored per person) together with the announcements of new content they may see (stored once
 * per item). Nobody reads another person's.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: UnsubscribeTokens,
  ) {}

  /** Switches off email for what a signed link names. Works without signing in. */
  async unsubscribe(token: string, meta: RequestMeta): Promise<UnsubscribeResultDto> {
    const target = await this.tokens.verify(token);
    if (!target) throw new AppException('VALIDATION_FAILED', [{ code: 'unsubscribeLinkInvalid' }]);
    const user = await this.prisma.user.findUnique({
      where: { id: target.userId },
      select: { id: true },
    });
    // The same answer whether or not the account still exists.
    if (user) {
      await this.prisma.$transaction(
        target.kinds.map((kind) =>
          this.prisma.notificationPreference.upsert({
            where: { userId_kind_channel: { userId: user.id, kind, channel: 'EMAIL' } },
            update: { enabled: false },
            create: { userId: user.id, kind, channel: 'EMAIL', enabled: false },
          }),
        ),
      );
      await this.audit.record({
        action: 'notifications.unsubscribe',
        correlationId: meta.correlationId,
        actorUserId: user.id,
        actorIp: meta.ip,
        entityType: 'user',
        entityId: user.id,
        changes: { kinds: target.kinds },
      });
    }
    return { kinds: target.kinds };
  }

  async list(principal: Principal, query: NotificationListQueryDto): Promise<NotificationListDto> {
    const reader = await this.reader(principal.userId);
    const visible = visibleAnnouncements(reader);
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<NoticeRow[]>`
        SELECT * FROM (
          SELECT n.id, n.kind::text AS kind, n.type, n.params, n.link,
                 n.read_at AS "readAt", n.created_at AS "createdAt"
          FROM notifications n
          WHERE n.user_id = ${reader.userId}::uuid
          UNION ALL
          SELECT a.id, a.kind::text AS kind, a.type,
                 jsonb_strip_nulls(jsonb_build_object('titleHe', a.title_he, 'titleEn', a.title_en)),
                 a.link,
                 COALESCE(r.read_at,
                          CASE WHEN a.created_at <= ${reader.readUntil}::timestamptz
                               THEN ${reader.readUntil}::timestamptz END),
                 a.created_at
          FROM content_announcements a
          LEFT JOIN announcement_reads r
            ON r.announcement_id = a.id AND r.user_id = ${reader.userId}::uuid
          WHERE ${visible}
        ) notices
        ORDER BY "createdAt" DESC, id DESC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      this.counts(reader),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind as NotificationKind,
        type: row.type,
        params: row.params,
        link: row.link,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total: counts.total,
      unread: counts.unread,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async unread(principal: Principal): Promise<number> {
    return (await this.counts(await this.reader(principal.userId))).unread;
  }

  /** Marks a notice as read. One the person may not see is "not found". */
  async read(principal: Principal, id: string): Promise<void> {
    const userId = principal.userId;
    const own = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { readAt: true },
    });
    if (own) {
      if (own.readAt) return;
      await this.prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      });
      return;
    }
    const reader = await this.reader(userId);
    const found = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM content_announcements a
      WHERE a.id = ${id}::uuid AND ${visibleAnnouncements(reader)}`;
    if (found.length === 0) throw new AppException('NOT_FOUND');
    await this.prisma.announcementRead.upsert({
      where: { userId_announcementId: { userId, announcementId: id } },
      update: {},
      create: { userId, announcementId: id },
    });
  }

  async readAll(principal: Principal): Promise<void> {
    const userId = principal.userId;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: now },
      }),
      // Every announcement up to now counts as read, without a row per announcement.
      this.prisma.notificationState.upsert({
        where: { userId },
        update: { announcementsReadUntil: now },
        create: { userId, announcementsReadUntil: now },
      }),
    ]);
  }

  /** What decides which announcements a person sees: their switches and their membership. */
  private async reader(userId: string): Promise<Reader> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        createdAt: true,
        membership: { select: { status: true, endDate: true, typeId: true } },
        notificationPrefs: { select: { kind: true, channel: true, enabled: true } },
        notificationState: { select: { announcementsReadUntil: true } },
      },
    });
    const oldest = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return {
      userId,
      // Nothing from before the account existed, and nothing past the retention period.
      since: user.createdAt > oldest ? user.createdAt : oldest,
      kinds: CONTENT_NOTIFICATION_KINDS.filter((kind) =>
        notificationEnabled(kind, 'APP', user.notificationPrefs),
      ),
      activeTypeId: activeMembershipType(user.membership),
      readUntil: user.notificationState?.announcementsReadUntil ?? null,
    };
  }

  private async counts(reader: Reader): Promise<{ total: number; unread: number }> {
    const [own, announced] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint; unread: bigint }[]>`
        SELECT count(*) AS total, count(*) FILTER (WHERE read_at IS NULL) AS unread
        FROM notifications WHERE user_id = ${reader.userId}::uuid`,
      this.prisma.$queryRaw<{ total: bigint; unread: bigint }[]>`
        SELECT count(*) AS total,
               count(*) FILTER (
                 WHERE r.user_id IS NULL
                   AND (${reader.readUntil}::timestamptz IS NULL
                        OR a.created_at > ${reader.readUntil}::timestamptz)
               ) AS unread
        FROM content_announcements a
        LEFT JOIN announcement_reads r
          ON r.announcement_id = a.id AND r.user_id = ${reader.userId}::uuid
        WHERE ${visibleAnnouncements(reader)}`,
    ]);
    return {
      total: Number(own[0]!.total) + Number(announced[0]!.total),
      unread: Number(own[0]!.unread) + Number(announced[0]!.unread),
    };
  }

  async preferences(userId: string): Promise<NotificationPreferencesDto> {
    const stored = await this.prisma.notificationPreference.findMany({
      where: { userId },
      select: { kind: true, channel: true, enabled: true },
    });
    return {
      items: NOTIFICATION_PREFERENCE_KINDS.map((kind) => ({
        kind,
        app: notificationEnabled(kind, 'APP', stored),
        email: notificationEnabled(kind, 'EMAIL', stored),
        locked: NOTIFICATION_DEFAULTS[kind].locked,
      })),
    };
  }

  /** Stores the switches. A kind that is always on can't be switched off. */
  async setPreferences(
    principal: Principal,
    input: NotificationPreferencesInputDto,
    meta: RequestMeta,
  ): Promise<NotificationPreferencesDto> {
    const locked = input.items.find(
      (item) => NOTIFICATION_DEFAULTS[item.kind].locked && !(item.app && item.email),
    );
    if (locked) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'items', code: 'notificationAlwaysOn' },
      ]);
    }
    const userId = principal.userId;
    const before = await this.preferences(userId);
    await this.prisma.$transaction(
      input.items
        .filter((item) => !NOTIFICATION_DEFAULTS[item.kind].locked)
        .flatMap((item) =>
          NOTIFICATION_CHANNELS.map((channel) => {
            const enabled = channel === 'APP' ? item.app : item.email;
            return this.prisma.notificationPreference.upsert({
              where: { userId_kind_channel: { userId, kind: item.kind, channel } },
              update: { enabled },
              create: { userId, kind: item.kind, channel, enabled },
            });
          }),
        ),
    );
    const after = await this.preferences(userId);
    const changed = after.items.filter((item) => {
      const old = before.items.find((b) => b.kind === item.kind)!;
      return old.app !== item.app || old.email !== item.email;
    });
    if (changed.length > 0) {
      await this.audit.record({
        action: 'notifications.preferences.update',
        correlationId: meta.correlationId,
        actorUserId: userId,
        actorIp: meta.ip,
        entityType: 'user',
        entityId: userId,
        changes: Object.fromEntries(
          changed.map((item) => [item.kind, { app: item.app, email: item.email }]),
        ),
      });
    }
    return after;
  }
}
