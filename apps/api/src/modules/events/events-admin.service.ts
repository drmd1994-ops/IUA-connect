import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { AuditService } from '../audit';
import { FilesService } from '../files';
import { parseIfMatch, sanitizeMarkdown, slugify, uniqueSlug } from '../news';
import { cancelProblem, publishProblem } from './event-rules';
import { ContentAnnouncer } from '../notifications';
import { RegistrationsService } from './registrations.service';
import {
  type AdminEventDto,
  type AdminEventListDto,
  type AdminEventListQueryDto,
  type CreateEventCategoryDto,
  type EventCategoryDto,
  type EventInputDto,
  type UpdateEventCategoryDto,
} from './events.dto';

const INCLUDE = { translations: true, image: true } satisfies Prisma.EventInclude;
type Row = Prisma.EventGetPayload<{ include: typeof INCLUDE }>;
type Locale = 'he' | 'en';

const CATEGORY = {
  id: true,
  key: true,
  nameHe: true,
  nameEn: true,
  sortOrder: true,
  active: true,
} as const;

export interface EventActor {
  userId: string;
  meta: RequestMeta;
}

/**
 * Event management (M5 plan §2.1, §3). An event admin creates, edits, publishes and cancels
 * events; there is no second reviewer. Saves carry the version they were loaded with
 * (If-Match), so two admins can't overwrite each other. Every change is audited.
 */
