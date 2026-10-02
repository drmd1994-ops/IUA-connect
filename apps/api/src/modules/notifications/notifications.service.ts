import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_PREFERENCE_KINDS,
  notificationEnabled,
} from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import {
  type NotificationListDto,
  type NotificationListQueryDto,
  type NotificationPreferencesDto,
  type NotificationPreferencesInputDto,
} from './notifications.dto';

/** A person's own notices and switches (M7 plan §2.1–2.2). Nobody reads another person's. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(principal: Principal, query: NotificationListQueryDto): Promise<NotificationListDto> {
    const where = { userId: principal.userId };
    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.unread(principal),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        type: row.type,
        params: row.params as Record<string, string | number>,
        link: row.link,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      unread,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  unread(principal: Principal): Promise<number> {
    return this.prisma.notification.count({ where: { userId: principal.userId, readAt: null } });
  }

  /** Marks one of the person's own notices as read. Someone else's is "not found". */
  async read(principal: Principal, id: string): Promise<void> {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId: principal.userId },
      select: { readAt: true },
    });
    if (!row) throw new AppException('NOT_FOUND');
    if (row.readAt) return;
    await this.prisma.notification.updateMany({
      where: { id, userId: principal.userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async readAll(principal: Principal): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: principal.userId, readAt: null },
      data: { readAt: new Date() },
    });
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
