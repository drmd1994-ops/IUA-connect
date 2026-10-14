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
  type ExamResultsDto,
  type NextQuestionDto,
  type NextQuestionQueryDto,
} from './exam.dto';
import { score } from './exam-rules';

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

  /** A random question the reader hasn't seen in this visit, for the chosen filters. */
  async next(principal: Principal | null, query: NextQuestionQueryDto): Promise<NextQuestionDto> {
    const viewer = await this.access.viewerOf(principal);
    const where: Prisma.ExamQuestionWhereInput = {
      status: 'PUBLISHED',
      AND: [await this.access.visibleWhere('exam_question', viewer)],
      ...(query.exclude.length ? { id: { notIn: query.exclude } } : {}),
      // A question for all levels (no level set) suits every reader.
      ...(query.level ? { OR: [{ level: query.level }, { level: null }] } : {}),
      ...(query.subspecialty ? { subspecialty: { key: query.subspecialty } } : {}),
    };
    const total = await this.prisma.examQuestion.count({ where });
    if (total === 0) return { question: null, remaining: 0 };
    const row = await this.prisma.examQuestion.findFirst({
      where,
      include: INCLUDE,
      orderBy: { id: 'asc' },
      skip: Math.floor(Math.random() * total),
    });
    // The set can shrink between the count and the read (a question was just archived).
    if (!row) return { question: null, remaining: 0 };
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
        subspecialty: row.subspecialty
          ? {
              key: row.subspecialty.key,
              nameHe: row.subspecialty.nameHe,
              nameEn: row.subspecialty.nameEn,
            }
          : null,
        locale: text.locale as Locale,
      },
      remaining: total - 1,
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
