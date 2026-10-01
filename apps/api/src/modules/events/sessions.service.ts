import { Injectable, type OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { AuditService } from '../audit';
import { FilesService } from '../files';
import { type EventActor } from './events-admin.service';
import { EventsPublicService } from './events-public.service';
import {
  type AdminSessionDto,
  type AdminSpeakerDto,
  type AdminSpeakerListDto,
  type AdminSpeakerListQueryDto,
  type PublicSessionListDto,
  type SessionInputDto,
  type SpeakerInputDto,
} from './sessions.dto';

const SESSION = {
  translations: true,
  speakers: {
    orderBy: { sortOrder: 'asc' },
    include: { speaker: { include: { translations: true } } },
  },
  materials: { orderBy: { sortOrder: 'asc' }, include: { file: true } },
} satisfies Prisma.EventSessionInclude;
type SessionRow = Prisma.EventSessionGetPayload<{ include: typeof SESSION }>;

const SPEAKER = {
  translations: true,
  _count: { select: { sessions: true } },
} satisfies Prisma.SpeakerInclude;
type SpeakerRow = Prisma.SpeakerGetPayload<{ include: typeof SPEAKER }>;

type Locale = 'he' | 'en';
const LOCALES: Locale[] = ['he', 'en'];

/** The requested language, else Hebrew, else whatever exists. */
function pick<T extends { locale: string }>(rows: T[], locale: Locale): T {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he') ?? rows[0]!;
}

/**
 * Sessions and speakers (M5 plan §2.2). Sessions belong to one event and lie inside its time
 * span. Speakers are records shared between events (not accounts). Session materials are files
 * from the files module; whoever may see the event may read them.
 */
@Injectable()
export class SessionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
    private readonly events: EventsPublicService,
    private readonly audit: AuditService,
  ) {}

  /** Speaker photos and session materials are readable by whoever may see one of their events. */
  onModuleInit(): void {
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const live = {
          status: { in: ['PUBLISHED', 'CANCELLED'] },
        } satisfies Prisma.EventWhereInput;
        const events = await this.prisma.event.findMany({
          where: {
            ...live,
            sessions: {
              some: {
                OR: [
                  { materials: { some: { fileId } } },
                  { speakers: { some: { speaker: { photoFileId: fileId } } } },
                ],
              },
            },
          },
          select: { id: true, accessTier: true },
        });
        if (events.length === 0) return null;
        const viewer = await this.access.viewerOf(principal);
        for (const event of events) {
          if (await this.access.canSeeItem('event', event, viewer)) return true;
        }
        return false;
      },
    });
  }

  // --- Speakers -------------------------------------------------------------------------------

  async listSpeakers(query: AdminSpeakerListQueryDto): Promise<AdminSpeakerListDto> {
    const where: Prisma.SpeakerWhereInput = query.q
      ? { translations: { some: { name: { contains: query.q, mode: 'insensitive' } } } }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.speaker.findMany({
        where,
        include: SPEAKER,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.speaker.count({ where }),
    ]);
    return { items: rows.map(speakerView), page: query.page, pageSize: query.pageSize, total };
  }

  async createSpeaker(input: SpeakerInputDto, actor: EventActor): Promise<AdminSpeakerDto> {
    await this.validatePhoto(input.photoFileId);
    const id = uuidv7();
    await this.prisma.speaker.create({
      data: {
        id,
        photoFileId: input.photoFileId ?? null,
        translations: { create: speakerTexts(input) },
      },
    });
    if (input.photoFileId) await this.files.markAttached(input.photoFileId);
    await this.record('speaker.create', 'speaker', id, actor);
    return this.getSpeaker(id);
  }

  async updateSpeaker(
    id: string,
    input: SpeakerInputDto,
    actor: EventActor,
  ): Promise<AdminSpeakerDto> {
    await this.getSpeaker(id);
    await this.validatePhoto(input.photoFileId);
    await this.prisma.$transaction([
      this.prisma.speakerTranslation.deleteMany({ where: { speakerId: id } }),
      this.prisma.speaker.update({
        where: { id },
        data: {
          photoFileId: input.photoFileId ?? null,
          translations: { create: speakerTexts(input) },
        },
      }),
    ]);
    if (input.photoFileId) await this.files.markAttached(input.photoFileId);
    await this.record('speaker.update', 'speaker', id, actor);
    return this.getSpeaker(id);
  }

  async removeSpeaker(id: string, actor: EventActor): Promise<void> {
    const speaker = await this.getSpeaker(id);
    if (speaker.sessionCount > 0) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'speakerInUse' }]);
    }
    await this.prisma.speaker.delete({ where: { id } });
    await this.record('speaker.delete', 'speaker', id, actor);
  }

  private async getSpeaker(id: string): Promise<AdminSpeakerDto> {
    const row = await this.prisma.speaker.findUnique({ where: { id }, include: SPEAKER });
    if (!row) throw new AppException('NOT_FOUND');
    return speakerView(row);
  }

  private async validatePhoto(fileId: string | null | undefined): Promise<void> {
    if (!fileId) return;
    const image = await this.prisma.storedFile.findFirst({
      where: { id: fileId, purpose: 'CONTENT', kind: 'IMAGE' },
      select: { id: true },
    });
    if (!image) throw invalid('photoFileId', 'unknownImage');
  }

  // --- Sessions (admin) -----------------------------------------------------------------------

  async listSessions(eventId: string): Promise<AdminSessionDto[]> {
    await this.editableEvent(eventId, false);
    const rows = await this.prisma.eventSession.findMany({
      where: { eventId },
      include: SESSION,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(sessionView);
  }

  async createSession(
    eventId: string,
    input: SessionInputDto,
    actor: EventActor,
  ): Promise<AdminSessionDto> {
    const event = await this.editableEvent(eventId, true);
    await this.validateSession(event, input);
    const id = uuidv7();
    await this.prisma.eventSession.create({
      data: { id, eventId, ...sessionColumns(input), ...sessionParts(input) },
    });
    for (const fileId of input.materialFileIds) await this.files.markAttached(fileId);
    await this.record('event.session.create', 'event', eventId, actor, { sessionId: id });
    return this.getSession(eventId, id);
  }

  async updateSession(
    eventId: string,
    sessionId: string,
    input: SessionInputDto,
    actor: EventActor,
  ): Promise<AdminSessionDto> {
    const event = await this.editableEvent(eventId, true);
    await this.getSession(eventId, sessionId);
    await this.validateSession(event, input);
    await this.prisma.$transaction([
      this.prisma.eventSessionTranslation.deleteMany({ where: { sessionId } }),
      this.prisma.sessionSpeaker.deleteMany({ where: { sessionId } }),
      this.prisma.sessionMaterial.deleteMany({ where: { sessionId } }),
      this.prisma.eventSession.update({
        where: { id: sessionId },
        data: { ...sessionColumns(input), ...sessionParts(input) },
      }),
    ]);
    for (const fileId of input.materialFileIds) await this.files.markAttached(fileId);
    await this.record('event.session.update', 'event', eventId, actor, { sessionId });
    return this.getSession(eventId, sessionId);
  }

  async removeSession(eventId: string, sessionId: string, actor: EventActor): Promise<void> {
    await this.editableEvent(eventId, true);
    await this.getSession(eventId, sessionId);
    await this.prisma.eventSession.delete({ where: { id: sessionId } });
    await this.record('event.session.delete', 'event', eventId, actor, { sessionId });
  }

  private async getSession(eventId: string, sessionId: string): Promise<AdminSessionDto> {
    const row = await this.prisma.eventSession.findFirst({
      where: { id: sessionId, eventId },
      include: SESSION,
    });
    if (!row) throw new AppException('NOT_FOUND');
    return sessionView(row);
  }

  /** The event, which must exist; to change its sessions it must not be cancelled. */
  private async editableEvent(eventId: string, forChange: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, startAt: true, endAt: true },
    });
    if (!event) throw new AppException('NOT_FOUND');
    if (forChange && event.status === 'CANCELLED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'eventCancelled' }]);
    }
    return event;
  }

  private async validateSession(
    event: { startAt: Date | null; endAt: Date | null },
    input: SessionInputDto,
  ): Promise<void> {
    // Sessions lie inside their event (M5 plan §5), so the event needs its dates first.
    if (!event.startAt || !event.endAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'eventDatesRequired' }]);
    }
    const [start, end] = [Date.parse(input.startAt), Date.parse(input.endAt)];
    if (start < event.startAt.getTime() || end > event.endAt.getTime()) {
      throw invalid('startAt', 'sessionOutsideEvent');
    }
    if (input.speakerIds.length) {
      const count = await this.prisma.speaker.count({ where: { id: { in: input.speakerIds } } });
      if (count !== new Set(input.speakerIds).size) throw invalid('speakerIds', 'unknownSpeaker');
    }
    if (input.materialFileIds.length) {
      const count = await this.prisma.storedFile.count({
        where: { id: { in: input.materialFileIds }, purpose: 'CONTENT' },
      });
      if (count !== new Set(input.materialFileIds).size) {
        throw invalid('materialFileIds', 'unknownFile');
      }
    }
  }

  // --- Sessions (public) ----------------------------------------------------------------------

  /** The sessions of an event the caller may see, in order of time. */
  async publicSessions(
    principal: Principal | null,
    slug: string,
    locale: Locale,
  ): Promise<PublicSessionListDto> {
    const event = await this.events.visible(principal, slug);
    const rows = await this.prisma.eventSession.findMany({
      where: { eventId: event.id },
      include: SESSION,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return {
      items: rows.map((row) => {
        const text = pick(row.translations, locale);
        return {
          id: row.id,
          title: text.title,
          description: text.description,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          room: row.room,
          locale: text.locale as Locale,
          speakers: row.speakers.map(({ speaker }) => {
            const who = pick(speaker.translations, locale);
            return {
              id: speaker.id,
              name: who.name,
              title: who.title,
              affiliation: who.affiliation,
              bio: who.bio,
              photoFileId: speaker.photoFileId,
            };
          }),
          materials: row.materials.map(({ file }) => materialView(file)),
        };
      }),
    };
  }

  private record(
    action: string,
    entityType: string,
    entityId: string,
    actor: EventActor,
    changes?: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      correlationId: actor.meta.correlationId,
      actorUserId: actor.userId,
      actorIp: actor.meta.ip,
      entityType,
      entityId,
      ...(changes ? { changes } : {}),
    });
  }
}

