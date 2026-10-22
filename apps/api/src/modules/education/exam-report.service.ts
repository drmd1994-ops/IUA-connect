import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { AuditService } from '../audit';
import { Notifier } from '../notifications';
import {
  type AdminExamReportListDto,
  type AdminExamReportQueryDto,
  type ExamQuestionStatisticsDto,
  type ExamReportCreatedDto,
  type ExamReportDecisionDto,
  type ExamReportInputDto,
  type MyExamReportListDto,
} from './exam-report.dto';
import { STATISTICS_FROM, questionStatistics } from './exam-rules';

type Lang = 'he' | 'en';

function pick<T extends { locale: string }>(rows: T[], locale: Lang): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he') ?? rows[0];
}

/**
 * Reports on questions, and the statistics staff see (M23 plan §2, §3). A signed-in reader says
 * what is wrong with a published question; the report waits in the reviewers' queue, and the
 * reader is told when it is dealt with. The question stays published unless a reviewer takes it
 * down. Reviewers never see who sent a report.
 */
@Injectable()
export class ExamReportService {
  private readonly logger = new Logger(ExamReportService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
  ) {}

  /** One open report per person and question; a second waits for the first to be dealt with. */
  async report(
    principal: Principal,
    questionId: string,
    input: ExamReportInputDto,
  ): Promise<ExamReportCreatedDto> {
    const question = await this.prisma.examQuestion.findFirst({
      where: { id: questionId, status: 'PUBLISHED' },
    });
    const viewer = await this.access.viewerOf(principal);
    if (!question || !(await this.access.canSeeItem('exam_question', question, viewer))) {
      throw new AppException('NOT_FOUND');
    }
    const open = await this.prisma.examReport.count({
      where: { questionId, userId: principal.userId, status: 'OPEN' },
    });
    if (open > 0) throw new AppException('CONFLICT', [{ code: 'examReportOpen' }]);
    const id = uuidv7();
    await this.prisma.examReport.create({
      data: { id, questionId, userId: principal.userId, reason: input.reason, text: input.text },
    });
    return { id };
  }

  async mine(principal: Principal, locale: Lang): Promise<MyExamReportListDto> {
    const rows = await this.prisma.examReport.findMany({
      where: { userId: principal.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { question: { include: { translations: true } } },
      take: 100,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        questionId: row.questionId,
        stem: pick(row.question.translations, locale)?.stem ?? '',
        reason: row.reason,
        text: row.text,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        handledAt: row.handledAt?.toISOString() ?? null,
        response: row.response,
      })),
    };
  }

  /** The reviewers' queue, the oldest first. */
  async list(query: AdminExamReportQueryDto): Promise<AdminExamReportListDto> {
    const where = { status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.examReport.findMany({
        where,
        orderBy: [{ createdAt: query.status === 'OPEN' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { question: { include: { translations: true } } },
      }),
      this.prisma.examReport.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        questionId: row.questionId,
        stemHe: row.question.translations.find((t) => t.locale === 'he')?.stem ?? null,
        stemEn: row.question.translations.find((t) => t.locale === 'en')?.stem ?? null,
        questionStatus: row.question.status,
        reason: row.reason,
        text: row.text,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        handledAt: row.handledAt?.toISOString() ?? null,
        response: row.response,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Deals with a report once, and tells the reader. */
  async decide(
    id: string,
    input: ExamReportDecisionDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<void> {
    const now = new Date();
    const { count } = await this.prisma.examReport.updateMany({
      where: { id, status: 'OPEN' },
      data: {
        status: input.outcome,
        handledAt: now,
        handledBy: principal.userId,
        response: input.response,
      },
    });
    if (count === 0) {
      const exists = await this.prisma.examReport.count({ where: { id } });
      throw exists
        ? new AppException('CONFLICT', [{ code: 'examReportHandled' }])
        : new AppException('NOT_FOUND');
    }
    await this.audit.record({
      action: 'exam_report.decide',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'exam_report',
      entityId: id,
      changes: { outcome: input.outcome },
    });
    await this.tellReader(id, input.response);
  }

  async statistics(questionId: string): Promise<ExamQuestionStatisticsDto> {
    const question = await this.prisma.examQuestion.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { position: 'asc' }, select: { position: true } } },
    });
    if (!question) throw new AppException('NOT_FOUND');
    const [answers, openReports] = await Promise.all([
      this.prisma.examAnswer.findMany({
        where: { questionId, counts: true },
        select: { position: true, correct: true },
      }),
      this.prisma.examReport.count({ where: { questionId, status: 'OPEN' } }),
    ]);
    return {
      ...questionStatistics(
        answers,
        question.options.map((option) => option.position),
      ),
      shownFrom: STATISTICS_FROM,
      openReports,
    };
  }

  /** In the reader's language. A failed notice never undoes the decision. */
  private async tellReader(id: string, response: string): Promise<void> {
    try {
      const row = await this.prisma.examReport.findUnique({
        where: { id },
        include: { user: true, question: { include: { translations: true } } },
      });
      if (!row) return;
      const locale: Locale = isLocale(row.user.locale) ? row.user.locale : DEFAULT_LOCALE;
      const title = (pick(row.question.translations, locale)?.stem ?? '').slice(0, 80);
      const link = new URL(`/${locale}/account/exam-results`, this.env.APP_BASE_URL).toString();
      await this.notifier.send({
        userId: row.userId,
        kind: 'ACCOUNT',
        to: row.user.email,
        locale,
        template: 'examReportHandled',
        params: { title, reason: response, link },
      });
    } catch (error) {
      this.logger.warn({ err: error, reportId: id }, 'Exam report notice failed');
    }
  }
}
