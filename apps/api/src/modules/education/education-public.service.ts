import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { VideoProvider } from '../../infra/video/video-provider';
import { AccessService, type Viewer } from '../access';
import { FilesService } from '../files';
import { ImagingService } from '../imaging';
import {
  type PublicEducationDto,
  type PublicEducationListDto,
  type PublicEducationQueryDto,
} from './education.dto';

const INCLUDE = {
  translations: true,
  subspecialty: true,
  files: { orderBy: { sortOrder: 'asc' }, include: { file: true } },
} satisfies Prisma.EducationItemInclude;
type Row = Prisma.EducationItemGetPayload<{ include: typeof INCLUDE }>;
type Locale = 'he' | 'en';

/**
 * The education library (M6 plan §2.5): published items the reader may see under the access
 * tiers, in their language with a Hebrew fallback. Archived items leave the list but still open
 * by link. Hidden items answer 404, like missing ones.
 */
@Injectable()
export class EducationPublicService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
    private readonly imaging: ImagingService,
    private readonly video: VideoProvider,
  ) {}

  /**
   * An item's cover, files and scans are readable by whoever may read the item. Library editors
   * read an item's scans before it is published, as they read the rest of it.
   */
  onModuleInit(): void {
    this.imaging.registerReadRule({
      canRead: async (place, principal) => {
        if (!place.educationItemId) return null;
        if (principal?.permissions.has('education.manage')) return true;
        const item = await this.prisma.educationItem.findFirst({
          where: { id: place.educationItemId, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
          select: { id: true, accessTier: true },
        });
        if (!item) return false;
        return this.access.canSeeItem('education', item, await this.access.viewerOf(principal));
      },
    });
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const items = await this.prisma.educationItem.findMany({
          where: {
            status: { in: ['PUBLISHED', 'ARCHIVED'] },
            OR: [{ coverFileId: fileId }, { files: { some: { fileId } } }],
          },
          select: { id: true, accessTier: true },
        });
        if (items.length === 0) return null;
        const viewer = await this.access.viewerOf(principal);
        for (const item of items) {
          if (await this.access.canSeeItem('education', item, viewer)) return true;
        }
        return false;
      },
    });
  }

  async list(
    principal: Principal | null,
    query: PublicEducationQueryDto,
  ): Promise<PublicEducationListDto> {
    const viewer = await this.access.viewerOf(principal);
    const where: Prisma.EducationItemWhereInput = {
      status: 'PUBLISHED',
      AND: [await this.access.visibleWhere('education', viewer)],
      ...(query.type ? { type: query.type } : {}),
      // An item for all levels (no level set) suits every reader.
      ...(query.level ? { OR: [{ level: query.level }, { level: null }] } : {}),
      ...(query.subspecialty ? { subspecialty: { key: query.subspecialty } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.educationItem.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.educationItem.count({ where }),
    ]);
    return {
      items: rows.map((row) => summary(row, query.locale)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(
    principal: Principal | null,
    slug: string,
    locale: Locale,
  ): Promise<PublicEducationDto> {
    const row = await this.prisma.educationItem.findFirst({
      where: { slug, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      include: INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    const viewer = await this.access.viewerOf(principal);
    if (!(await this.access.canSeeItem('education', row, viewer))) {
      throw new AppException('NOT_FOUND');
    }
    return {
      ...summary(row, locale),
      description: pick(row, locale).description,
      archived: row.status === 'ARCHIVED',
      // Where the recording is played is the provider's answer (today: the stored link itself).
      externalUrl: row.externalUrl
        ? this.video.playback(row.externalUrl, { userId: principal?.userId ?? null }).url
        : null,
      videoStatus: row.videoStatus,
      files: row.files.map(({ file }) => ({
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      })),
      scans: await this.imaging.listFor({ educationItemId: row.id }),
      references: row.references as PublicEducationDto['references'],
      lessons: row.type === 'COURSE' ? await this.lessons(row.id, viewer, locale) : [],
    };
  }

  /**
   * The published lessons of a course, numbered in order. A lesson the reader may not see keeps
   * its place as a locked line without its details.
   */
  private async lessons(
    courseId: string,
    viewer: Viewer,
    locale: Locale,
  ): Promise<PublicEducationDto['lessons']> {
    const rows = await this.prisma.courseItem.findMany({
      where: { courseId, item: { status: 'PUBLISHED' } },
      orderBy: { position: 'asc' },
      include: { item: { include: { translations: true } } },
    });
    const lessons: PublicEducationDto['lessons'] = [];
    for (const [index, { item }] of rows.entries()) {
      const position = index + 1;
      if (await this.access.canSeeItem('education', item, viewer)) {
        lessons.push({
          position,
          locked: false,
          slug: item.slug,
          type: item.type,
          title: pickText(item.translations, locale).title,
          durationMinutes: item.durationMinutes,
        });
      } else {
        lessons.push({
          position,
          locked: true,
          slug: null,
          type: null,
          title: null,
          durationMinutes: null,
        });
      }
    }
    return lessons;
  }
}

/** The requested language, else Hebrew, else whatever exists. */
function pickText<T extends { locale: string }>(rows: T[], locale: Locale): T {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he') ?? rows[0]!;
}

const pick = (row: Row, locale: Locale) => pickText(row.translations, locale);

function summary(row: Row, locale: Locale) {
  const text = pick(row, locale);
  return {
    slug: row.slug,
    type: row.type,
    title: text.title,
    author: text.author,
    level: row.level,
    subspecialty: row.subspecialty
      ? {
          key: row.subspecialty.key,
          nameHe: row.subspecialty.nameHe,
          nameEn: row.subspecialty.nameEn,
        }
      : null,
    durationMinutes: row.durationMinutes,
    cmePoints: row.cmePoints === null ? null : Number(row.cmePoints),
    coverFileId: row.coverFileId,
    // Published and archived items always have their date (a database rule).
    publishedAt: row.publishedAt!.toISOString(),
    accessTier: row.accessTier,
    locale: text.locale as Locale,
    fallback: text.locale !== locale,
  };
}
