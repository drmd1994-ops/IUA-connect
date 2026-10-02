import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@iua/i18n';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { Notifier } from '../notifications';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { AuditService } from '../audit';
import { FilesService, type FileView } from '../files';
import { sanitizeMarkdown } from './markdown';
import {
  type AdminNewsDto,
  type AdminNewsListDto,
  type AdminNewsListQueryDto,
  type NewsHistoryDto,
  type NewsInputDto,
  type NewsTransitionDto,
} from './news.dto';
import { type NewsAction, planTransition } from './news-workflow';
import { slugify, uniqueSlug } from './slug';

type Tx = Prisma.TransactionClient;

const INCLUDE = {
  translations: true,
  attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
  tags: { include: { tag: true } },
  featuredImage: true,
  revision: { select: { id: true } },
} satisfies Prisma.NewsInclude;

type NewsRow = Prisma.NewsGetPayload<{ include: typeof INCLUDE }>;

/**
 * Editing and the review workflow for news (M3 plan §2.3 and §3). Editors (news.create) write
 * drafts and submit them; IUA admins (news.review, news.publish) send back, publish or schedule.
 * Every transition goes into the item's append-only history and the audit log.
 */
@Injectable()
export class NewsAdminService {
  private readonly logger = new Logger(NewsAdminService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
  ) {}

  // --- Reading --------------------------------------------------------------------------------

  async list(query: AdminNewsListQueryDto): Promise<AdminNewsListDto> {
    const where: Prisma.NewsWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        include: { translations: { select: { locale: true, title: true } }, revision: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.news.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        status: row.status,
        titleHe: row.translations.find((t) => t.locale === 'he')?.title ?? null,
        titleEn: row.translations.find((t) => t.locale === 'en')?.title ?? null,
        categoryId: row.categoryId,
        accessTier: row.accessTier,
        revisionOfId: row.revisionOfId,
        revisionId: row.revision?.id ?? null,
        submittedBy: row.submittedBy,
        publishAt: row.publishAt?.toISOString() ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<AdminNewsDto> {
    const row = await this.prisma.news.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    return { ...this.view(row), typeIds: await this.access.allowedTypes('news', id) };
  }

  async history(id: string): Promise<NewsHistoryDto> {
    const rows = await this.prisma.newsHistory.findMany({
      where: { newsId: id },
      orderBy: { at: 'asc' },
    });
    return {
      items: rows.map((row) => ({
        action: row.action,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        actorUserId: row.actorUserId,
        comment: row.comment,
        at: row.at.toISOString(),
      })),
    };
  }

  // --- Writing --------------------------------------------------------------------------------

  async create(input: NewsInputDto, actorUserId: string, meta: RequestMeta): Promise<AdminNewsDto> {
    await this.validateReferences(input);
    const base = input.slug ?? slugify((input.translations.he ?? input.translations.en)!.title);
    const slug = await uniqueSlug(base, async (candidate) =>
      Boolean(await this.prisma.news.findUnique({ where: { slug: candidate } })),
    );
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.news.create({
        data: {
          id,
          slug,
          status: 'DRAFT',
          authorUserId: actorUserId,
          ...this.fields(input),
        },
      });
      await this.replaceParts(tx, id, input);
      await this.addHistory(tx, id, 'create', null, 'DRAFT', actorUserId);
    });
    await this.attachFiles(input);
    await this.record('news.create', id, actorUserId, meta);
    return this.get(id);
  }

