import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { referencesOf, reviewerView } from './exam-rules';
import { type MockExamDto, type MockExamListDto, type MockExamStartDto } from './mock-exam.dto';
import { acceptsAnswers, endsAt, overdue, sample } from './mock-exam-rules';

const INCLUDE = {
  questions: {
    orderBy: { position: 'asc' },
    include: {
      question: {
        include: {
          translations: true,
          options: { orderBy: { position: 'asc' }, include: { translations: true } },
        },
      },
    },
  },
} satisfies Prisma.MockExamInclude;
type Row = Prisma.MockExamGetPayload<{ include: typeof INCLUDE }>;
type Locale = 'he' | 'en';

/** The requested language, else Hebrew, else whatever exists. */
function pick<T extends { locale: string }>(rows: T[], locale: Locale): T {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he') ?? rows[0]!;
}

/**
 * The timed mock exam (M23 plan §2, §3): a signed-in person chooses its length and topics, and
 * gets that many published questions they may read, at random. The server keeps the clock.
 * Nothing about the right answers leaves the server until the exam is over; then every question
 * is shown with its explanations. An exam whose time ran out is closed the next time it, or the
 * person's list or progress, is read.
 */
@Injectable()
export class MockExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async start(principal: Principal, input: MockExamStartDto, locale: Locale): Promise<MockExamDto> {
    const viewer = await this.access.viewerOf(principal);
    const candidates = await this.prisma.examQuestion.findMany({
      where: {
        status: 'PUBLISHED',
        AND: [await this.access.visibleWhere('exam_question', viewer)],
        ...(input.level ? { OR: [{ level: input.level }, { level: null }] } : {}),
        ...(input.subspecialties.length
          ? { subspecialty: { key: { in: input.subspecialties } } }
          : {}),
      },
      select: { id: true },
    });
    const chosen = sample(
      candidates.map((row) => row.id),
      input.size,
    );
    if (chosen.length === 0) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'mockExamNoQuestions' }]);
    }
    const id = uuidv7();
    const now = new Date();
    await this.prisma.mockExam.create({
      data: {
        id,
        userId: principal.userId,
        level: input.level ?? null,
        subspecialtyKeys: input.subspecialties,
        startedAt: now,
        endsAt: endsAt(now, chosen.length),
        questions: {
          create: chosen.map((questionId, index) => ({ position: index + 1, questionId })),
        },
      },
    });
    return this.get(principal, id, locale);
  }

  async get(principal: Principal, id: string, locale: Locale): Promise<MockExamDto> {
    const row = await this.own(principal, id);
    if (overdue(row, new Date())) {
      await this.close(row);
      return view(await this.own(principal, id), locale);
    }
    return view(row, locale);
  }

  /** Records (or changes, or clears) the option chosen for one question while time is left. */
  async answer(
    principal: Principal,
    id: string,
    position: number,
    chosen: number | null,
  ): Promise<void> {
    const row = await this.own(principal, id);
    if (!acceptsAnswers(row, new Date())) {
      if (overdue(row, new Date())) await this.close(row);
      throw new AppException('CONFLICT', [{ code: 'mockExamOver' }]);
    }
    const item = row.questions.find((question) => question.position === position);
    if (!item) throw new AppException('NOT_FOUND');
    if (chosen !== null && !item.question.options.some((option) => option.position === chosen)) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'position', code: 'unknownOption' }]);
    }
    await this.prisma.mockExamQuestion.update({
      where: { examId_position: { examId: id, position } },
      data: { chosenPosition: chosen, answeredAt: chosen === null ? null : new Date() },
    });
  }

  /** Ends the exam now and returns it with every answer. */
  async finish(principal: Principal, id: string, locale: Locale): Promise<MockExamDto> {
    const row = await this.own(principal, id);
    if (!row.finishedAt) await this.close(row);
    return view(await this.own(principal, id), locale);
  }

  async list(principal: Principal): Promise<MockExamListDto> {
    await this.closeOverdue(principal.userId);
    const rows = await this.prisma.mockExam.findMany({
      where: { userId: principal.userId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { questions: true } } },
      take: 100,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.finishedAt ? 'FINISHED' : 'RUNNING',
        startedAt: row.startedAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        total: row._count.questions,
        correct: row.correct,
      })),
    };
  }

  /** Closes the person's exams whose time ran out, so their answers count everywhere. */
  async closeOverdue(userId: string): Promise<void> {
    const now = new Date();
    const open = await this.prisma.mockExam.findMany({
      where: { userId, finishedAt: null },
      include: INCLUDE,
    });
    for (const row of open) if (overdue(row, now)) await this.close(row);
  }

  // --- Internals ------------------------------------------------------------------------------

  /** The person's own exam; anyone else's is 404. */
  private async own(principal: Principal, id: string): Promise<Row> {
    const row = await this.prisma.mockExam.findFirst({
      where: { id, userId: principal.userId },
      include: INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  /**
   * Scores the exam and writes its answers to exam_answers, marked with the exam. As in
   * practice, a person's first answer to a question is the one that counts. Ended by the clock,
   * it is finished at its end time; ended by the person, now.
   */
  private async close(row: Row): Promise<void> {
    const now = new Date();
    const finishedAt = now < row.endsAt ? now : row.endsAt;
    const answered = row.questions.filter((item) => item.chosenPosition !== null);
    const rightOf = (item: Row['questions'][number]) =>
      item.question.options.find((option) => option.isCorrect)?.position === item.chosenPosition;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.mockExam.updateMany({
        where: { id: row.id, finishedAt: null },
        data: { finishedAt, correct: answered.filter(rightOf).length },
      });
      // Closed at the same moment by another request: its answers are already written.
      if (count === 0) return;
      const before = await tx.examAnswer.findMany({
        where: {
          userId: row.userId,
          counts: true,
          questionId: { in: answered.map((item) => item.questionId) },
        },
        select: { questionId: true },
      });
      const counted = new Set(before.map((answer) => answer.questionId));
      await tx.examAnswer.createMany({
        data: answered.map((item) => ({
          id: uuidv7(),
          userId: row.userId,
          questionId: item.questionId,
          position: item.chosenPosition!,
          correct: rightOf(item),
          counts: !counted.has(item.questionId),
          mockExamId: row.id,
          at: item.answeredAt ?? finishedAt,
        })),
      });
    });
  }
}

function view(row: Row, locale: Locale): MockExamDto {
  const over = row.finishedAt !== null;
  return {
    id: row.id,
    status: over ? 'FINISHED' : 'RUNNING',
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    now: new Date().toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    total: row.questions.length,
    answered: row.questions.filter((item) => item.chosenPosition !== null).length,
    correct: over ? row.correct : null,
    questions: row.questions.map((item) => {
      const question = item.question;
      const text = pick(question.translations, locale);
      return {
        position: item.position,
        questionId: item.questionId,
        stem: text.stem,
        options: question.options.map((option) => {
          const optionText = pick(option.translations, locale);
          return {
            position: option.position,
            text: optionText.text,
            correct: over ? option.isCorrect : null,
            explanation: over ? optionText.explanation : null,
          };
        }),
        chosenPosition: item.chosenPosition,
        correctPosition: over
          ? (question.options.find((option) => option.isCorrect)?.position ?? null)
          : null,
        summary: over ? text.summary : null,
        references: over ? referencesOf(question.references) : [],
        reviewer: over ? reviewerView(question) : null,
      };
    }),
  };
}
