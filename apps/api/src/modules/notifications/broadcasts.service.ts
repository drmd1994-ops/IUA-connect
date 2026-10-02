import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@iua/i18n';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { Prisma } from '../../generated/prisma/client';
import { JobQueue } from '../../infra/jobs/job-queue';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import {
  type BroadcastAction,
  canEdit,
  paragraphsOf,
  stepProblem,
  submitProblem,
} from './broadcast-rules';
import {
  type AdminBroadcastDto,
  type AdminBroadcastListDto,
  type BroadcastAudienceDto,
  type BroadcastInputDto,
  type BroadcastListQueryDto,
  type BroadcastMessageDto,
} from './broadcasts.dto';
import { Notifier } from './notifier';

export const BROADCAST_DELIVER_JOB = 'notifications.deliver-broadcasts';
const EMAIL_BATCH = 100;

const INCLUDE = { translations: true } satisfies Prisma.BroadcastInclude;
type Row = Prisma.BroadcastGetPayload<{ include: typeof INCLUDE }>;

/**
 * Broadcasts (M7 plan §2.6): a message one admin writes and a different admin approves. On
 * approval, everyone in the audience at that moment gets a delivery row (so nobody receives
 * it twice and only they can read it) and a notice in the app; the emails follow from a job.
 */
