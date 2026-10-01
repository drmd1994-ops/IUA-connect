import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { FilesService } from '../files';
import {
  type PublicNewsDto,
  type PublicNewsListDto,
  type PublicNewsQueryDto,
} from './news-public.dto';

const INCLUDE = {
  translations: true,
  category: true,
  tags: { include: { tag: true } },
  attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.NewsInclude;

type Row = Prisma.NewsGetPayload<{ include: typeof INCLUDE }>;
type Locale = 'he' | 'en';

/** Live items readers can reach: published, or archived (by direct link only). */
const LIVE = { revisionOfId: null };

/**
 * Public news (M3 plan §2.3, §2.5): published items the reader may see under the access tiers,
 * in their language with a Hebrew fallback (ADR 0005). Archived items are left out of lists but
 * still open by link, marked as archived. Hidden items answer 404, like missing ones.
 */
@Injectable()
export class NewsPublicService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
  ) {}

  /** Images and attachments of an article are readable by whoever may read the article. */
  onModuleInit(): void {
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const items = await this.prisma.news.findMany({
          where: {
            ...LIVE,
            status: { in: ['PUBLISHED', 'ARCHIVED'] },
            OR: [{ featuredImageFileId: fileId }, { attachments: { some: { fileId } } }],
          },
          select: { id: true, accessTier: true },
        });
        if (items.length === 0) return null;
        const viewer = await this.access.viewerOf(principal);
        for (const item of items) {
          if (await this.access.canSeeItem('news', item, viewer)) return true;
        }
        return false;
      },
    });
  }

  async list(principal: Principal | null, query: PublicNewsQueryDto): Promise<PublicNewsListDto> {
    const viewer = await this.access.viewerOf(principal);
    const where: Prisma.NewsWhereInput = {
      ...LIVE,
      status: 'PUBLISHED',
      AND: [await this.access.visibleWhere('news', viewer)],
      ...(query.category ? { category: { key: query.category } } : {}),
      ...(query.tag ? { tags: { some: { tag: { name: query.tag } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.news.count({ where }),
    ]);
    return {
      items: rows.map((row) => summary(row, query.locale)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(principal: Principal | null, slug: string, locale: Locale): Promise<PublicNewsDto> {
    const row = await this.prisma.news.findFirst({
      where: { ...LIVE, slug, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      include: INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    const viewer = await this.access.viewerOf(principal);
    if (!(await this.access.canSeeItem('news', row, viewer))) throw new AppException('NOT_FOUND');
    const text = pick(row, locale);
    return {
      ...summary(row, locale),
      body: text.translation.body,
      author: text.translation.author,
      archived: row.status === 'ARCHIVED',
      attachments: row.attachments.map(({ file }) => ({
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      })),
      references: row.references as PublicNewsDto['references'],
    };
  }
}

/** The requested language, else Hebrew, else whatever exists. */
function pick(row: Row, locale: Locale) {
  const wanted = row.translations.find((t) => t.locale === locale);
  if (wanted) return { translation: wanted, locale, fallback: false };
  const fallback = row.translations.find((t) => t.locale === 'he') ?? row.translations[0]!;
  return { translation: fallback, locale: fallback.locale as Locale, fallback: true };
}

function summary(row: Row, locale: Locale) {
  const text = pick(row, locale);
  return {
    slug: row.slug!,
    title: text.translation.title,
    summary: text.translation.summary,
    category: row.category
      ? { key: row.category.key, nameHe: row.category.nameHe, nameEn: row.category.nameEn }
      : null,
    tags: row.tags.map((t) => t.tag.name),
    date: (row.sourcePublishedAt ?? row.publishedAt)!.toISOString(),
    featuredImageFileId: row.featuredImageFileId,
    accessTier: row.accessTier,
    sourceUrl: row.sourceUrl,
    locale: text.locale,
    fallback: text.fallback,
  };
}
