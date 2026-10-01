import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { EventMailer } from './event-mailer';
import { EventsPublicService } from './events-public.service';
import {
  type AdminRegistrationListDto,
  type AdminRegistrationListQueryDto,
  type MyRegistrationDto,
  type MyScheduleDto,
} from './registrations.dto';
import { overlapping, registrationProblem } from './schedule-rules';

type Tx = Prisma.TransactionClient;
type Locale = 'he' | 'en';

function pick<T extends { locale: string }>(rows: T[], locale: Locale): T {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he') ?? rows[0]!;
}

/**
 * Registration with a waiting list, and the personal schedule (M5 plan §2.3, §2.4, §3, §11).
 *
 * - Anyone signed in who may see the event can register, until the event starts.
 * - Places are counted under a lock on the event row, so two people can't take the last one.
 * - When the event is full, people join a waiting list in order of arrival. A cancellation (or
 *   a larger capacity) gives the place to the first person waiting, who is emailed.
 * - Only registered people (not waiting ones) choose sessions.
 */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsPublicService,
    private readonly mailer: EventMailer,
    private readonly audit: AuditService,
  ) {}

  async register(
    principal: Principal,
    slug: string,
    meta: RequestMeta,
  ): Promise<MyRegistrationDto> {
    const event = await this.events.visible(principal, slug);
    const status = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, event.id);
      const problem = registrationProblem(locked, new Date());
      if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
      const existing = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: principal.userId } },
      });
      if (existing && existing.status !== 'CANCELLED') {
        throw new AppException('CONFLICT', [{ code: 'alreadyRegistered' }]);
      }
      const registered = await tx.eventRegistration.count({
        where: { eventId: event.id, status: 'REGISTERED' },
      });
      const next: 'REGISTERED' | 'WAITLISTED' =
        locked.capacity === null || registered < locked.capacity ? 'REGISTERED' : 'WAITLISTED';
      const data = { status: next, queuedAt: new Date(), promotedAt: null, cancelledAt: null };
      if (existing) await tx.eventRegistration.update({ where: { id: existing.id }, data });
      else {
        await tx.eventRegistration.create({
          data: { id: uuidv7(), eventId: event.id, userId: principal.userId, ...data },
        });
      }
      return next;
    });
    await this.record('event.register', event.id, principal.userId, meta, { status });
    await this.mailer.send(
      principal.userId,
      status === 'REGISTERED' ? 'eventRegistered' : 'eventWaitlisted',
      event.id,
    );
    return this.mine(principal, slug);
  }

  /** Gives up the place (or the place in the waiting list), until the event starts. */
  async cancel(principal: Principal, slug: string, meta: RequestMeta): Promise<MyRegistrationDto> {
    const event = await this.events.visible(principal, slug);
    const promoted = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, event.id);
      const existing = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: principal.userId } },
      });
      if (!existing || existing.status === 'CANCELLED') {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'notRegistered' }]);
      }
      // A cancelled event keeps its registrations as they were: nothing to give up or promote.
      const problem = registrationProblem(locked, new Date());
      if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
      await tx.eventRegistration.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await tx.scheduleItem.deleteMany({
        where: { userId: principal.userId, session: { eventId: event.id } },
      });
      return this.promoteWaiting(tx, event.id, locked.capacity);
    });
    await this.record('event.registration.cancel', event.id, principal.userId, meta);
    for (const userId of promoted) await this.mailer.send(userId, 'eventPromoted', event.id);
    return this.mine(principal, slug);
  }

  /** The caller's own state for one event. */
  async mine(principal: Principal, slug: string): Promise<MyRegistrationDto> {
    const event = await this.events.visible(principal, slug);
    const row = await this.prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: principal.userId } },
    });
    if (!row || row.status === 'CANCELLED') {
      return { status: 'NONE', waitingPosition: null, sessionIds: [] };
    }
    const ahead =
      row.status === 'WAITLISTED'
        ? await this.prisma.eventRegistration.count({
            where: {
              eventId: event.id,
              status: 'WAITLISTED',
              OR: [
                { queuedAt: { lt: row.queuedAt } },
                { queuedAt: row.queuedAt, id: { lt: row.id } },
              ],
            },
          })
        : null;
    const chosen = await this.prisma.scheduleItem.findMany({
      where: { userId: principal.userId, session: { eventId: event.id } },
      select: { sessionId: true },
      orderBy: { session: { startAt: 'asc' } },
    });
    return {
      status: row.status,
      waitingPosition: ahead === null ? null : ahead + 1,
      sessionIds: chosen.map((item) => item.sessionId),
    };
  }

  /** Replaces the caller's chosen sessions for one event. */
  async setSchedule(
    principal: Principal,
    slug: string,
    sessionIds: readonly string[],
  ): Promise<MyRegistrationDto> {
    const event = await this.events.visible(principal, slug);
    const row = await this.prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: principal.userId } },
    });
    if (row?.status !== 'REGISTERED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'scheduleNeedsRegistration' }]);
    }
    const wanted = [...new Set(sessionIds)];
    const found = await this.prisma.eventSession.count({
      where: { id: { in: wanted }, eventId: event.id },
    });
    if (found !== wanted.length) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'sessionIds', code: 'unknownSession' },
      ]);
    }
    await this.prisma.$transaction([
      this.prisma.scheduleItem.deleteMany({
        where: { userId: principal.userId, session: { eventId: event.id } },
      }),
      this.prisma.scheduleItem.createMany({
        data: wanted.map((sessionId) => ({ userId: principal.userId, sessionId })),
      }),
    ]);
    return this.mine(principal, slug);
  }

  /** Everything the caller is registered or waiting for, with their chosen sessions. */
  async mySchedule(principal: Principal, locale: Locale): Promise<MyScheduleDto> {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId: principal.userId,
        status: { in: ['REGISTERED', 'WAITLISTED'] },
        event: { status: { in: ['PUBLISHED', 'CANCELLED'] } },
      },
      include: { event: { include: { translations: true } } },
      orderBy: { event: { startAt: 'asc' } },
    });
    const chosen = await this.prisma.scheduleItem.findMany({
      where: { userId: principal.userId },
      include: { session: { include: { translations: true } } },
      orderBy: { session: { startAt: 'asc' } },
    });
    const clashes = overlapping(
      chosen.map(({ session }) => ({
        id: session.id,
        startAt: session.startAt,
        endAt: session.endAt,
      })),
    );
    return {
      items: registrations.map(({ event, status }) => ({
        slug: event.slug,
        title: pick(event.translations, locale).title,
        startAt: event.startAt!.toISOString(),
        endAt: event.endAt!.toISOString(),
        timezone: event.timezone,
        locationName: event.locationName,
        cancelled: event.status === 'CANCELLED',
        status: status as 'REGISTERED' | 'WAITLISTED',
        sessions: chosen
          .filter(({ session }) => session.eventId === event.id)
          .map(({ session }) => ({
            id: session.id,
            title: pick(session.translations, locale).title,
            startAt: session.startAt.toISOString(),
            endAt: session.endAt.toISOString(),
            room: session.room,
            overlaps: clashes.has(session.id),
          })),
      })),
    };
  }

  // --- Admin ----------------------------------------------------------------------------------

  async adminList(
    eventId: string,
    query: AdminRegistrationListQueryDto,
  ): Promise<AdminRegistrationListDto> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { capacity: true },
    });
    if (!event) throw new AppException('NOT_FOUND');
    const where: Prisma.EventRegistrationWhereInput = {
      eventId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total, registered, waiting] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        include: {
          user: {
            select: { email: true, profile: { select: { firstName: true, lastName: true } } },
          },
        },
        // The enum's order: registered, waiting, cancelled; then by arrival.
        orderBy: [{ status: 'asc' }, { queuedAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.eventRegistration.count({ where }),
      this.prisma.eventRegistration.count({ where: { eventId, status: 'REGISTERED' } }),
      this.prisma.eventRegistration.count({ where: { eventId, status: 'WAITLISTED' } }),
    ]);
    return {
      capacity: event.capacity,
      registered,
      waiting,
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        email: row.user.email,
        name:
          [row.user.profile?.firstName, row.user.profile?.lastName].filter(Boolean).join(' ') ||
          null,
        status: row.status,
        queuedAt: row.queuedAt.toISOString(),
        promotedAt: row.promotedAt?.toISOString() ?? null,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * After an event's capacity changed: gives free places to the people waiting, in order, and
   * emails them. Called by the event admin service.
   */
  async fillFreePlaces(eventId: string): Promise<void> {
    const promoted = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, eventId);
      if (locked.status !== 'PUBLISHED') return [];
      return this.promoteWaiting(tx, eventId, locked.capacity);
    });
    for (const userId of promoted) await this.mailer.send(userId, 'eventPromoted', eventId);
  }

  // --- Internals ------------------------------------------------------------------------------

  /** Locks the event row for the rest of the transaction and returns its current state. */
  private async lock(tx: Tx, eventId: string) {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
    return tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { status: true, registrationMode: true, startAt: true, capacity: true },
    });
  }

  /** Moves waiting people into free places, first come first served. Returns who was moved. */
  private async promoteWaiting(
    tx: Tx,
    eventId: string,
    capacity: number | null,
  ): Promise<string[]> {
    const registered = await tx.eventRegistration.count({
      where: { eventId, status: 'REGISTERED' },
    });
    const waiting = await tx.eventRegistration.findMany({
      where: { eventId, status: 'WAITLISTED' },
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      ...(capacity === null ? {} : { take: Math.max(0, capacity - registered) }),
      select: { id: true, userId: true },
    });
    if (waiting.length === 0) return [];
    await tx.eventRegistration.updateMany({
      where: { id: { in: waiting.map((row) => row.id) } },
      data: { status: 'REGISTERED', promotedAt: new Date() },
    });
    return waiting.map((row) => row.userId);
  }

  private record(
    action: string,
    eventId: string,
    userId: string,
    meta: RequestMeta,
    changes?: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'event',
      entityId: eventId,
      ...(changes ? { changes } : {}),
    });
  }
}
