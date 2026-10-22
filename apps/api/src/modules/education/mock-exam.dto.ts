import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { LEVELS } from './education.dto';
import { MAX_OPTIONS } from './exam-rules';
import { MOCK_SIZES } from './mock-exam-rules';

const locale = z.enum(['he', 'en']);
const position = z.number().int().min(1).max(MAX_OPTIONS);
const reference = z.strictObject({ title: z.string(), url: z.string().optional() });
const reviewer = z
  .strictObject({ nameHe: nullableString(), nameEn: nullableString(), at: z.iso.datetime() })
  .nullable();

export class MockExamStartDto extends createZodDto(
  z.strictObject({
    /** How many questions: 10, 25 or 50. Fewer when fewer match. */
    size: z.union(MOCK_SIZES.map((size) => z.literal(size))),
    /** Subspecialty keys; empty for every topic. */
    subspecialties: z.array(z.string().max(64)).max(20).default([]),
    level: z.enum(LEVELS).optional(),
  }),
) {}

export class MockExamQueryDto extends createZodDto(
  z.strictObject({ locale: locale.default('he') }),
) {}

export class MockExamAnswerDto extends createZodDto(
  z.strictObject({
    /** The option chosen; it may change until the exam ends. Null clears it. */
    position: position.nullable(),
  }),
) {}

/**
 * A mock exam. While it runs, each question comes **without** its answer: `correct`,
 * `explanation`, `correctPosition`, `summary`, `references` and `reviewer` are empty until the
 * exam is over.
 */
export class MockExamDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    status: z.enum(['RUNNING', 'FINISHED']),
    startedAt: z.iso.datetime(),
    /** The server's clock decides; `now` lets the reader's clock follow it. */
    endsAt: z.iso.datetime(),
    now: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    total: z.number().int(),
    answered: z.number().int(),
    /** Right answers; null while it runs. */
    correct: z.number().int().nullable(),
    questions: z.array(
      z.strictObject({
        position: z.number().int(),
        questionId: z.uuid(),
        stem: z.string(),
        options: z.array(
          z.strictObject({
            position,
            text: z.string(),
            correct: z.boolean().nullable(),
            explanation: z.string().nullable(),
          }),
        ),
        chosenPosition: position.nullable(),
        correctPosition: position.nullable(),
        summary: z.string().nullable(),
        references: z.array(reference),
        reviewer,
      }),
    ),
  }),
) {}

export class MockExamListDto extends createZodDto(
  z.strictObject({
    /** The newest first. */
    items: z.array(
      z.strictObject({
        id: z.uuid(),
        status: z.enum(['RUNNING', 'FINISHED']),
        startedAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        finishedAt: z.iso.datetime().nullable(),
        total: z.number().int(),
        correct: z.number().int().nullable(),
      }),
    ),
  }),
) {}
