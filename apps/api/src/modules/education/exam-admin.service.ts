import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
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
import { parseIfMatch } from '../news';
import { type EducationHistoryDto, type EducationTransitionDto } from './education.dto';
import { type EducationAction, canEdit, planTransition } from './education-workflow';
import {
  type AdminExamQuestionDto,
  type AdminExamQuestionListDto,
  type AdminExamQuestionListQueryDto,
  type ExamImportResultDto,
  type ExamQuestionInputDto,
} from './exam.dto';
import { readImport } from './exam-import';
import { questionProblem, referencesOf, reviewerView } from './exam-rules';

const INCLUDE = {
  translations: true,
  options: { orderBy: { position: 'asc' }, include: { translations: true } },
} satisfies Prisma.ExamQuestionInclude;
type Row = Prisma.ExamQuestionGetPayload<{ include: typeof INCLUDE }>;
type Tx = Prisma.TransactionClient;
type Lang = 'he' | 'en';
const LANGS: Lang[] = ['he', 'en'];

/**
 * Exam questions in the admin area (M6 plan §2.10): written by editors, reviewed and published
 * by an admin, with the same workflow and four-eyes rule as education items. A reviewer may
 * correct a question in review before approving it.
 */
@Injectable()
export class ExamAdminService {
  private readonly logger = new Logger(ExamAdminService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
  ) {}

