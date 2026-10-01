import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { FilesService } from '../files';
import {
  type PublicEventDto,
  type PublicEventListDto,
  type PublicEventQueryDto,
} from './events.dto';

const INCLUDE = { translations: true, category: true } satisfies Prisma.EventInclude;
type Row = Prisma.EventGetPayload<{ include: typeof INCLUDE }>;
type Locale = 'he' | 'en';

/** What readers can reach: published events, and cancelled ones (shown as cancelled). */
const LIVE = { status: { in: ['PUBLISHED', 'CANCELLED'] } } satisfies Prisma.EventWhereInput;

/**
 * Public events (M5 plan §2.1): published events the reader may see under the access tiers, in
 * their language with a Hebrew fallback. Hidden events are left out of lists and answer 404 by
 * link, like missing ones.
 */
@Injectable()
export class EventsPublicService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
  ) {}

  /** An event's image is readable by whoever may see the event. */
  onModuleInit(): void {
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const events = await this.prisma.event.findMany({
          where: { ...LIVE, imageFileId: fileId },
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

  async list(principal: Principal | null, query: PublicEventQueryDto): Promise<PublicEventListDto> {
    const viewer = await this.access.viewerOf(principal);
    const now = new Date();
    const upcoming = query.when === 'upcoming';
    const where: Prisma.EventWhereInput = {
      ...LIVE,
      endAt: upcoming ? { gt: now } : { lte: now },
      AND: [await this.access.visibleWhere('event', viewer)],
      ...(query.category ? { category: { key: query.category } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: INCLUDE,
        // Upcoming: the soonest first. Past: the most recent first.
        orderBy: [{ startAt: upcoming ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      items: rows.map((row) => summary(row, query.locale)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(principal: Principal | null, slug: string, locale: Locale): Promise<PublicEventDto> {
    const row = await this.visible(principal, slug);
    const text = pick(row, locale);
    return {
      ...summary(row, locale),
      description: text.description,
      address: row.address,
      lat: row.lat === null ? null : Number(row.lat),
      lng: row.lng === null ? null : Number(row.lng),
      organizer: row.organizer,
      registrationUrl: row.registrationMode === 'EXTERNAL' ? row.registrationUrl : null,
      capacity: row.capacity,
      cancelReason: row.cancelReason,
      sourceUrl: row.sourceUrl,
    };
  }

  /** The live event with this URL name, if the caller may see it; otherwise 404. */
  async visible(principal: Principal | null, slug: string): Promise<Row> {
    const row = await this.prisma.event.findFirst({ where: { ...LIVE, slug }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    const viewer = await this.access.viewerOf(principal);
    if (!(await this.access.canSeeItem('event', row, viewer))) throw new AppException('NOT_FOUND');
    return row;
  }
}

/** The requested language, else Hebrew, else whatever exists. */
function pick(row: Row, locale: Locale) {
  return (
    row.translations.find((t) => t.locale === locale) ??
    row.translations.find((t) => t.locale === 'he') ??
    row.translations[0]!
  );
}

function summary(row: Row, locale: Locale) {
  const text = pick(row, locale);
  return {
    slug: row.slug,
    title: text.title,
    summary: text.summary,
    category: row.category
      ? { key: row.category.key, nameHe: row.category.nameHe, nameEn: row.category.nameEn }
      : null,
    // Published and cancelled events always have their dates (a database rule).
    startAt: row.startAt!.toISOString(),
    endAt: row.endAt!.toISOString(),
    timezone: row.timezone,
    locationName: row.locationName,
    imageFileId: row.imageFileId,
    cancelled: row.status === 'CANCELLED',
    registrationMode: row.registrationMode,
    cmeAvailable: row.cmeAvailable,
    accessTier: row.accessTier,
    locale: text.locale as Locale,
    fallback: text.locale !== locale,
  };
}
