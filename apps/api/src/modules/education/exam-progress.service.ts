import { Injectable } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { type Principal } from '../../common/auth/principal';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { MockExamService } from './mock-exam.service';
import { byTopic, byWeek, isWeak, percentOf } from './progress-rules';

export class ExamProgressDto extends createZodDto(
  z.strictObject({
    /** First answers, and how many of them were right. */
    answered: z.number().int(),
    correct: z.number().int(),
    percent: z.number().int().nullable(),
    /**
     * Every topic, in the usual order, then questions without a topic (key null) if any were
     * answered. `available` is how many published questions of the topic the person may read, so
     * a reader sees how few questions a number rests on.
     */
    topics: z.array(
      z.strictObject({
        key: nullableString(),
        nameHe: nullableString(),
        nameEn: nullableString(),
        answered: z.number().int(),
        correct: z.number().int(),
        percent: z.number().int().nullable(),
        weak: z.boolean(),
        available: z.number().int(),
      }),
    ),
    /** The last 12 weeks, the oldest first; a week starts on Sunday. */
    weeks: z.array(
      z.strictObject({
        start: z.iso.date(),
        answered: z.number().int(),
        correct: z.number().int(),
      }),
    ),
  }),
) {}

/**
 * A person's progress (M23 plan §2): by topic and over time, from first answers only, with the
 * weak topics. Only that person can read it.
 */
@Injectable()
export class ExamProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly exams: MockExamService,
  ) {}

  async progress(principal: Principal): Promise<ExamProgressDto> {
    // An exam whose time ran out counts once it is closed.
    await this.exams.closeOverdue(principal.userId);
    const viewer = await this.access.viewerOf(principal);
    const [answers, subspecialties, available] = await Promise.all([
      this.prisma.examAnswer.findMany({
        where: { userId: principal.userId, counts: true },
        select: {
          correct: true,
          at: true,
          question: { select: { subspecialty: { select: { key: true } } } },
        },
      }),
      this.prisma.subspecialty.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      }),
      this.prisma.examQuestion.groupBy({
        by: ['subspecialtyId'],
        where: {
          status: 'PUBLISHED',
          AND: [await this.access.visibleWhere('exam_question', viewer)],
        },
        _count: { _all: true },
      }),
    ]);
    const first = answers.map((answer) => ({
      topic: answer.question.subspecialty?.key ?? null,
      correct: answer.correct,
      at: answer.at,
    }));
    const topics = byTopic(first);
    const availableOf = new Map(available.map((row) => [row.subspecialtyId, row._count._all]));
    const line = (
      key: string | null,
      names: { nameHe: string | null; nameEn: string | null },
      subspecialtyId: string | null,
    ) => {
      const { answered, correct } = topics.get(key) ?? { answered: 0, correct: 0 };
      return {
        key,
        ...names,
        answered,
        correct,
        percent: percentOf(correct, answered),
        weak: isWeak(answered, correct),
        available: availableOf.get(subspecialtyId) ?? 0,
      };
    };
    const correct = first.filter((answer) => answer.correct).length;
    return {
      answered: first.length,
      correct,
      percent: percentOf(correct, first.length),
      topics: [
        ...subspecialties.map((row) =>
          line(row.key, { nameHe: row.nameHe, nameEn: row.nameEn }, row.id),
        ),
        ...(topics.has(null) ? [line(null, { nameHe: null, nameEn: null }, null)] : []),
      ],
      weeks: byWeek(first, new Date()),
    };
  }
}