  /** Replaces a draft (If-Match must carry its current version). */
  async update(
    id: string,
    input: NewsInputDto,
    ifMatch: string | undefined,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<AdminNewsDto> {
    const row = await this.prisma.news.findUnique({ where: { id } });
    if (!row) throw new AppException('NOT_FOUND');
    const version = parseIfMatch(ifMatch);
    if (version !== row.version) {
      throw new AppException('PRECONDITION_FAILED', [{ code: 'newsChanged' }]);
    }
    if (row.status !== 'DRAFT') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'newsNotEditable' }]);
    }
    await this.validateReferences(input);
    // The URL name can change until the item is first published.
    let slug = row.slug;
    if (row.revisionOfId === null && !row.publishedAt && input.slug && input.slug !== row.slug) {
      if (await this.prisma.news.findUnique({ where: { slug: input.slug } })) {
        throw new AppException('CONFLICT', [{ field: 'slug', code: 'slugTaken' }]);
      }
      slug = input.slug;
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.news.updateMany({
        where: { id, version: row.version, status: 'DRAFT' },
        data: { ...this.fields(input), slug, version: { increment: 1 } },
      });
      if (count === 0) throw new AppException('PRECONDITION_FAILED', [{ code: 'newsChanged' }]);
      await this.replaceParts(tx, id, input);
    });
    await this.attachFiles(input);
    await this.record('news.update', id, actorUserId, meta);
    return this.get(id);
  }

  /** Starts (or returns) the revision of a published item. */
  async createRevision(id: string, actorUserId: string, meta: RequestMeta): Promise<AdminNewsDto> {
    const live = await this.prisma.news.findUnique({ where: { id }, include: INCLUDE });
    if (!live) throw new AppException('NOT_FOUND');
    if (live.revision) return this.get(live.revision.id);
    if (live.revisionOfId || live.status !== 'PUBLISHED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'newsNotRevisable' }]);
    }
    const revisionId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.news.create({
        data: {
          id: revisionId,
          slug: null,
          status: 'DRAFT',
          revisionOfId: id,
          authorUserId: actorUserId,
          categoryId: live.categoryId,
          accessTier: live.accessTier,
          featuredImageFileId: live.featuredImageFileId,
          references: live.references as Prisma.InputJsonValue,
          // The source address stays on the live item only: one source page is one row (M4).
        },
      });
      await this.copyParts(tx, live, revisionId);
      await this.addHistory(tx, id, 'revision.create', 'PUBLISHED', 'PUBLISHED', actorUserId);
    });
    await this.record('news.revision.create', id, actorUserId, meta);
    return this.get(revisionId);
  }

  /** Deletes a draft that was never published (or a revision in progress). */
  async remove(id: string, actorUserId: string, meta: RequestMeta): Promise<void> {
    const row = await this.prisma.news.findUnique({ where: { id } });
    if (!row) throw new AppException('NOT_FOUND');
    if (row.status !== 'DRAFT' || (row.revisionOfId === null && row.publishedAt)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'newsNotDeletable' }]);
    }
    await this.prisma.news.delete({ where: { id } });
    await this.record('news.delete', id, actorUserId, meta);
  }

  // --- Workflow -------------------------------------------------------------------------------

  async transition(
    id: string,
    input: NewsTransitionDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminNewsDto> {
    const row = await this.prisma.news.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    const action = input.action as NewsAction;
    const now = new Date();
    const plan = planTransition(action, {
      status: row.status,
      isRevision: row.revisionOfId !== null,
      submittedBy: row.submittedBy,
      actorUserId: principal.userId,
      permissions: principal.permissions,
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input.publishAt ? { publishAt: new Date(input.publishAt) } : {}),
      now,
    });
    if (!plan.ok) throw new AppException(plan.error, [{ code: plan.code }]);
    if (action === 'SUBMIT') {
      const he = row.translations.find((t) => t.locale === 'he');
      if (!he?.title.trim() || !he.body.trim()) {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'hebrewRequired' }]);
      }
    }

    const historyId = row.revisionOfId ?? id;
    const historyAction = (row.revisionOfId ? 'revision.' : '') + action.toLowerCase();
    await this.prisma.$transaction(async (tx) => {
      if (action === 'PUBLISH' && row.revisionOfId) {
        await this.publishRevision(tx, row);
      } else {
        const data: Prisma.NewsUpdateManyMutationInput = {
          status: plan.to,
          version: { increment: 1 },
        };
        if (action === 'SUBMIT') data.submittedBy = principal.userId;
        if (action === 'SEND_BACK' || action === 'UNSCHEDULE') {
          data.submittedBy = null;
          data.publishAt = null;
        }
        if (action === 'PUBLISH') {
          data.publishedAt = now;
          data.publishAt = null;
        }
        if (action === 'SCHEDULE') data.publishAt = new Date(input.publishAt!);
        if (action === 'ARCHIVE') data.archivedAt = now;
        const { count } = await tx.news.updateMany({
          where: { id, status: row.status },
          data,
        });
        // Someone else moved it first.
        if (count === 0) throw new AppException('CONFLICT', [{ code: 'newsChanged' }]);
      }
      await this.addHistory(
        tx,
        historyId,
        historyAction,
        row.status,
        row.revisionOfId && action === 'PUBLISH' ? 'PUBLISHED' : plan.to,
        principal.userId,
        input.comment,
      );
    });

    await this.audit.record({
      action: 'news.transition',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'news',
      entityId: historyId,
      changes: { action, from: row.status, to: plan.to, revision: row.revisionOfId !== null },
    });
    if (action === 'SEND_BACK') await this.notifyAuthor(row, 'newsSentBack', input.comment ?? '');
    if (action === 'PUBLISH') await this.notifyAuthor(row, 'newsPublished');
    return this.get(row.revisionOfId ?? id);
  }

  /**
   * Publishes every scheduled item that is due (run by the job each minute). Safe to run twice:
   * an item is published once, with its scheduled time as the publication date.
   */
  async publishDue(now = new Date()): Promise<number> {
    const due = await this.prisma.news.findMany({
      where: { status: 'SCHEDULED', publishAt: { lte: now } },
      include: INCLUDE,
    });
    let published = 0;
    for (const row of due) {
      const done = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.news.updateMany({
          where: { id: row.id, status: 'SCHEDULED' },
          data: {
            status: 'PUBLISHED',
            publishedAt: row.publishAt,
            publishAt: null,
            version: { increment: 1 },
          },
        });
        if (count === 0) return false;
        await this.addHistory(tx, row.id, 'publish.scheduled', 'SCHEDULED', 'PUBLISHED', null);
        return true;
      });
      if (!done) continue;
      published += 1;
      await this.audit.record({
        action: 'news.publish.scheduled',
        correlationId: `job-${uuidv7()}`,
        entityType: 'news',
        entityId: row.id,
      });
      await this.notifyAuthor(row, 'newsPublished');
    }
    return published;
  }

  // --- internals ------------------------------------------------------------------------------

  private fields(input: NewsInputDto) {
    return {
      categoryId: input.categoryId ?? null,
      accessTier: input.accessTier,
      featuredImageFileId: input.featuredImageFileId ?? null,
      references: input.references as Prisma.InputJsonValue,
    };
  }

  /** Translations, attachments, tags and tier rules, replaced as a whole. */
  private async replaceParts(tx: Tx, id: string, input: NewsInputDto): Promise<void> {
    await tx.newsTranslation.deleteMany({ where: { newsId: id } });
    for (const [locale, text] of Object.entries(input.translations)) {
      if (!text) continue;
      await tx.newsTranslation.create({
        data: {
          newsId: id,
          locale,
          title: text.title,
          summary: text.summary || null,
          body: sanitizeMarkdown(text.body),
          author: text.author || null,
        },
      });
    }
    await tx.newsAttachment.deleteMany({ where: { newsId: id } });
    await tx.newsAttachment.createMany({
      data: [...new Set(input.attachmentFileIds)].map((fileId, sortOrder) => ({
        newsId: id,
        fileId,
        sortOrder,
      })),
    });
    await tx.newsTag.deleteMany({ where: { newsId: id } });
    for (const name of new Set(input.tags.map((tag) => tag.toLowerCase()))) {
      const tag = await tx.tag.upsert({
        where: { name },
        create: { id: uuidv7(), name },
        update: {},
      });
      await tx.newsTag.create({ data: { newsId: id, tagId: tag.id } });
    }
    await this.access.setRules(tx, 'news', id, input.accessTier, input.typeIds);
  }

  /** Copies translations, attachments, tags and tier rules from one item to another. */
  private async copyParts(tx: Tx, from: NewsRow, toId: string): Promise<void> {
    await tx.newsTranslation.deleteMany({ where: { newsId: toId } });
    await tx.newsTranslation.createMany({
      data: from.translations.map((t) => ({
        newsId: toId,
        locale: t.locale,
        title: t.title,
        summary: t.summary,
        body: t.body,
        author: t.author,
      })),
    });
    await tx.newsAttachment.deleteMany({ where: { newsId: toId } });
    await tx.newsAttachment.createMany({
      data: from.attachments.map((a) => ({
        newsId: toId,
        fileId: a.fileId,
        sortOrder: a.sortOrder,
      })),
    });
    await tx.newsTag.deleteMany({ where: { newsId: toId } });
    await tx.newsTag.createMany({
      data: from.tags.map((t) => ({ newsId: toId, tagId: t.tagId })),
    });
    await this.access.setRules(
      tx,
      'news',
      toId,
      from.accessTier,
      await this.access.allowedTypes('news', from.id),
    );
  }

  /** Copies an approved revision onto its live item and removes the revision. */
  private async publishRevision(tx: Tx, revision: NewsRow): Promise<void> {
    const liveId = revision.revisionOfId!;
    await tx.news.update({
      where: { id: liveId },
      data: {
        categoryId: revision.categoryId,
        accessTier: revision.accessTier,
        featuredImageFileId: revision.featuredImageFileId,
        references: revision.references as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    await this.copyParts(tx, revision, liveId);
    await this.access.setRules(tx, 'news', revision.id, 'PUBLIC', []);
    await tx.news.delete({ where: { id: revision.id } });
  }

  private async validateReferences(input: NewsInputDto): Promise<void> {
    if (input.categoryId) {
      const category = await this.prisma.newsCategory.findFirst({
        where: { id: input.categoryId, active: true },
      });
      if (!category) throw invalid('categoryId', 'unknownCategory');
    }
    if (input.accessTier === 'TYPES') {
      const count = await this.prisma.membershipType.count({
        where: { id: { in: input.typeIds } },
      });
      if (count !== new Set(input.typeIds).size) throw invalid('typeIds', 'unknownMembershipType');
    }
    const fileIds = [
      ...(input.featuredImageFileId ? [input.featuredImageFileId] : []),
      ...input.attachmentFileIds,
    ];
    if (fileIds.length) {
      const found = await this.prisma.storedFile.findMany({
        where: { id: { in: fileIds }, purpose: 'CONTENT' },
        select: { id: true, kind: true },
      });
      const byId = new Map(found.map((file) => [file.id, file]));
      if (input.featuredImageFileId && byId.get(input.featuredImageFileId)?.kind !== 'IMAGE') {
        throw invalid('featuredImageFileId', 'unknownImage');
      }
      if (input.attachmentFileIds.some((fileId) => !byId.has(fileId))) {
        throw invalid('attachmentFileIds', 'unknownFile');
      }
    }
  }

  private async attachFiles(input: NewsInputDto): Promise<void> {
    for (const id of [input.featuredImageFileId, ...input.attachmentFileIds]) {
      if (id) await this.files.markAttached(id);
    }
  }

  private addHistory(
    tx: Tx,
    newsId: string,
    action: string,
    fromStatus: NewsRow['status'] | null,
    toStatus: NewsRow['status'],
    actorUserId: string | null,
    comment?: string,
  ) {
    return tx.newsHistory.create({
      data: {
        id: uuidv7(),
        newsId,
        action,
        fromStatus,
        toStatus,
        actorUserId,
        comment: comment || null,
      },
    });
  }

  private record(action: string, id: string, actorUserId: string, meta: RequestMeta) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId,
      actorIp: meta.ip,
      entityType: 'news',
      entityId: id,
    });
  }

  /** Tells the item's author, in their language. A failed email never undoes the action. */
  private async notifyAuthor(
    row: NewsRow,
    template: 'newsSentBack' | 'newsPublished',
    reason = '',
  ): Promise<void> {
    if (!row.authorUserId) return;
    const author = await this.prisma.user.findUnique({ where: { id: row.authorUserId } });
    if (!author) return;
    const locale: Locale = isLocale(author.locale) ? author.locale : DEFAULT_LOCALE;
    const text =
      row.translations.find((t) => t.locale === locale) ??
      row.translations.find((t) => t.locale === 'he') ??
      row.translations[0];
    const liveId = row.revisionOfId ?? row.id;
    const slug = row.revisionOfId
      ? (await this.prisma.news.findUnique({ where: { id: liveId } }))?.slug
      : row.slug;
    const path =
      template === 'newsSentBack' ? `/${locale}/admin/news/${row.id}` : `/${locale}/news/${slug}`;
    const link = new URL(path, this.env.APP_BASE_URL).toString();
    try {
      if (template === 'newsSentBack') {
        await this.notifier.send({
          userId: author.id,
          kind: 'WORK',
          to: author.email,
          locale,
          template,
          params: { title: text?.title ?? '', reason, link },
        });
      } else {
        await this.notifier.send({
          userId: author.id,
          kind: 'WORK',
          to: author.email,
          locale,
          template,
          params: { title: text?.title ?? '', link },
        });
      }
    } catch (error) {
      this.logger.error({ err: error, newsId: row.id, template }, 'News email failed');
    }
  }

  private view(row: NewsRow): AdminNewsDto {
    const translations: AdminNewsDto['translations'] = {};
    for (const t of row.translations) {
      if (t.locale === 'he' || t.locale === 'en') {
        translations[t.locale] = {
          title: t.title,
          summary: t.summary,
          body: t.body,
          author: t.author,
        };
      }
    }
    return {
      id: row.id,
      slug: row.slug,
      status: row.status,
      categoryId: row.categoryId,
      accessTier: row.accessTier,
      typeIds: [],
      featuredImage: row.featuredImage ? fileView(row.featuredImage) : null,
      attachments: row.attachments.map((a) => fileView(a.file)),
      tags: row.tags.map((t) => t.tag.name),
      references: row.references as AdminNewsDto['references'],
      translations,
      publishAt: row.publishAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      sourceUrl: row.sourceUrl,
      sourcePublishedAt: row.sourcePublishedAt?.toISOString() ?? null,
      revisionOfId: row.revisionOfId,
      revisionId: row.revision?.id ?? null,
      authorUserId: row.authorUserId,
      submittedBy: row.submittedBy,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** `"3"` or `W/"3"` → 3; anything else → null. */
export function parseIfMatch(value: string | undefined): number | null {
  const match = /^(?:W\/)?"(\d+)"$/.exec(value?.trim() ?? '');
  return match ? Number(match[1]) : null;
}

function fileView(file: NewsRow['attachments'][number]['file']): FileView {
  return {
    id: file.id,
    kind: file.kind,
    mimeType: file.mimeType,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    width: file.width,
    height: file.height,
    createdAt: file.createdAt.toISOString(),
  };
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);