  async list(query: AdminExamQuestionListQueryDto): Promise<AdminExamQuestionListDto> {
    const where: Prisma.ExamQuestionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { translations: { some: { stem: { contains: query.q, mode: 'insensitive' } } } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.examQuestion.findMany({
        where,
        include: { translations: { select: { locale: true, stem: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.examQuestion.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        stemHe: row.translations.find((t) => t.locale === 'he')?.stem ?? null,
        stemEn: row.translations.find((t) => t.locale === 'en')?.stem ?? null,
        accessTier: row.accessTier,
        submittedBy: row.submittedBy,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<AdminExamQuestionDto> {
    const row = await this.row(id);
    return { ...view(row), typeIds: await this.access.allowedTypes('exam_question', id) };
  }

  async history(id: string): Promise<EducationHistoryDto> {
    await this.row(id);
    const rows = await this.prisma.examQuestionHistory.findMany({
      where: { questionId: id },
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
    input: ExamQuestionInputDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminExamQuestionDto> {
    await this.validate(input);
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.examQuestion.create({
        data: { id, status: 'DRAFT', authorUserId: principal.userId, ...columns(input) },
      });
      await this.replaceParts(tx, id, input);
      await this.addHistory(tx, id, 'create', null, 'DRAFT', principal.userId);
    });
    await this.record('exam_question.create', id, principal.userId, meta);
    return this.get(id);
  }

  /** Replaces the question (If-Match must carry its current version). */
  async update(
    id: string,
    input: ExamQuestionInputDto,
    ifMatch: string | undefined,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminExamQuestionDto> {
    const row = await this.row(id);
    if (parseIfMatch(ifMatch) !== row.version) {
      throw new AppException('PRECONDITION_FAILED', [{ code: 'educationChanged' }]);
    }
    if (!canEdit(row.status, principal.permissions)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'educationNotEditable' }]);
    }
    await this.validate(input);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.examQuestion.updateMany({
        where: { id, version: row.version, status: row.status },
        data: { ...columns(input), version: { increment: 1 } },
      });
      if (count === 0) {
        throw new AppException('PRECONDITION_FAILED', [{ code: 'educationChanged' }]);
      }
      await this.replaceParts(tx, id, input);
      if (row.status === 'IN_REVIEW') {
        // A reviewer corrected it: kept in the question's history.
        await this.addHistory(tx, id, 'correct', 'IN_REVIEW', 'IN_REVIEW', principal.userId);
      }
    });
    await this.record('exam_question.update', id, principal.userId, meta);
    return this.get(id);
  }

  /** Only a draft that was never published is deleted; anything else is archived. */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const row = await this.row(id);
    if (row.status !== 'DRAFT' || row.publishedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'educationNotDeletable' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.access.setRules(tx, 'exam_question', id, 'PUBLIC', []);
      await tx.examQuestion.delete({ where: { id } });
    });
    await this.record('exam_question.delete', id, principal.userId, meta);
  }

  async transition(
    id: string,
    input: EducationTransitionDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminExamQuestionDto> {
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
    // Checked when submitted and again when published: a reviewer may have changed it since.
    if (action === 'SUBMIT' || action === 'PUBLISH') {
      const problem = questionProblem(draftOf(row));
      if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    }
    const now = new Date();
    const reviewer = action === 'PUBLISH' ? await this.reviewerOf(principal.userId, now) : {};
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.examQuestion.updateMany({
        where: { id, status: row.status, version: row.version },
        data: {
          status: plan.to,
          version: { increment: 1 },
          ...(action === 'SUBMIT' ? { submittedBy: principal.userId } : {}),
          ...(action === 'PUBLISH'
            ? { publishedAt: row.publishedAt ?? now, archivedAt: null, ...reviewer }
            : {}),
          ...(action === 'ARCHIVE' ? { archivedAt: now } : {}),
        },
      });
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'educationChanged' }]);
      await this.addHistory(tx, id, action, row.status, plan.to, principal.userId, input.comment);
    });
    await this.audit.record({
      action: 'exam_question.transition',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'exam_question',
      entityId: id,
      changes: { action, from: row.status, to: plan.to },
    });
    if (action === 'SEND_BACK') await this.notifyAuthor(row, 'educationSentBack', input.comment);
    if (action === 'PUBLISH') await this.notifyAuthor(row, 'educationPublished');
    return this.get(id);
  }

  /**
   * Makes a draft of every question in the spreadsheet (M23 plan §2), or none: a file with any
   * bad row is refused whole. Imported questions are public, like any new question, and go
   * through the same review; nothing is published here.
   */
  async import(csv: string, principal: Principal, meta: RequestMeta): Promise<ExamImportResultDto> {
    const subspecialties = await this.prisma.subspecialty.findMany({
      where: { active: true },
      select: { id: true, key: true },
    });
    const idOf = new Map(subspecialties.map((row) => [row.key, row.id]));
    const result = readImport(csv, new Set(idOf.keys()));
    if (!result.ok) return { imported: 0, problems: result.problems };
    const ids: string[] = [];
    await this.prisma.$transaction(
      async (tx) => {
        for (const question of result.questions) {
          const id = uuidv7();
          ids.push(id);
          const input: ExamQuestionInputDto = {
            level: question.level,
            difficulty: question.difficulty,
            references: question.references,
            source: question.source,
            subspecialtyId: question.topic ? idOf.get(question.topic)! : null,
            accessTier: 'PUBLIC',
            typeIds: [],
            translations: question.translations,
            options: question.options,
          };
          await tx.examQuestion.create({
            data: { id, status: 'DRAFT', authorUserId: principal.userId, ...columns(input) },
          });
          await this.replaceParts(tx, id, input);
          await this.addHistory(tx, id, 'import', null, 'DRAFT', principal.userId);
        }
      },
      { timeout: 60_000 },
    );
    await this.audit.record({
      action: 'exam_question.import',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'exam_question',
      entityId: ids[0]!,
      changes: { count: ids.length },
    });
    return { imported: ids.length, problems: [] };
  }

  // --- Internals ------------------------------------------------------------------------------

  /** The publisher's name as it reads now, kept on the question. */
  private async reviewerOf(userId: string, at: Date) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const plain = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || null;
    return {
      reviewedBy: userId,
      reviewerNameHe: profile?.nameHe || plain,
      reviewerNameEn: profile?.nameEn || plain,
      reviewedAt: at,
    };
  }

  private async row(id: string): Promise<Row> {
    const row = await this.prisma.examQuestion.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  private async validate(input: ExamQuestionInputDto): Promise<void> {
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
  }

  /** Text, options and tier rules, replaced as a whole. Stored answers keep their positions. */
  private async replaceParts(tx: Tx, id: string, input: ExamQuestionInputDto): Promise<void> {
    await tx.examQuestionTranslation.deleteMany({ where: { questionId: id } });
    await tx.examQuestionTranslation.createMany({
      data: LANGS.flatMap((locale) => {
        const text = input.translations[locale];
        return text ? [{ questionId: id, locale, stem: text.stem, summary: text.summary }] : [];
      }),
    });
    await tx.examOption.deleteMany({ where: { questionId: id } });
    for (const [index, option] of input.options.entries()) {
      await tx.examOption.create({
        data: {
          id: uuidv7(),
          questionId: id,
          position: index + 1,
          isCorrect: option.correct,
          translations: {
            create: LANGS.flatMap((locale) => {
              const text = option.translations[locale];
              return text ? [{ locale, text: text.text, explanation: text.explanation }] : [];
            }),
          },
        },
      });
    }
    await this.access.setRules(tx, 'exam_question', id, input.accessTier, input.typeIds);
  }

  private addHistory(
    tx: Tx,
    questionId: string,
    action: string,
    fromStatus: Row['status'] | null,
    toStatus: Row['status'],
    actorUserId: string | null,
    comment?: string,
  ) {
    return tx.examQuestionHistory.create({
      data: {
        id: uuidv7(),
        questionId,
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
      entityType: 'exam_question',
      entityId: id,
    });
  }

  /** Tells the question's author, in their language. A failed email never undoes the action. */
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
      // The start of the question stands in for a title.
      const title = (text?.stem ?? '').slice(0, 80);
      const path =
        template === 'educationSentBack'
          ? `/${locale}/admin/education/questions/${row.id}`
          : `/${locale}/education/exam`;
      const link = new URL(path, this.env.APP_BASE_URL).toString();
      if (template === 'educationSentBack') {
        await this.notifier.send({
          userId: author.id,
          kind: 'WORK',
          to: author.email,
          locale,
          template,
          params: { title, reason, link },
        });
      } else {
        await this.notifier.send({
          userId: author.id,
          kind: 'WORK',
          to: author.email,
          locale,
          template,
          params: { title, link },
        });
      }
    } catch (error) {
      this.logger.warn({ err: error, template, questionId: row.id }, 'Exam question email failed');
    }
  }
}

