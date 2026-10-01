import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@iua/i18n';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { Mailer } from '../../infra/mailer/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { AuditService } from '../audit';
import { FilesService } from '../files';
import { parseIfMatch, sanitizeMarkdown, slugify, uniqueSlug } from '../news';
import {
  type AdminEducationDto,
  type AdminEducationListDto,
  type AdminEducationListQueryDto,
  type EducationHistoryDto,
  type EducationInputDto,
  type EducationTransitionDto,
} from './education.dto';
import {
  type EducationAction,
  LINKED_TYPES,
  canEdit,
  planTransition,
  submitProblem,
} from './education-workflow';

const INCLUDE = {
  translations: true,
  cover: true,
  files: { orderBy: { sortOrder: 'asc' }, include: { file: true } },
  lessons: { orderBy: { position: 'asc' }, select: { itemId: true } },
} satisfies Prisma.EducationItemInclude;
type Row = Prisma.EducationItemGetPayload<{ include: typeof INCLUDE }>;
type Tx = Prisma.TransactionClient;
type Lang = 'he' | 'en';
/** /education/exam is the exam practice page, so no item may take that URL name. */
const RESERVED_SLUG = 'exam';

/**
 * Education items in the admin area (M6 plan §2, §3): writing, the review workflow and courses.
 * Editors change drafts; a reviewer may correct an item in review before approving it; published
 * items are taken down to be edited. Saves carry the version they were loaded with (If-Match).
 */
@Injectable()
export class EducationAdminService {
  private readonly logger = new Logger(EducationAdminService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
  ) {}

  async list(query: AdminEducationListQueryDto): Promise<AdminEducationListDto> {
    const where: Prisma.EducationItemWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.q
        ? { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.educationItem.findMany({
        where,
        include: { translations: { select: { locale: true, title: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.educationItem.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        type: row.type,
        status: row.status,
        titleHe: row.translations.find((t) => t.locale === 'he')?.title ?? null,
        titleEn: row.translations.find((t) => t.locale === 'en')?.title ?? null,
        accessTier: row.accessTier,
        submittedBy: row.submittedBy,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<AdminEducationDto> {
    const row = await this.row(id);
    return { ...view(row), typeIds: await this.access.allowedTypes('education', id) };
  }

  async history(id: string): Promise<EducationHistoryDto> {
    await this.row(id);
    const rows = await this.prisma.educationHistory.findMany({
      where: { itemId: id },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
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

  async create(
    input: EducationInputDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminEducationDto> {
    await this.validate(input);
    const made = input.slug ?? slugify((input.translations.he ?? input.translations.en)!.title);
    // "exam" is the address of the exam practice page.
    const base = made === RESERVED_SLUG ? `${made}-item` : made;
    const slug = await uniqueSlug(base, async (candidate) =>
      Boolean(await this.prisma.educationItem.findUnique({ where: { slug: candidate } })),
    );
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.educationItem.create({
        data: {
          id,
          slug,
          type: input.type,
          status: 'DRAFT',
          authorUserId: principal.userId,
          ...columns(input),
        },
      });
      await this.replaceParts(tx, id, input);
      await this.addHistory(tx, id, 'create', null, 'DRAFT', principal.userId);
    });
    await this.attach(input);
    await this.record('education.create', id, principal.userId, meta);
    return this.get(id);
  }

  /** Replaces the item (If-Match must carry its current version). The type can't change. */
  async update(
    id: string,
    input: EducationInputDto,
    ifMatch: string | undefined,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminEducationDto> {
    const row = await this.row(id);
    if (parseIfMatch(ifMatch) !== row.version) {
      throw new AppException('PRECONDITION_FAILED', [{ code: 'educationChanged' }]);
    }
    if (!canEdit(row.status, principal.permissions)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'educationNotEditable' }]);
    }
    if (input.type !== row.type) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'type', code: 'educationTypeFixed' }]);
    }
    await this.validate(input);
    // The URL name can change until the item is first published.
    let slug = row.slug;
    if (!row.publishedAt && input.slug && input.slug !== row.slug) {
      if (await this.prisma.educationItem.findUnique({ where: { slug: input.slug } })) {
        throw new AppException('CONFLICT', [{ field: 'slug', code: 'slugTaken' }]);
      }
      slug = input.slug;
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.educationItem.updateMany({
        where: { id, version: row.version, status: row.status },
        data: { ...columns(input), slug, version: { increment: 1 } },
      });
      if (count === 0) {
        throw new AppException('PRECONDITION_FAILED', [{ code: 'educationChanged' }]);
      }
      await this.replaceParts(tx, id, input);
      if (row.status === 'IN_REVIEW') {
        // A reviewer corrected it: kept in the item's history.
        await this.addHistory(tx, id, 'correct', 'IN_REVIEW', 'IN_REVIEW', principal.userId);
      }
    });
    await this.attach(input);
    await this.record('education.update', id, principal.userId, meta);
    return this.get(id);
  }

  /** Only a draft that was never published is deleted; anything else is archived. */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const row = await this.row(id);
    if (row.status !== 'DRAFT' || row.publishedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'educationNotDeletable' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.access.setRules(tx, 'education', id, 'PUBLIC', []);
      await tx.educationItem.delete({ where: { id } });
    });
    await this.record('education.delete', id, principal.userId, meta);
  }