function speakerTexts(input: SpeakerInputDto) {
  return LOCALES.flatMap((locale) => {
    const text = input.translations[locale];
    return text
      ? [
          {
            locale,
            name: text.name,
            title: text.title || null,
            affiliation: text.affiliation || null,
            bio: text.bio || null,
          },
        ]
      : [];
  });
}

function speakerView(row: SpeakerRow): AdminSpeakerDto {
  const text = (locale: Locale) => {
    const t = row.translations.find((item) => item.locale === locale);
    return t ? { name: t.name, title: t.title, affiliation: t.affiliation, bio: t.bio } : undefined;
  };
  return {
    id: row.id,
    photoFileId: row.photoFileId,
    translations: { he: text('he'), en: text('en') },
    sessionCount: row._count.sessions,
  };
}

function sessionColumns(input: SessionInputDto) {
  return {
    startAt: new Date(input.startAt),
    endAt: new Date(input.endAt),
    room: input.room || null,
  };
}

function sessionParts(input: SessionInputDto) {
  return {
    translations: {
      create: LOCALES.flatMap((locale) => {
        const text = input.translations[locale];
        return text ? [{ locale, title: text.title, description: text.description || null }] : [];
      }),
    },
    speakers: {
      create: [...new Set(input.speakerIds)].map((speakerId, sortOrder) => ({
        speakerId,
        sortOrder,
      })),
    },
    materials: {
      create: [...new Set(input.materialFileIds)].map((fileId, sortOrder) => ({
        fileId,
        sortOrder,
      })),
    },
  };
}

function materialView(file: SessionRow['materials'][number]['file']) {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  };
}

function sessionView(row: SessionRow): AdminSessionDto {
  const text = (locale: Locale) => {
    const t = row.translations.find((item) => item.locale === locale);
    return t ? { title: t.title, description: t.description } : undefined;
  };
  return {
    id: row.id,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    room: row.room,
    speakerIds: row.speakers.map((s) => s.speakerId),
    materials: row.materials.map(({ file }) => materialView(file)),
    translations: { he: text('he'), en: text('en') },
  };
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);
