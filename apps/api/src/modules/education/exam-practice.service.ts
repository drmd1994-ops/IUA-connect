import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import {
  type AnswerResultDto,
  type ExamBookmarkListDto,
  type ExamResultsDto,
  type NextQuestionDto,
  type NextQuestionQueryDto,
} from './exam.dto';
import { RIGHT_RECENTLY_DAYS, referencesOf, reviewerView, score, wrongNow } from './exam-rules';

const INCLUDE = {
  translations: true,
  subspecialty: true,
  options: { orderBy: { position: 'asc' }, include: { translations: true } },
} satisfies Prisma.ExamQuestionInclude;
type Row = Prisma.ExamQuestionGetPayload<{ include: typeof INCLUDE }>;
type Locale = 'he' | 'en';

/** The requested language, else Hebrew, else whatever exists. */
function pick<T extends { locale: string }>(rows: T[], locale: Locale): T {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he') ?? rows[0]!;
}

/**
 * Practising exam questions (M6 plan §2.10, owner answers §11.4–8).
 *
 * - A question is asked **without** its answer: the right option, the explanations and the topic
 *   summary leave the server only in the reply to an answer.
 * - Published questions the reader may see under the access tiers; anyone else gets 404.
 * - A signed-in person's answers are stored, and only they can read them. The first answer to a
 *   question counts for the score. A visitor's answers are not stored.
 */