  /** Sets the lessons of a course, in order. Editable like the rest of the item. */
  async setLessons(
    id: string,
    lessonIds: readonly string[],
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminEducationDto> {
    const row = await this.row(id);
    if (row.type !== 'COURSE') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'educationNotACourse' }]);
    }
    if (!canEdit(row.status, principal.permissions)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'educationNotEditable' }]);
    }
    const wanted = [...new Set(lessonIds)];
    const found = await this.prisma.educationItem.findMany({
      where: { id: { in: wanted } },
      select: { id: true, type: true },
    });
    if (found.length !== wanted.length) throw invalid('lessonIds', 'unknownLesson');
    if (found.some((item) => item.type === 'COURSE')) throw invalid('lessonIds', 'courseAsLesson');
    await this.prisma.$transaction(async (tx) => {
      await tx.courseItem.deleteMany({ where: { courseId: id } });
      await tx.courseItem.createMany({
        data: wanted.map((itemId, index) => ({ courseId: id, itemId, position: index + 1 })),
      });
      await tx.educationItem.update({ where: { id }, data: { version: { increment: 1 } } });
    });
    await this.record('education.lessons', id, principal.userId, meta);
    return this.get(id);
  }

  async transition(
    id: string,
    input: EducationTransitionDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminEducationDto> {
    const row = await this.row(id);
    const action = input.action as EducationAction;
    const plan = planTransition(action, {
      status: row.status,
      submittedBy: row.submittedBy,
      actorUserId: principal.userId,
      permissions: principal.permissions,
      comment: input.comment,
    });
    if (!plan.ok) throw new AppException(plan.error, [{ code: plan.code }]);
    if (action === 'SUBMIT') {
      const he = row.translations.find((t) => t.locale === 'he');
      const problem = submitProblem({
        type: row.type,
        hebrewTitle: Boolean(he),
        hebrewText: Boolean(he?.description.trim()),
        hasLink: Boolean(row.externalUrl),
        videoPending: row.videoStatus === 'PENDING_PROVIDER',
        fileCount: row.files.length,
        lessonCount: row.lessons.length,
      });
      if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.educationItem.updateMany({
        where: { id, status: row.status, version: row.version },
        data: {
          status: plan.to,
          version: { increment: 1 },
          ...(action === 'SUBMIT' ? { submittedBy: principal.userId } : {}),
          // The first publication date is kept when an item is taken down and published again.
          ...(action === 'PUBLISH'
            ? { publishedAt: row.publishedAt ?? now, archivedAt: null }
            : {}),
          ...(action === 'ARCHIVE' ? { archivedAt: now } : {}),
        },
      });
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'educationChanged' }]);
      await this.addHistory(tx, id, action, row.status, plan.to, principal.userId, input.comment);
    });
    await this.audit.record({
      action: 'education.transition',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'education',
      entityId: id,
      changes: { action, from: row.status, to: plan.to },
    });
    if (action === 'SEND_BACK') await this.notifyAuthor(row, 'educationSentBack', input.comment);
    if (action === 'PUBLISH') await this.notifyAuthor(row, 'educationPublished');
    return this.get(id);
  }

  // --- Internals ------------------------------------------------------------------------------

  private async row(id: string): Promise<Row> {
    const row = await this.prisma.educationItem.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  private async validate(input: EducationInputDto): Promise<void> {
    if (input.slug === RESERVED_SLUG) throw invalid('slug', 'slugTaken');
    if (input.subspecialtyId) {
      const found = await this.prisma.subspecialty.findFirst({
        where: { id: input.subspecialtyId, active: true },
        select: { id: true },
      });
      if (!found) throw invalid('subspecialtyId', 'unknownSubspecialty');
    }
    if (input.accessTier === 'TYPES') {
      const count = await this.prisma.membershipType.count({
        where: { id: { in: input.typeIds } },
      });
      if (count !== new Set(input.typeIds).size) throw invalid('typeIds', 'unknownMembershipType');
    }
    const fileIds = [...(input.coverFileId ? [input.coverFileId] : []), ...input.fileIds];
    if (fileIds.length) {
      const found = await this.prisma.storedFile.findMany({
        where: { id: { in: fileIds }, purpose: 'CONTENT' },
        select: { id: true, kind: true },
      });
      const byId = new Map(found.map((file) => [file.id, file]));
      if (input.coverFileId && byId.get(input.coverFileId)?.kind !== 'IMAGE') {
        throw invalid('coverFileId', 'unknownImage');
      }
      if (input.fileIds.some((fileId) => !byId.has(fileId)))
        throw invalid('fileIds', 'unknownFile');
    }
  }

  /** Translations, files and tier rules, replaced as a whole. */
  private async replaceParts(tx: Tx, id: string, input: EducationInputDto): Promise<void> {
    await tx.educationTranslation.deleteMany({ where: { itemId: id } });
    await tx.educationTranslation.createMany({
      data: (['he', 'en'] as const).flatMap((locale) => {
        const text = input.translations[locale];
        return text
          ? [
              {
                itemId: id,
                locale,
                title: text.title,
                description: sanitizeMarkdown(text.description),
                author: text.author || null,
              },
            ]
          : [];
      }),
    });
    await tx.educationFile.deleteMany({ where: { itemId: id } });
    await tx.educationFile.createMany({
      data: [...new Set(input.fileIds)].map((fileId, sortOrder) => ({
        itemId: id,
        fileId,
        sortOrder,
      })),
    });
    await this.access.setRules(tx, 'education', id, input.accessTier, input.typeIds);
  }

  private async attach(input: EducationInputDto): Promise<void> {
    for (const id of [input.coverFileId, ...input.fileIds]) {
      if (id) await this.files.markAttached(id);
    }
  }

  private addHistory(
    tx: Tx,
    itemId: string,
    action: string,
    fromStatus: Row['status'] | null,
    toStatus: Row['status'],
    actorUserId: string | null,
    comment?: string,
  ) {
    return tx.educationHistory.create({
      data: {
        id: uuidv7(),
        itemId,
        action,
        fromStatus,
        toStatus,
        actorUserId,
        comment: comment?.trim() || null,
      },
    });
  }

  private record(action: string, id: string, actorUserId: string, meta: RequestMeta) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId,
      actorIp: meta.ip,
      entityType: 'education',
      entityId: id,
    });
  }

  /** Tells the item's author, in their language. A failed email never undoes the action. */
  private async notifyAuthor(
    row: Row,
    template: 'educationSentBack' | 'educationPublished',
    reason = '',
  ): Promise<void> {
    if (!row.authorUserId) return;
    try {
      const author = await this.prisma.user.findUnique({ where: { id: row.authorUserId } });
      if (!author) return;
      const locale: Locale = isLocale(author.locale) ? author.locale : DEFAULT_LOCALE;
      const text =
        row.translations.find((t) => t.locale === locale) ??
        row.translations.find((t) => t.locale === 'he') ??
        row.translations[0];
      const path =
        template === 'educationSentBack'
          ? `/${locale}/admin/education/${row.id}`
          : `/${locale}/education/${row.slug}`;
      const link = new URL(path, this.env.APP_BASE_URL).toString();
      const title = text?.title ?? '';
      if (template === 'educationSentBack') {
        await this.mailer.send({
          to: author.email,
          locale,
          template,
          params: { title, reason, link },
        });
      } else {
        await this.mailer.send({ to: author.email, locale, template, params: { title, link } });
      }
    } catch (error) {
      this.logger.warn({ err: error, template, itemId: row.id }, 'Education email failed');
    }
  }
}