function columns(input: ExamQuestionInputDto) {
  return {
    level: input.level ?? null,
    difficulty: input.difficulty ?? null,
    references: input.references,
    source: input.source?.trim() || null,
    subspecialtyId: input.subspecialtyId ?? null,
    accessTier: input.accessTier,
  };
}

/** The question as the readiness check sees it. */
function draftOf(row: Row) {
  const he = row.translations.find((t) => t.locale === 'he');
  return {
    hebrewStem: Boolean(he?.stem.trim()),
    hebrewSummary: Boolean(he?.summary.trim()),
    options: row.options.map((option) => {
      const text = option.translations.find((t) => t.locale === 'he');
      return {
        correct: option.isCorrect,
        hebrewText: Boolean(text?.text.trim()),
        hebrewExplanation: Boolean(text?.explanation.trim()),
      };
    }),
  };
}

function view(row: Row): Omit<AdminExamQuestionDto, 'typeIds'> {
  const text = (locale: Lang) => {
    const t = row.translations.find((item) => item.locale === locale);
    return t ? { stem: t.stem, summary: t.summary } : undefined;
  };
  return {
    id: row.id,
    status: row.status,
    level: row.level,
    difficulty: row.difficulty,
    references: referencesOf(row.references),
    source: row.source,
    reviewer: reviewerView(row),
    subspecialtyId: row.subspecialtyId,
    accessTier: row.accessTier,
    translations: { he: text('he'), en: text('en') },
    options: row.options.map((option) => {
      const optionText = (locale: Lang) => {
        const t = option.translations.find((item) => item.locale === locale);
        return t ? { text: t.text, explanation: t.explanation } : undefined;
      };
      return {
        position: option.position,
        correct: option.isCorrect,
        translations: { he: optionText('he'), en: optionText('en') },
      };
    }),
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