@Injectable()
export class EventsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly registrations: RegistrationsService,
    private readonly announcer: ContentAnnouncer,
  ) {}

  async list(query: AdminEventListQueryDto): Promise<AdminEventListDto> {
    const where: Prisma.EventWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { translations: { select: { locale: true, title: true } } },
        orderBy: [{ startAt: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        status: row.status,
        titleHe: row.translations.find((t) => t.locale === 'he')?.title ?? null,
        titleEn: row.translations.find((t) => t.locale === 'en')?.title ?? null,
        startAt: row.startAt?.toISOString() ?? null,
        endAt: row.endAt?.toISOString() ?? null,
        accessTier: row.accessTier,
        registrationMode: row.registrationMode,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<AdminEventDto> {
    const row = await this.prisma.event.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    return { ...view(row), typeIds: await this.access.allowedTypes('event', id) };
  }

  async create(input: EventInputDto, actor: EventActor): Promise<AdminEventDto> {
    await this.validate(input);
    const base = input.slug ?? slugify((input.translations.he ?? input.translations.en)!.title);
    const slug = await uniqueSlug(base, async (candidate) =>
      Boolean(await this.prisma.event.findUnique({ where: { slug: candidate } })),
    );
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.event.create({
        data: {
          id,
          slug,
          status: 'DRAFT',
          createdBy: actor.userId,
          ...columns(input),
          translations: { create: translations(input) },
        },
      });
      await this.access.setRules(tx, 'event', id, input.accessTier, input.typeIds);
    });
    if (input.imageFileId) await this.files.markAttached(input.imageFileId);
    await this.record('event.create', id, actor);
    return this.get(id);
  }

  /** Replaces the event (If-Match must carry its current version). Cancelled events are closed. */
  async update(
    id: string,
    input: EventInputDto,
    ifMatch: string | undefined,
    actor: EventActor,
  ): Promise<AdminEventDto> {
    const row = await this.prisma.event.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    if (parseIfMatch(ifMatch) !== row.version) {
      throw new AppException('PRECONDITION_FAILED', [{ code: 'eventChanged' }]);
    }
    if (row.status === 'CANCELLED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'eventCancelled' }]);
    }
    await this.validate(input);
    if (row.status === 'PUBLISHED') {
      // What made it publishable must stay true while it is public.
      const problem = publishProblem({ ...checkOf(input), status: 'DRAFT' });
      if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    }
    await this.sessionsStillFit(id, input);
    // The URL name can change until the event is first published.
    let slug = row.slug;
    if (row.status === 'DRAFT' && input.slug && input.slug !== row.slug) {
      if (await this.prisma.event.findUnique({ where: { slug: input.slug } })) {
        throw new AppException('CONFLICT', [{ field: 'slug', code: 'slugTaken' }]);
      }
      slug = input.slug;
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.event.updateMany({
        where: { id, version: row.version },
        data: { ...columns(input), slug, version: { increment: 1 } },
      });
      if (count === 0) throw new AppException('PRECONDITION_FAILED', [{ code: 'eventChanged' }]);
      await tx.eventTranslation.deleteMany({ where: { eventId: id } });
      await tx.eventTranslation.createMany({
        data: translations(input).map((t) => ({ ...t, eventId: id })),
      });
      await this.access.setRules(tx, 'event', id, input.accessTier, input.typeIds);
    });
    if (input.imageFileId) await this.files.markAttached(input.imageFileId);
    await this.record('event.update', id, actor);
    // A larger capacity gives places to people on the waiting list.
    await this.registrations.fillFreePlaces(id);
    if (row.status === 'PUBLISHED' && movedOrRescheduled(row, input)) {
      await this.registrations.notifyRegistrants(id, 'eventChanged');
    }
    return this.get(id);
  }

  async publish(id: string, actor: EventActor): Promise<AdminEventDto> {
    const row = await this.prisma.event.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    const problem = publishProblem({
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      hasHebrewTitle: row.translations.some((t) => t.locale === 'he'),
      registrationMode: row.registrationMode,
      registrationUrl: row.registrationUrl,
    });
    if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    const { count } = await this.prisma.event.updateMany({
      where: { id, status: 'DRAFT', version: row.version },
      data: { status: 'PUBLISHED', publishedAt: new Date(), version: { increment: 1 } },
    });
    if (count === 0) throw new AppException('CONFLICT', [{ code: 'eventChanged' }]);
    await this.record('event.publish', id, actor);
    await this.announcer.announce({
      entityType: 'event',
      entityId: id,
      kind: 'NEW_EVENTS',
      type: 'contentEvent',
      translations: row.translations,
      link: `/events/${row.slug}`,
      accessTier: row.accessTier,
    });
    return this.get(id);
  }

  async cancel(id: string, reason: string, actor: EventActor): Promise<AdminEventDto> {
    const row = await this.prisma.event.findUnique({ where: { id } });
    if (!row) throw new AppException('NOT_FOUND');
    const problem = cancelProblem(row.status, reason);
    if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    const { count } = await this.prisma.event.updateMany({
      where: { id, status: 'PUBLISHED' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason.trim(),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new AppException('CONFLICT', [{ code: 'eventChanged' }]);
    await this.record('event.cancel', id, actor);
    await this.registrations.notifyRegistrants(id, 'eventCancelled', { reason: reason.trim() });
    return this.get(id);
  }

  /** Only a draft is deleted; a published event is cancelled instead (M5 plan §3). */
  async remove(id: string, actor: EventActor): Promise<void> {
    const row = await this.prisma.event.findUnique({ where: { id }, select: { status: true } });
    if (!row) throw new AppException('NOT_FOUND');
    if (row.status !== 'DRAFT') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'eventNotDeletable' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.access.setRules(tx, 'event', id, 'PUBLIC', []);
      await tx.event.delete({ where: { id } });
    });
    await this.record('event.delete', id, actor);
  }

  // --- Categories -----------------------------------------------------------------------------

  listCategories(activeOnly: boolean): Promise<EventCategoryDto[]> {
    return this.prisma.eventCategory.findMany({
      where: activeOnly ? { active: true } : {},
      select: CATEGORY,
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
  }

  async createCategory(input: CreateEventCategoryDto): Promise<EventCategoryDto> {
    try {
      return await this.prisma.eventCategory.create({
        data: { id: uuidv7(), ...input },
        select: CATEGORY,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'key', code: 'categoryKeyTaken' }]);
      }
      throw error;
    }
  }

  async updateCategory(id: string, input: UpdateEventCategoryDto): Promise<EventCategoryDto> {
    const found = await this.prisma.eventCategory.findUnique({ where: { id } });
    if (!found) throw new AppException('NOT_FOUND');
    return this.prisma.eventCategory.update({ where: { id }, data: input, select: CATEGORY });
  }

  // --- Helpers --------------------------------------------------------------------------------

  /** Changing the dates must not leave a session outside the event. */
  private async sessionsStillFit(id: string, input: EventInputDto): Promise<void> {
    const span = await this.prisma.eventSession.aggregate({
      where: { eventId: id },
      _min: { startAt: true },
      _max: { endAt: true },
    });
    if (!span._min.startAt || !span._max.endAt) return;
    const fits =
      input.startAt &&
      input.endAt &&
      Date.parse(input.startAt) <= span._min.startAt.getTime() &&
      Date.parse(input.endAt) >= span._max.endAt.getTime();
    if (!fits) throw invalid('startAt', 'eventSessionsOutside');
  }

  private async validate(input: EventInputDto): Promise<void> {
    if (input.categoryId) {
      const category = await this.prisma.eventCategory.findFirst({
        where: { id: input.categoryId, active: true },
        select: { id: true },
      });
      if (!category) throw invalid('categoryId', 'unknownCategory');
    }
    if (input.accessTier === 'TYPES') {
      const count = await this.prisma.membershipType.count({
        where: { id: { in: input.typeIds } },
      });
      if (count !== new Set(input.typeIds).size) throw invalid('typeIds', 'unknownMembershipType');
    }
    if (input.imageFileId) {
      const image = await this.prisma.storedFile.findFirst({
        where: { id: input.imageFileId, purpose: 'CONTENT', kind: 'IMAGE' },
        select: { id: true },
      });
      if (!image) throw invalid('imageFileId', 'unknownImage');
    }
    if (input.registrationMode === 'EXTERNAL' && !input.registrationUrl) {
      throw invalid('registrationUrl', 'eventRegistrationUrlRequired');
    }
  }

  private record(action: string, id: string, actor: EventActor) {
    return this.audit.record({
      action,
      correlationId: actor.meta.correlationId,
      actorUserId: actor.userId,
      actorIp: actor.meta.ip,
      entityType: 'event',
      entityId: id,
    });
  }
}

