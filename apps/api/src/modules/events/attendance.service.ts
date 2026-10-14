import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import {
  type AttendanceListDto,
  type AttendanceListQueryDto,
  type AttendanceRecordDto,
  type CheckInCodeDto,
  type CheckInResultDto,
} from './attendance.dto';
import { CheckInTokens } from './check-in-token';
import { type EventActor } from './events-admin.service';
import { EventsPublicService } from './events-public.service';

const WITH_USER = {
  user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.EventAttendanceInclude;
type Row = Prisma.EventAttendanceGetPayload<{ include: typeof WITH_USER }>;

/**
 * Attendance (M5 plan §2.6, §3, §11.3). The event admin shows a QR code at the venue; a member
 * scans it with their own phone, signs in and is recorded. Admins can also mark people by hand.
 * Records are append-only: a wrong one is voided with a reason, never changed or erased.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly events: EventsPublicService,
    private readonly tokens: CheckInTokens,
    private readonly audit: AuditService,
  ) {}

  // --- Member -------------------------------------------------------------------------------

  /** Records the caller from a scanned code. Scanning twice records once. */
  async checkIn(principal: Principal, slug: string, token: string): Promise<CheckInResultDto> {
    const event = await this.events.visible(principal, slug);
    const target = await this.tokens.verify(token);
    // The code must be for this event: a code can't be replayed against another one.
    if (!target || target.eventId !== event.id) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'checkInCodeInvalid' }]);
    }
    if (event.status !== 'PUBLISHED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'checkInClosed' }]);
    }
    if (target.sessionId) {
      const session = await this.prisma.eventSession.findFirst({
        where: { id: target.sessionId, eventId: event.id },
        select: { id: true },
      });
      if (!session) {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'checkInCodeInvalid' }]);
      }
    }
    // Where places are booked in the app, only people who hold one are recorded.
    if (event.registrationMode === 'INTERNAL') {
      const registration = await this.prisma.eventRegistration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: principal.userId } },
        select: { status: true },
      });
      if (registration?.status !== 'REGISTERED') {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'checkInNotRegistered' }]);
      }
    }
    const { row, created } = await this.recordOnce({
      eventId: event.id,
      sessionId: target.sessionId,
      userId: principal.userId,
      method: 'QR',
      recordedBy: null,
    });
    return { recorded: created, sessionId: row.sessionId, at: row.at.toISOString() };
  }

  // --- Admin --------------------------------------------------------------------------------

  /** The address for the QR code to show at the venue, valid for five minutes. */
  async code(
    eventId: string,
    sessionId: string | undefined,
    locale: 'he' | 'en',
  ): Promise<CheckInCodeDto> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { slug: true, status: true },
    });
    if (!event) throw new AppException('NOT_FOUND');
    if (event.status !== 'PUBLISHED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'checkInClosed' }]);
    }
    if (sessionId) await this.sessionOf(eventId, sessionId);
    const { token, expiresAt } = await this.tokens.issue({ eventId, sessionId: sessionId ?? null });
    const url = new URL(`/${locale}/events/${event.slug}/check-in`, this.env.APP_BASE_URL);
    url.searchParams.set('t', token);
    return { url: url.toString(), expiresAt: expiresAt.toISOString() };
  }

  async list(eventId: string, query: AttendanceListQueryDto): Promise<AttendanceListDto> {
    await this.existing(eventId);
    const where: Prisma.EventAttendanceWhereInput = {
      eventId,
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
    };
    const [rows, total, people] = await Promise.all([
      this.prisma.eventAttendance.findMany({
        where,
        include: WITH_USER,
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.eventAttendance.count({ where }),
      this.prisma.eventAttendance.findMany({
        where: { eventId, voidedAt: null },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);
    return {
      attendees: people.length,
      items: rows.map(view),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Marks an account as attended, by hand. */
  async recordManually(
    eventId: string,
    input: { email: string; sessionId?: string },
    actor: EventActor,
  ): Promise<AttendanceRecordDto> {
    const event = await this.existing(eventId);
    if (event.status === 'DRAFT') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'checkInClosed' }]);
    }
    if (input.sessionId) await this.sessionOf(eventId, input.sessionId);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true },
    });
    if (!user) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'email', code: 'unknownAccount' }]);
    }
    const { row, created } = await this.recordOnce({
      eventId,
      sessionId: input.sessionId ?? null,
      userId: user.id,
      method: 'MANUAL',
      recordedBy: actor.userId,
    });
    if (!created) throw new AppException('CONFLICT', [{ code: 'attendanceAlreadyRecorded' }]);
    await this.record('event.attendance.record', eventId, actor, { attendanceId: row.id });
    return view(await this.withUser(row.id));
  }

  /** Voids a wrong record. It stays in the list, marked, with the reason. */
  async void(
    eventId: string,
    attendanceId: string,
    reason: string,
    actor: EventActor,
  ): Promise<AttendanceRecordDto> {
    const row = await this.prisma.eventAttendance.findFirst({
      where: { id: attendanceId, eventId },
    });
    if (!row) throw new AppException('NOT_FOUND');
    if (row.voidedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'attendanceAlreadyVoided' }]);
    }
    await this.prisma.eventAttendance.update({
      where: { id: attendanceId },
      data: { voidedAt: new Date(), voidedBy: actor.userId, voidReason: reason.trim() },
    });
    await this.record('event.attendance.void', eventId, actor, { attendanceId });
    return view(await this.withUser(attendanceId));
  }

  /** Every record of the event as CSV (UTF-8 with a byte-order mark, so Excel reads Hebrew). */
  async csv(eventId: string): Promise<string> {
    await this.existing(eventId);
    const rows = await this.prisma.eventAttendance.findMany({
      where: { eventId },
      include: {
        ...WITH_USER,
        session: { include: { translations: { select: { locale: true, title: true } } } },
      },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    });
    const lines = [
      ['name', 'email', 'session', 'method', 'recorded_at', 'voided_at', 'void_reason'],
      ...rows.map((row) => [
        nameOf(row) ?? '',
        row.user.email,
        row.session
          ? ((
              row.session.translations.find((t) => t.locale === 'he') ?? row.session.translations[0]
            )?.title ?? '')
          : '',
        row.method,
        row.at.toISOString(),
        row.voidedAt?.toISOString() ?? '',
        row.voidReason ?? '',
      ]),
    ];
    return `${BOM}${lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`;
  }

  // --- Internals ----------------------------------------------------------------------------

  /** Creates the record unless a live one exists (a database rule), and says which happened. */
  private async recordOnce(data: {
    eventId: string;
    sessionId: string | null;
    userId: string;
    method: 'QR' | 'MANUAL';
    recordedBy: string | null;
  }) {
    const live = () =>
      this.prisma.eventAttendance.findFirst({
        where: {
          eventId: data.eventId,
          sessionId: data.sessionId,
          userId: data.userId,
          voidedAt: null,
        },
      });
    const existing = await live();
    if (existing) return { row: existing, created: false };
    try {
      const row = await this.prisma.eventAttendance.create({ data: { id: uuidv7(), ...data } });
      return { row, created: true };
    } catch (error) {
      // Two scans at the same moment: the unique index lets one in; the other reads it back.
      if (!isUniqueViolation(error)) throw error;
      return { row: (await live())!, created: false };
    }
  }

  private async existing(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true },
    });
    if (!event) throw new AppException('NOT_FOUND');
    return event;
  }

  private async sessionOf(eventId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.eventSession.findFirst({
      where: { id: sessionId, eventId },
      select: { id: true },
    });
    if (!session) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'sessionId', code: 'unknownSession' }]);
    }
  }

  private withUser(id: string): Promise<Row> {
    return this.prisma.eventAttendance.findUniqueOrThrow({ where: { id }, include: WITH_USER });
  }

  private record(
    action: string,
    eventId: string,
    actor: EventActor,
    changes: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      correlationId: actor.meta.correlationId,
      actorUserId: actor.userId,
      actorIp: actor.meta.ip,
      entityType: 'event',
      entityId: eventId,
      changes,
    });
  }
}

/** A byte-order mark: with it, Excel reads the file as UTF-8 and shows Hebrew correctly. */
const BOM = String.fromCharCode(0xfeff);

function nameOf(row: Row): string | null {
  return (
    [row.user.profile?.firstName, row.user.profile?.lastName].filter(Boolean).join(' ') || null
  );
}

function view(row: Row): AttendanceRecordDto {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    name: nameOf(row),
    sessionId: row.sessionId,
    method: row.method,
    at: row.at.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
  };
}

/**
 * One CSV cell: quoted, with quotes doubled. A cell that starts like a formula gets a leading
 * apostrophe, so a spreadsheet shows it as text instead of running it.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
