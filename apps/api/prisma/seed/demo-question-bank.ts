import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';

/**
 * The question bank's starter set (M23 plan §2, owner answer §10.1): 100 new teaching questions,
 * about 9 for each of the 11 subspecialties, drafted by Claude (an AI assistant) from general
 * knowledge of the EAU and other public guidelines, and copied from no exam or question bank.
 * They are loaded **waiting for review**: none is published until a physician reads and
 * publishes it. The editor is their author and submitter, so an administrator can publish them.
 *
 * One file per subspecialty in prisma/fixtures/starter-questions, the right option written first;
 * here the options are turned so the right one falls in each position in turn.
 * Runs once: skipped when any starter question exists. Also run by the hosted demo on every
 * start, so a demo seeded before M23 gets them.
 */
const FIXTURES = path.resolve(__dirname, '../fixtures/starter-questions');
const HOUR = 60 * 60 * 1000;

export const STARTER_SOURCE =
  'Written new by Claude (an AI assistant) for Med Connect on 23 October 2026, from general ' +
  'knowledge of public guidelines; not copied from any exam or question bank. A urologist must ' +
  'check it before it is published.';

/** File name → subspecialty key. */
const TOPICS: Record<string, string> = {
  'andrology.json': 'ANDROLOGY',
  'community.json': 'COMMUNITY',
  'endourology.json': 'ENDOUROLOGY',
  'female.json': 'FEMALE',
  'functional.json': 'FUNCTIONAL',
  'pediatric.json': 'PEDIATRIC',
  'reconstructive.json': 'RECONSTRUCTIVE',
  'robotic.json': 'ROBOTIC',
  'transplant.json': 'TRANSPLANT',
  'uro-oncology.json': 'URO_ONCOLOGY',
  'urolithiasis.json': 'UROLITHIASIS',
};

type Level = 'STUDENT' | 'RESIDENT' | 'FELLOW' | 'SPECIALIST' | 'EXPERT';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
interface Text {
  stem: string;
  summary: string;
}
interface OptionText {
  text: string;
  explanation: string;
}
interface StarterQuestion {
  level: Level;
  difficulty: Difficulty;
  references: { title: string; url?: string }[];
  he: Text;
  en: Text;
  options: { correct: boolean; he: OptionText; en: OptionText }[];
}

/** Turns the options by `by` places, keeping their order around the circle. */
export function rotate<T>(items: readonly T[], by: number): T[] {
  const shift = ((by % items.length) + items.length) % items.length;
  return [...items.slice(items.length - shift), ...items.slice(0, items.length - shift)];
}

/** Every starter question with its subspecialty key, in a fixed order. */
export function readStarterQuestions(): (StarterQuestion & { topic: string })[] {
  return readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      const topic = TOPICS[name];
      if (!topic) throw new Error(`Unknown starter question file: ${name}`);
      const questions = JSON.parse(
        readFileSync(path.join(FIXTURES, name), 'utf8'),
      ) as StarterQuestion[];
      return questions.map((question, index) => {
        if (question.options.filter((option) => option.correct).length !== 1) {
          throw new Error(`Starter question ${name} #${index + 1} needs exactly one right answer.`);
        }
        return { ...question, topic };
      });
    });
}

export async function seedStarterQuestions(prisma: PrismaClient): Promise<void> {
  if (
    await prisma.examQuestion.findFirst({ where: { source: STARTER_SOURCE }, select: { id: true } })
  ) {
    console.log('seed: starter questions already present, skipped');
    return;
  }
  const editor = await prisma.user.findUnique({
    where: { email: 'editor@demo.test' },
    select: { id: true },
  });
  if (!editor) {
    console.log('seed: starter questions need the demo editor first, skipped');
    return;
  }
  const subspecialties = new Map(
    (await prisma.subspecialty.findMany()).map((row) => [row.key, row.id] as const),
  );
  const questions = readStarterQuestions();
  const now = Date.now();

  await prisma.$transaction(
    async (tx) => {
      for (const [index, question] of questions.entries()) {
        const subspecialtyId = subspecialties.get(question.topic);
        if (!subspecialtyId) throw new Error(`Unknown subspecialty: ${question.topic}`);
        const options = rotate(question.options, index);
        await tx.examQuestion.create({
          data: {
            id: uuidv7(),
            status: 'IN_REVIEW',
            level: question.level,
            difficulty: question.difficulty,
            references: question.references,
            source: STARTER_SOURCE,
            subspecialtyId,
            authorUserId: editor.id,
            submittedBy: editor.id,
            translations: {
              create: [
                { locale: 'he', ...question.he },
                { locale: 'en', ...question.en },
              ],
            },
            options: {
              create: options.map((option, position) => ({
                id: uuidv7(),
                position: position + 1,
                isCorrect: option.correct,
                translations: {
                  create: [
                    { locale: 'he', ...option.he },
                    { locale: 'en', ...option.en },
                  ],
                },
              })),
            },
            history: {
              create: [
                {
                  id: uuidv7(),
                  action: 'create',
                  fromStatus: null,
                  toStatus: 'DRAFT',
                  actorUserId: editor.id,
                  at: new Date(now - 2 * HOUR),
                },
                {
                  id: uuidv7(),
                  action: 'SUBMIT',
                  fromStatus: 'DRAFT',
                  toStatus: 'IN_REVIEW',
                  actorUserId: editor.id,
                  at: new Date(now - HOUR),
                },
              ],
            },
          },
        });
      }
    },
    { timeout: 120_000 },
  );
  console.log(`seed: ${questions.length} starter questions, waiting for review`);
}