function columns(input: EducationInputDto) {
  // Only link-delivered types carry a link or wait for one.
  const linked = LINKED_TYPES.includes(input.type);
  const externalUrl = linked ? (input.externalUrl ?? null) : null;
  return {
    level: input.level ?? null,
    subspecialtyId: input.subspecialtyId ?? null,
    durationMinutes: input.durationMinutes ?? null,
    cmePoints: input.cmePoints ?? null,
    externalUrl,
    videoStatus: externalUrl
      ? ('EXTERNAL' as const)
      : linked && input.videoPending
        ? ('PENDING_PROVIDER' as const)
        : ('NONE' as const),
    accessTier: input.accessTier,
    coverFileId: input.coverFileId ?? null,
    references: input.references as Prisma.InputJsonValue,
  };
}

function fileView(file: Row['files'][number]['file']) {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  };
}

function view(row: Row): Omit<AdminEducationDto, 'typeIds'> {
  const text = (locale: Lang) => {
    const t = row.translations.find((item) => item.locale === locale);
    return t ? { title: t.title, description: t.description, author: t.author } : undefined;
  };
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    status: row.status,
    level: row.level,
    subspecialtyId: row.subspecialtyId,
    durationMinutes: row.durationMinutes,
    cmePoints: row.cmePoints === null ? null : Number(row.cmePoints),
    externalUrl: row.externalUrl,
    videoStatus: row.videoStatus,
    accessTier: row.accessTier,
    cover: row.cover ? fileView(row.cover) : null,
    files: row.files.map(({ file }) => fileView(file)),
    references: row.references as AdminEducationDto['references'],
    translations: { he: text('he'), en: text('en') },
    lessonIds: row.lessons.map((lesson) => lesson.itemId),
    authorUserId: row.authorUserId,
    submittedBy: row.submittedBy,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);