@Injectable()
export class BroadcastsService implements OnModuleInit {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobQueue,
    private readonly notifier: Notifier,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: BROADCAST_DELIVER_JOB,
      cron: '* * * * *',
      run: async () => {
        const sent = await this.deliverEmails();
        if (sent) this.logger.log({ sent }, 'Sent broadcast emails');
      },
    });
  }

  // --- Admin ----------------------------------------------------------------------------------

  async list(query: BroadcastListQueryDto, principal: Principal): Promise<AdminBroadcastListDto> {
    const where: Prisma.BroadcastWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.broadcast.count({ where }),
    ]);
    const names = await this.names(rows.flatMap((row) => [row.createdBy, row.decidedBy]));
    return {
      items: rows.map((row) => view(row, names, principal.userId)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, principal: Principal): Promise<AdminBroadcastDto> {
    const row = await this.row(id);
    return view(row, await this.names([row.createdBy, row.decidedBy]), principal.userId);
  }

  /** Creates a draft. The same Idempotency-Key from the same author returns the first one. */
  async create(
    input: BroadcastInputDto,
    idempotencyKey: string | undefined,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    const key = idempotencyKey?.trim().slice(0, 100) || null;
    const existing = () =>
      this.prisma.broadcast.findFirst({
        where: { createdBy: principal.userId, idempotencyKey: key },
        select: { id: true },
      });
    if (key) {
      const found = await existing();
      if (found) return this.get(found.id, principal);
    }
    await this.validateAudience(input);
    const id = uuidv7();
    try {
      await this.prisma.broadcast.create({
        data: {
          id,
          createdBy: principal.userId,
          idempotencyKey: key,
          ...audienceColumns(input),
          translations: { create: translations(input) },
        },
      });
    } catch (error) {
      // The same request arrived twice at once: the first one won.
      const found = key && isUniqueViolation(error) ? await existing() : null;
      if (found) return this.get(found.id, principal);
      throw error;
    }
    await this.record('broadcast.create', id, principal, meta);
    return this.get(id, principal);
  }

  async update(
    id: string,
    input: BroadcastInputDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    const row = await this.row(id);
    this.ensureAuthorCanEdit(row, principal);
    await this.validateAudience(input);
    await this.prisma.$transaction(async (tx) => {
      // Changing a message that was sent back makes it a draft again.
      const { count } = await tx.broadcast.updateMany({
        where: { id, status: row.status },
        data: {
          status: 'DRAFT',
          decidedBy: null,
          decidedAt: null,
          rejectReason: null,
          ...audienceColumns(input),
        },
      });
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'broadcastChanged' }]);
      await tx.broadcastTranslation.deleteMany({ where: { broadcastId: id } });
      await tx.broadcastTranslation.createMany({
        data: translations(input).map((text) => ({ broadcastId: id, ...text })),
      });
    });
    await this.record('broadcast.update', id, principal, meta);
    return this.get(id, principal);
  }

  /** Only the author deletes, and only a message that was not sent. */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const row = await this.row(id);
    this.ensureAuthorCanEdit(row, principal);
    await this.prisma.broadcast.deleteMany({ where: { id, status: row.status } });
    await this.record('broadcast.delete', id, principal, meta);
  }

  async submit(id: string, principal: Principal, meta: RequestMeta): Promise<AdminBroadcastDto> {
    const row = await this.row(id);
    this.ensureStep('SUBMIT', row, principal);
    const hebrew = row.translations.find((t) => t.locale === 'he');
    const problem = submitProblem({
      hebrewTitle: hebrew?.title ?? '',
      hebrewBody: hebrew?.body ?? '',
    });
    if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: row.status },
      data: {
        status: 'PENDING_APPROVAL',
        submittedAt: new Date(),
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
      },
    });
    if (count === 0) throw new AppException('CONFLICT', [{ code: 'broadcastChanged' }]);
    await this.record('broadcast.submit', id, principal, meta);
    return this.get(id, principal);
  }

  async reject(
    id: string,
    reason: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    const row = await this.row(id);
    this.ensureStep('REJECT', row, principal);
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: {
        status: 'REJECTED',
        decidedBy: principal.userId,
        decidedAt: new Date(),
        rejectReason: reason,
      },
    });
    if (count === 0) throw new AppException('CONFLICT', [{ code: 'broadcastChanged' }]);
    await this.record('broadcast.reject', id, principal, meta);
    return this.get(id, principal);
  }

  /**
   * Approves and sends. In one transaction: the audience of this moment gets its delivery
   * rows and notices in the app, and the message becomes SENT with the number of people it
   * reached. Two approvals at once: the second finds it already sent and changes nothing.
   */
  async approve(id: string, principal: Principal, meta: RequestMeta): Promise<AdminBroadcastDto> {
    const row = await this.row(id);
    this.ensureStep('APPROVE', row, principal);
    const hebrew = row.translations.find((t) => t.locale === 'he');
    const english = row.translations.find((t) => t.locale === 'en');
    const params = JSON.stringify({
      ...(hebrew ? { titleHe: hebrew.title } : {}),
      ...(english ? { titleEn: english.title } : {}),
    });
    const link = `/account/notifications/messages/${id}`;
    const now = new Date();

    const recipients = await this.prisma.$transaction(async (tx) => {
      // One approval at a time for this message.
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM broadcasts WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked[0]?.status !== 'PENDING_APPROVAL') {
        throw new AppException('CONFLICT', [{ code: 'broadcastChanged' }]);
      }
      const reached = await tx.$executeRaw`
        INSERT INTO broadcast_deliveries (broadcast_id, user_id)
        SELECT ${id}::uuid, u.id ${audienceSql(row)}
        ON CONFLICT DO NOTHING`;
      if (reached === 0) {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'broadcastNoRecipients' }]);
      }
      await tx.$executeRaw`
        INSERT INTO notifications (id, user_id, kind, type, params, link)
        SELECT gen_random_uuid(), d.user_id, 'ASSOCIATION', 'broadcast', ${params}::jsonb, ${link}
        FROM broadcast_deliveries d
        WHERE d.broadcast_id = ${id}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM notification_preferences p
            WHERE p.user_id = d.user_id AND p.kind = 'ASSOCIATION'
              AND p.channel = 'APP' AND NOT p.enabled
          )`;
      await tx.broadcast.update({
        where: { id },
        data: {
          status: 'SENT',
          decidedBy: principal.userId,
          decidedAt: now,
          sentAt: now,
          recipientCount: reached,
        },
      });
      return reached;
    });
    await this.record('broadcast.approve', id, principal, meta, { recipients });
    return this.get(id, principal);
  }

  /** How many people the message would reach if it were sent now. */
  async audience(id: string): Promise<BroadcastAudienceDto> {
    const row = await this.row(id);
    if (row.status === 'SENT') return { count: row.recipientCount ?? 0 };
    const counted = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count ${audienceSql(row)}`;
    return { count: Number(counted[0]!.count) };
  }

  // --- Sending --------------------------------------------------------------------------------

  /**
   * Emails the broadcasts that were approved, to recipients who have email switched on for
   * messages from the association. Each delivery is taken (marked) before its email goes out,
   * so a repeated or interrupted run never emails anyone twice. Returns how many were emailed.
   */
  async deliverEmails(): Promise<number> {
    let sent = 0;
    for (;;) {
      const batch = await this.prisma.$queryRaw<{ broadcastId: string; userId: string }[]>`
        UPDATE broadcast_deliveries d SET emailed_at = now()
        WHERE (d.broadcast_id, d.user_id) IN (
          SELECT broadcast_id, user_id FROM broadcast_deliveries
          WHERE emailed_at IS NULL
          ORDER BY created_at
          LIMIT ${EMAIL_BATCH}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING d.broadcast_id AS "broadcastId", d.user_id AS "userId"`;
      if (batch.length === 0) return sent;
      const [broadcasts, users] = await Promise.all([
        this.prisma.broadcast.findMany({
          where: { id: { in: [...new Set(batch.map((d) => d.broadcastId))] } },
          include: INCLUDE,
        }),
        this.prisma.user.findMany({
          where: {
            id: { in: [...new Set(batch.map((d) => d.userId))] },
            status: 'ACTIVE',
            emailVerifiedAt: { not: null },
          },
          select: { id: true, email: true, locale: true },
        }),
      ]);
      for (const delivery of batch) {
        const broadcast = broadcasts.find((b) => b.id === delivery.broadcastId);
        const user = users.find((u) => u.id === delivery.userId);
        if (!broadcast || !user) continue;
        const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
        const text = pick(broadcast.translations, locale);
        if (!text) continue;
        try {
          const emailed = await this.notifier.email({
            userId: user.id,
            kind: 'ASSOCIATION',
            to: user.email,
            locale,
            template: 'broadcast',
            params: {
              title: text.title,
              link: new URL(
                `/${locale}/account/notifications/messages/${broadcast.id}`,
                this.env.APP_BASE_URL,
              ).toString(),
            },
            paragraphs: paragraphsOf(text.body),
          });
          if (emailed) sent += 1;
        } catch (error) {
          this.logger.warn({ err: error, broadcastId: broadcast.id }, 'Broadcast email failed');
        }
      }
    }
  }

  // --- Recipients -----------------------------------------------------------------------------

  /** The message as one of its recipients reads it. Anyone else gets "not found". */
  async read(id: string, locale: Locale, principal: Principal): Promise<BroadcastMessageDto> {
    const delivery = await this.prisma.broadcastDelivery.findUnique({
      where: { broadcastId_userId: { broadcastId: id, userId: principal.userId } },
      select: { broadcast: { include: INCLUDE } },
    });
    const broadcast = delivery?.broadcast;
    const text = broadcast ? pick(broadcast.translations, locale) : undefined;
    if (!broadcast || broadcast.status !== 'SENT' || !broadcast.sentAt || !text) {
      throw new AppException('NOT_FOUND');
    }
    return {
      id,
      title: text.title,
      paragraphs: paragraphsOf(text.body),
      locale: text.locale as Locale,
      sentAt: broadcast.sentAt.toISOString(),
    };
  }

  // --- Internals ------------------------------------------------------------------------------

  private async row(id: string): Promise<Row> {
    const row = await this.prisma.broadcast.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  private ensureAuthorCanEdit(row: Row, principal: Principal): void {
    if (row.createdBy !== principal.userId) {
      throw new AppException('FORBIDDEN', [{ code: 'broadcastNotYours' }]);
    }
    if (!canEdit(row.status)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'broadcastNotEditable' }]);
    }
  }

  private ensureStep(action: BroadcastAction, row: Row, principal: Principal): void {
    const problem = stepProblem(action, row, {
      userId: principal.userId,
      canApprove: principal.permissions.has('broadcasts.approve'),
    });
    if (!problem) return;
    if (problem === 'forbidden') throw new AppException('FORBIDDEN');
    if (problem === 'broadcastStepNotAllowed') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    }
    throw new AppException('FORBIDDEN', [{ code: problem }]);
  }

  private async validateAudience(input: BroadcastInputDto): Promise<void> {
    if (input.audience.all) return;
    const ids = [...new Set(input.audience.typeIds)];
    const known = await this.prisma.membershipType.count({ where: { id: { in: ids } } });
    if (ids.length === 0 || known !== ids.length) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'audience.typeIds', code: 'broadcastUnknownType' },
      ]);
    }
  }

  /** Display names of the admins named on broadcasts. */
  private async names(ids: (string | null)[]): Promise<Map<string, string | null>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: wanted } },
      select: { userId: true, firstName: true, lastName: true },
    });
    return new Map(
      wanted.map((id) => {
        const profile = profiles.find((p) => p.userId === id);
        const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
        return [id, name || null] as const;
      }),
    );
  }

  private record(
    action: string,
    id: string,
    principal: Principal,
    meta: RequestMeta,
    changes?: Record<string, unknown>,
  ): Promise<string> {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'broadcast',
      entityId: id,
      ...(changes ? { changes } : {}),
    });
  }
}

/**
 * "FROM … WHERE …" for the people a broadcast reaches: verified, active accounts with an
 * active membership today, of the chosen types when the audience is not everyone.
 */
function audienceSql(row: { audienceAll: boolean; typeIds: string[] }): Prisma.Sql {
  return Prisma.sql`
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    WHERE u.status = 'ACTIVE'
      AND u.email_verified_at IS NOT NULL
      AND m.status = 'ACTIVE'
      AND m.end_date >= (now() AT TIME ZONE 'Asia/Jerusalem')::date
      AND (${row.audienceAll} OR m.type_id = ANY(${row.typeIds}::uuid[]))`;
}

function audienceColumns(input: BroadcastInputDto) {
  return {
    audienceAll: input.audience.all,
    typeIds: input.audience.all ? [] : [...new Set(input.audience.typeIds)],
  };
}

function translations(input: BroadcastInputDto) {
  return (['he', 'en'] as const).flatMap((locale) => {
    const text = input.translations[locale];
    return text ? [{ locale, title: text.title, body: text.body }] : [];
  });
}

/** The text in the reader's language, or in Hebrew, or whatever there is. */
function pick<T extends { locale: string }>(texts: T[], locale: Locale): T | undefined {
  return texts.find((t) => t.locale === locale) ?? texts.find((t) => t.locale === 'he') ?? texts[0];
}

function view(row: Row, names: Map<string, string | null>, viewerId: string): AdminBroadcastDto {
  const text = (locale: string) => {
    const found = row.translations.find((t) => t.locale === locale);
    return found ? { title: found.title, body: found.body } : undefined;
  };
  const he = text('he');
  const en = text('en');
  return {
    id: row.id,
    status: row.status,
    audience: { all: row.audienceAll, typeIds: row.typeIds },
    translations: { ...(he ? { he } : {}), ...(en ? { en } : {}) },
    author: { id: row.createdBy, name: names.get(row.createdBy) ?? null },
    decidedBy: row.decidedBy ? { id: row.decidedBy, name: names.get(row.decidedBy) ?? null } : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    rejectReason: row.rejectReason,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    recipientCount: row.recipientCount,
    mine: row.createdBy === viewerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