@Injectable()
export class ExamPracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * A random question the reader hasn't seen in this visit, for the chosen filters and set
   * (M23 plan §2). A signed-in person's practice leaves out what they answered right in the
   * last 30 days.
   */
  async next(principal: Principal | null, query: NextQuestionQueryDto): Promise<NextQuestionDto> {
    if (query.set !== 'all' && !principal) throw new AppException('UNAUTHENTICATED');
    const viewer = await this.access.viewerOf(principal);
    const base: Prisma.ExamQuestionWhereInput = {
      status: 'PUBLISHED',
      AND: [await this.access.visibleWhere('exam_question', viewer)],
      ...(query.exclude.length ? { id: { notIn: query.exclude } } : {}),
      // A question for all levels (no level set) suits every reader.
      ...(query.level ? { OR: [{ level: query.level }, { level: null }] } : {}),
      ...(query.subspecialty ? { subspecialty: { key: query.subspecialty } } : {}),
    };
    const userId = principal?.userId;
    let narrow: Prisma.ExamQuestionWhereInput | null = null;
    if (userId && query.set === 'all') {
      const since = new Date(Date.now() - RIGHT_RECENTLY_DAYS * 24 * 60 * 60 * 1000);
      narrow = { answers: { none: { userId, correct: true, at: { gte: since } } } };
    } else if (userId && query.set === 'bookmarks') {
      narrow = { bookmarks: { some: { userId } } };
    } else if (userId && query.set === 'wrong') {
      narrow = { id: { in: await this.wrongIds(userId) } };
    }
    const where: Prisma.ExamQuestionWhereInput = narrow ? { AND: [base, narrow] } : base;
    const total = await this.prisma.examQuestion.count({ where });
    const leftOutRecentlyRight =
      userId && query.set === 'all'
        ? (await this.prisma.examQuestion.count({ where: base })) - total
        : 0;
    if (total === 0) return { question: null, remaining: 0, leftOutRecentlyRight };
    const row = await this.prisma.examQuestion.findFirst({
      where,
      include: INCLUDE,
      orderBy: { id: 'asc' },
      skip: Math.floor(Math.random() * total),
    });
    // The set can shrink between the count and the read (a question was just archived).
    if (!row) return { question: null, remaining: 0, leftOutRecentlyRight };
    const text = pick(row.translations, query.locale);
    return {
      question: {
        id: row.id,
        stem: text.stem,
        options: row.options.map((option) => ({
          position: option.position,
          text: pick(option.translations, query.locale).text,
        })),
        level: row.level,
        difficulty: row.difficulty,
        subspecialty: row.subspecialty
          ? {
              key: row.subspecialty.key,
              nameHe: row.subspecialty.nameHe,
              nameEn: row.subspecialty.nameEn,
            }
          : null,
        bookmarked: userId ? await this.isBookmarked(userId, row.id) : false,
        locale: text.locale as Locale,
      },
      remaining: total - 1,
      leftOutRecentlyRight,
    };
  }

  /** Checks the answer and reveals the explanations. Stores it for a signed-in person. */
  async answer(
    principal: Principal | null,
    id: string,
    position: number,
    locale: Locale,
  ): Promise<AnswerResultDto> {
    const row = await this.visible(principal, id);
    const chosen = row.options.find((option) => option.position === position);
    if (!chosen) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'position', code: 'unknownOption' }]);
    }
    const right = row.options.find((option) => option.isCorrect)!;
    const correct = chosen.id === right.id;
    const countsForScore = principal
      ? await this.store(principal.userId, row.id, position, correct)
      : false;
    return {
      correct,
      chosenPosition: position,
      correctPosition: right.position,
      options: row.options.map((option) => {
        const text = pick(option.translations, locale);
        return {
          position: option.position,
          text: text.text,
          correct: option.isCorrect,
          explanation: text.explanation,
        };
      }),
      summary: pick(row.translations, locale).summary,
      references: referencesOf(row.references),
      reviewer: reviewerView(row),
      bookmarked: principal ? await this.isBookmarked(principal.userId, row.id) : false,
      saved: principal !== null,
      countsForScore,
    };
  }

  /** The caller's own score and the questions they answered. */
  async results(principal: Principal, locale: Locale): Promise<ExamResultsDto> {
    const answers = await this.prisma.examAnswer.findMany({
      where: { userId: principal.userId },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      include: { question: { include: { translations: true } } },
    });
    const byQuestion = new Map<string, typeof answers>();
    for (const answer of answers) {
      byQuestion.set(answer.questionId, [...(byQuestion.get(answer.questionId) ?? []), answer]);
    }
    return {
      ...score(answers),
      // Newest first: the map keeps the order in which questions first appear.
      items: [...byQuestion.values()].map((attempts) => {
        const latest = attempts[0]!;
        return {
          questionId: latest.questionId,
          stem: pick(latest.question.translations, locale).stem,
          firstCorrect: attempts.find((attempt) => attempt.counts)?.correct ?? false,
          attempts: attempts.length,
          lastAnsweredAt: latest.at.toISOString(),
        };
      }),
    };
  }

  /** Bookmarks a question the person may read (again is fine). */
  async bookmark(principal: Principal, id: string): Promise<void> {
    await this.visible(principal, id);
    await this.prisma.examBookmark.upsert({
      where: { userId_questionId: { userId: principal.userId, questionId: id } },
      create: { userId: principal.userId, questionId: id },
      update: {},
    });
  }

  async unbookmark(principal: Principal, id: string): Promise<void> {
    await this.prisma.examBookmark.deleteMany({
      where: { userId: principal.userId, questionId: id },
    });
  }

  /** The person's bookmarks that are still published and theirs to read, newest first. */
  async bookmarks(principal: Principal, locale: Locale): Promise<ExamBookmarkListDto> {
    const viewer = await this.access.viewerOf(principal);
    const rows = await this.prisma.examBookmark.findMany({
      where: {
        userId: principal.userId,
        question: {
          status: 'PUBLISHED',
          AND: [await this.access.visibleWhere('exam_question', viewer)],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { questionId: 'asc' }],
      include: { question: { include: { translations: true, subspecialty: true } } },
    });
    return {
      items: rows.map((row) => ({
        questionId: row.questionId,
        stem: pick(row.question.translations, locale).stem,
        subspecialty: row.question.subspecialty
          ? {
              key: row.question.subspecialty.key,
              nameHe: row.question.subspecialty.nameHe,
              nameEn: row.question.subspecialty.nameEn,
            }
          : null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async isBookmarked(userId: string, questionId: string): Promise<boolean> {
    const found = await this.prisma.examBookmark.findUnique({
      where: { userId_questionId: { userId, questionId } },
      select: { userId: true },
    });
    return found !== null;
  }

  private async wrongIds(userId: string): Promise<string[]> {
    const answers = await this.prisma.examAnswer.findMany({
      where: { userId },
      select: { questionId: true, correct: true, at: true },
    });
    return wrongNow(answers);
  }

  /** The published question, if the caller may see it; otherwise 404. */
  private async visible(principal: Principal | null, id: string): Promise<Row> {
    const row = await this.prisma.examQuestion.findFirst({
      where: { id, status: 'PUBLISHED' },
      include: INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    const viewer = await this.access.viewerOf(principal);
    if (!(await this.access.canSeeItem('exam_question', row, viewer))) {
      throw new AppException('NOT_FOUND');
    }
    return row;
  }

  /** Stores the answer; returns true when it is the person's first for this question. */
  private async store(
    userId: string,
    questionId: string,
    position: number,
    correct: boolean,
  ): Promise<boolean> {
    const data = { userId, questionId, position, correct };
    const before = await this.prisma.examAnswer.count({ where: { userId, questionId } });
    if (before === 0) {
      try {
        await this.prisma.examAnswer.create({ data: { id: uuidv7(), ...data, counts: true } });
        return true;
      } catch (error) {
        // Two answers at the same moment: the index lets one count; this one is a repeat.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    await this.prisma.examAnswer.create({ data: { id: uuidv7(), ...data, counts: false } });
    return false;
  }
}
