import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { type AuditLogListDto, type AuditLogQueryDto } from './audit-log.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISRAEL = 'Asia/Jerusalem';
/** Looking at the audit log is recorded under this action. */
export const AUDIT_VIEW_ACTION = 'audit.view';

/**
 * The audit log viewer (M8 plan §2.4): read-only. Entries can't be changed or removed by
 * anyone (the database refuses it); this only lists them. Each look at the log is recorded,
 * with the filters that were used.
 */
@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: AuditLogQueryDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AuditLogListDto> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action
        ? query.action.endsWith('.')
          ? { action: { startsWith: query.action } }
          : { action: query.action }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actor ? { actorUserId: { in: await this.actorIds(query.actor) } } : {}),
      ...(query.from || query.to
        ? {
            at: {
              ...(query.from ? { gte: israelMidnight(query.from) } : {}),
              ...(query.to ? { lt: israelMidnight(nextDay(query.to)) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [
      ...new Set(rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : []))),
    ];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    });
    const emails = new Map(actors.map((actor) => [actor.id, actor.email]));

    // One entry per look at the first page of a filter, not one per page turned.
    if (query.page === 1) {
      const { page: _page, pageSize: _pageSize, ...filters } = query;
      await this.audit.record({
        action: AUDIT_VIEW_ACTION,
        correlationId: meta.correlationId,
        actorUserId: principal.userId,
        actorIp: meta.ip,
        entityType: 'audit_log',
        changes: { filters },
      });
    }
    return {
      items: rows.map((row) => ({
        id: row.id,
        at: row.at.toISOString(),
        actor: row.actorUserId
          ? { id: row.actorUserId, email: emails.get(row.actorUserId) ?? null }
          : null,
        actorIp: row.actorIp,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        changes: (row.changes as Record<string, unknown> | null) ?? null,
        correlationId: row.correlationId,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** The accounts a "who" filter means: one id, or every account whose email holds the text. */
  private async actorIds(actor: string): Promise<string[]> {
    if (UUID.test(actor)) return [actor.toLowerCase()];
    const users = await this.prisma.user.findMany({
      where: { email: { contains: actor, mode: 'insensitive' } },
      select: { id: true },
      take: 500,
    });
    return users.map((user) => user.id);
  }
}

function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** The instant a date starts in Israel. */
export function israelMidnight(date: string): Date {
  const utc = new Date(`${date}T00:00:00.000Z`);
  // What the clock in Israel shows at that UTC instant tells the offset for that day.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utc);
  const hours = Number(parts.find((part) => part.type === 'hour')!.value);
  const minutes = Number(parts.find((part) => part.type === 'minute')!.value);
  return new Date(utc.getTime() - (hours * 60 + minutes) * 60_000);
}