function columns(input: EventInputDto) {
  return {
    categoryId: input.categoryId ?? null,
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
    locationName: input.locationName || null,
    address: input.address || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    organizer: input.organizer || null,
    imageFileId: input.imageFileId ?? null,
    registrationMode: input.registrationMode,
    registrationUrl: input.registrationUrl ?? null,
    // Places are counted only for in-app registration.
    capacity: input.registrationMode === 'INTERNAL' ? (input.capacity ?? null) : null,
    cmeAvailable: input.cmeAvailable,
    accessTier: input.accessTier,
  };
}

function translations(input: EventInputDto) {
  return (['he', 'en'] as const).flatMap((locale) => {
    const text = input.translations[locale];
    return text
      ? [
          {
            locale,
            title: text.title,
            summary: text.summary || null,
            description: sanitizeMarkdown(text.description),
          },
        ]
      : [];
  });
}

/** True when the time or the place of the event changed (registrants are told). */
function movedOrRescheduled(row: Row, input: EventInputDto): boolean {
  const time = (value: Date | string | null | undefined) =>
    value ? new Date(value).getTime() : null;
  return (
    time(row.startAt) !== time(input.startAt) ||
    time(row.endAt) !== time(input.endAt) ||
    (row.locationName ?? '') !== (input.locationName ?? '') ||
    (row.address ?? '') !== (input.address ?? '')
  );
}

/** The publishing check for an input (used while a published event is edited). */
function checkOf(input: EventInputDto) {
  return {
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
    hasHebrewTitle: Boolean(input.translations.he),
    registrationMode: input.registrationMode,
    registrationUrl: input.registrationUrl ?? null,
  };
}

function view(row: Row): Omit<AdminEventDto, 'typeIds'> {
  const text = (locale: Locale) => {
    const t = row.translations.find((item) => item.locale === locale);
    return t ? { title: t.title, summary: t.summary, description: t.description } : undefined;
  };
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    categoryId: row.categoryId,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    timezone: row.timezone,
    locationName: row.locationName,
    address: row.address,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    organizer: row.organizer,
    image: row.image
      ? {
          id: row.image.id,
          originalName: row.image.originalName,
          width: row.image.width,
          height: row.image.height,
        }
      : null,
    registrationMode: row.registrationMode,
    registrationUrl: row.registrationUrl,
    capacity: row.capacity,
    cmeAvailable: row.cmeAvailable,
    accessTier: row.accessTier,
    translations: { he: text('he'), en: text('en') },
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);
