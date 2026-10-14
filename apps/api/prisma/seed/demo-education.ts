import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uuidv7 } from '@medconnect/shared';
import { type Prisma, type PrismaClient } from '../../src/generated/prisma/client';

/**
 * Demo education (M6 plan §2.11): library items of every type and in every state, one course, and
 * the sample exam questions. The library items are fictional and say so; they carry no medical
 * content. The exam questions are real teaching questions drafted for the demo. They were loaded
 * waiting for review until the owner, a urologist, read them and found them fine (2026-10-02);
 * since then they are loaded published, at the owner's request. A question added to the fixture
 * later needs the same check before it goes in.
 * Development only (the seed runner refuses production). Runs once: skipped when the demo course
 * exists. It follows the content layer, whose editor is the author and whose admin is the reviewer.
 */
const COURSE_SLUG = 'demo-course';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const QUESTIONS_FIXTURE = path.resolve(__dirname, '../fixtures/demo-exam-questions.json');

type Tx = Prisma.TransactionClient;
type Status = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
type Level = 'STUDENT' | 'RESIDENT' | 'FELLOW' | 'SPECIALIST' | 'EXPERT';
type ItemType =
  | 'VIDEO'
  | 'ARTICLE'
  | 'PDF'
  | 'PRESENTATION'
  | 'PODCAST'
  | 'WEBINAR'
  | 'SURGICAL_VIDEO'
  | 'CASE'
  | 'COURSE';

interface Text {
  title: string;
  description: string;
}

interface ItemSeed {
  slug: string;
  type: ItemType;
  status: Status;
  level?: Level;
  subspecialty?: string;
  tier?: 'PUBLIC' | 'VERIFIED';
  minutes?: number;
  cme?: number;
  /** Where the recording is hosted. Without it, a linked type waits for its recording. */
  link?: string;
  /** The name of the sample document attached to the item. */
  file?: string;
  references?: { title: string; url: string }[];
  publishedDaysAgo?: number;
  he: Text;
  en?: Text;
  /** For the course: the slugs of its lessons, in order. */
  lessons?: string[];
}

const NOTE_HE = 'פריט לדוגמה בגרסת ההדגמה. התוכן בדוי ואין בו מידע רפואי.';
const NOTE_EN =
  'A sample item in the demo version. The content is fictional and is not medical information.';
const AUTHOR_HE = 'נועה שלו';
const AUTHOR_EN = 'Noa Shalev';
const LINKED: ItemType[] = ['VIDEO', 'PODCAST', 'WEBINAR', 'SURGICAL_VIDEO'];

const ITEMS: ItemSeed[] = [
  {
    slug: 'demo-article',
    type: 'ARTICLE',
    status: 'PUBLISHED',
    level: 'RESIDENT',
    subspecialty: 'UROLITHIASIS',
    minutes: 8,
    publishedDaysAgo: 12,
    references: [
      { title: 'Example reference (fictional)', url: 'https://guidelines.example.test/stones' },
    ],
    he: {
      title: 'מאמר לדוגמה למתמחים (הדגמה)',
      description: `${NOTE_HE}\n\n## איך נראה מאמר\n\nמאמר מוצג כטקסט מלא, עם כותרות, רשימות וקישורים.\n\n- רמה ותת־התמחות מופיעות מתחת לכותרת\n- מקורות מופיעים בסוף`,
    },
    en: {
      title: 'Sample article for residents (demo)',
      description: `${NOTE_EN}\n\n## What an article looks like\n\nAn article is shown as full text, with headings, lists and links.\n\n- The level and subspecialty appear under the title\n- References appear at the end`,
    },
  },
  {
    slug: 'demo-video',
    type: 'VIDEO',
    status: 'PUBLISHED',
    level: 'STUDENT',
    minutes: 25,
    link: 'https://video.example.test/demo-lecture',
    publishedDaysAgo: 10,
    he: {
      title: 'הרצאה מוקלטת לדוגמה (הדגמה)',
      description: `${NOTE_HE}\n\nהרצאה מוקלטת נפתחת באתר שבו היא מאוחסנת. הקישור כאן הוא לכתובת לדוגמה.`,
    },
    en: {
      title: 'Sample recorded lecture (demo)',
      description: `${NOTE_EN}\n\nA recorded lecture opens on the site that hosts it. The link here is an example address.`,
    },
  },
  {
    slug: 'demo-document',
    type: 'PDF',
    status: 'PUBLISHED',
    subspecialty: 'FUNCTIONAL',
    file: 'demo-document.pdf',
    publishedDaysAgo: 8,
    he: {
      title: 'מסמך לדוגמה להורדה (הדגמה)',
      description: `${NOTE_HE}\n\nלפריט מצורף קובץ PDF לדוגמה, של עמוד אחד.`,
    },
    en: {
      title: 'Sample document to download (demo)',
      description: `${NOTE_EN}\n\nA one-page sample PDF is attached to this item.`,
    },
  },
  {
    slug: 'demo-webinar',
    type: 'WEBINAR',
    status: 'PUBLISHED',
    level: 'SPECIALIST',
    subspecialty: 'URO_ONCOLOGY',
    minutes: 60,
    cme: 1.5,
    publishedDaysAgo: 3,
    he: {
      title: 'וובינר שההקלטה שלו עוד לא זמינה (הדגמה)',
      description: `${NOTE_HE}\n\nהוובינר התקיים, וההקלטה תתווסף בהמשך. עד אז מוצגת הודעה במקום קישור.`,
    },
    en: {
      title: 'A webinar whose recording isn’t available yet (demo)',
      description: `${NOTE_EN}\n\nThe webinar took place and the recording will be added later. Until then a notice is shown in place of a link.`,
    },
  },
  {
    slug: 'demo-case',
    type: 'CASE',
    status: 'PUBLISHED',
    level: 'RESIDENT',
    subspecialty: 'PEDIATRIC',
    tier: 'VERIFIED',
    publishedDaysAgo: 6,
    he: {
      title: 'תיאור מקרה לחברים בלבד (הדגמה)',
      description: `${NOTE_HE}\n\nרק חברים פעילים יכולים לקרוא את הפריט הזה. תיאור מקרה אמיתי לא יכלול שום פרט שמזהה מטופל/ת.`,
    },
    en: {
      title: 'A case for members only (demo)',
      description: `${NOTE_EN}\n\nOnly active members can read this item. A real case would contain nothing that identifies a patient.`,
    },
  },
  {
    slug: 'demo-podcast',
    type: 'PODCAST',
    status: 'PUBLISHED',
    minutes: 35,
    link: 'https://audio.example.test/demo-episode',
    publishedDaysAgo: 5,
    he: {
      title: 'פרק פודקאסט לדוגמה, בעברית בלבד (הדגמה)',
      description: `${NOTE_HE}\n\nהפריט הזה נכתב בעברית בלבד, כדי להדגים את ההודעה שמוצגת לקוראים באנגלית.`,
    },
  },
  {
    slug: 'demo-presentation',
    type: 'PRESENTATION',
    status: 'IN_REVIEW',
    level: 'FELLOW',
    file: 'demo-presentation.pdf',
    he: {
      title: 'מצגת שממתינה לבדיקה (הדגמה)',
      description: `${NOTE_HE}\n\nהפריט הוגש לבדיקה. בודק/ת יכול/ה לפרסם אותו או להחזיר אותו עם הערה.`,
    },
    en: {
      title: 'A presentation waiting for review (demo)',
      description: `${NOTE_EN}\n\nThis item was submitted for review. A reviewer can publish it or send it back with a comment.`,
    },
  },
  {
    slug: 'demo-surgical-video',
    type: 'SURGICAL_VIDEO',
    status: 'DRAFT',
    level: 'EXPERT',
    he: {
      title: 'טיוטה: סרטון ניתוח (הדגמה)',
      description: `${NOTE_HE}\n\nטיוטה. רק העורכים והבודקים רואים אותה.`,
    },
  },
  {
    slug: 'demo-archived-article',
    type: 'ARTICLE',
    status: 'ARCHIVED',
    publishedDaysAgo: 300,
    he: {
      title: 'מאמר ישן שהועבר לארכיון (הדגמה)',
      description: `${NOTE_HE}\n\nפריט בארכיון אינו מופיע בספרייה, אבל הקישור אליו ממשיך לעבוד.`,
    },
    en: {
      title: 'An older article that was archived (demo)',
      description: `${NOTE_EN}\n\nAn archived item leaves the library, but its link keeps working.`,
    },
  },
  {
    slug: COURSE_SLUG,
    type: 'COURSE',
    status: 'PUBLISHED',
    level: 'RESIDENT',
    cme: 3,
    publishedDaysAgo: 2,
    lessons: ['demo-article', 'demo-video', 'demo-document', 'demo-case'],
    he: {
      title: 'קורס לדוגמה בארבעה שיעורים (הדגמה)',
      description: `${NOTE_HE}\n\nקורס מקבץ פריטים לפי סדר. השיעור האחרון פתוח לחברים בלבד, ומבקרים רואים אותו נעול.`,
    },
    en: {
      title: 'Sample course in four lessons (demo)',
      description: `${NOTE_EN}\n\nA course groups items in order. The last lesson is open to members only, and visitors see it locked.`,
    },
  },
];

interface QuestionText {
  stem: string;
  summary: string;
}

interface OptionText {
  text: string;
  explanation: string;
}

interface QuestionSeed {
  level: Level | null;
  subspecialty: string | null;
  he: QuestionText;
  en: QuestionText;
  options: { correct: boolean; he: OptionText; en: OptionText }[];
}

const REVIEW_NOTE =
  'שאלה לדוגמה שנוסחה עבור ההדגמה. יש לבדוק אותה מבחינה רפואית לפני פרסום. / ' +
  'A sample question drafted for the demo. It needs a urologist’s check before it is published.';
const PUBLISH_NOTE =
  'נבדקה על ידי אורולוג (בעל הפרויקט) ב־2 באוקטובר 2026. / ' +
  'Checked by a urologist (the project owner) on 2 October 2026.';

export async function seedDemoEducation(prisma: PrismaClient): Promise<void> {
  if (await prisma.educationItem.findUnique({ where: { slug: COURSE_SLUG } })) {
    console.log('seed: demo education already present, skipped');
    return;
  }
  const user = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
  const [admin, editor] = await Promise.all([user('admin@demo.test'), user('editor@demo.test')]);
  if (!admin || !editor) {
    console.log('seed: demo education needs the demo people and content first, skipped');
    return;
  }
  const subspecialties = new Map(
    (await prisma.subspecialty.findMany()).map((s) => [s.key, s.id] as const),
  );
  const subspecialtyOf = (key: string | null | undefined) => {
    if (!key) return null;
    const id = subspecialties.get(key);
    if (!id) throw new Error(`Unknown subspecialty in the demo education seed: ${key}`);
    return id;
  };
  const questions = JSON.parse(readFileSync(QUESTIONS_FIXTURE, 'utf8')) as QuestionSeed[];
  for (const [index, question] of questions.entries()) {
    if (question.options.filter((option) => option.correct).length !== 1) {
      throw new Error(`Demo exam question ${index + 1} must have exactly one right answer.`);
    }
  }
  const now = Date.now();

  await prisma.$transaction(
    async (tx) => {
      const ids = new Map<string, string>();
      for (const seed of ITEMS) {
        const id = uuidv7();
        ids.set(seed.slug, id);
        const published = seed.status === 'PUBLISHED' || seed.status === 'ARCHIVED';
        const submitted = seed.status !== 'DRAFT';
        const publishedAt = published ? new Date(now - (seed.publishedDaysAgo ?? 1) * DAY) : null;
        const linked = LINKED.includes(seed.type);
        await tx.educationItem.create({
          data: {
            id,
            slug: seed.slug,
            type: seed.type,
            status: seed.status,
            level: seed.level ?? null,
            subspecialtyId: subspecialtyOf(seed.subspecialty),
            durationMinutes: seed.minutes ?? null,
            cmePoints: seed.cme ?? null,
            externalUrl: seed.link ?? null,
            videoStatus: seed.link ? 'EXTERNAL' : linked ? 'PENDING_PROVIDER' : 'NONE',
            accessTier: seed.tier ?? 'PUBLIC',
            references: seed.references ?? [],
            authorUserId: editor,
            submittedBy: submitted ? editor : null,
            publishedAt,
            archivedAt: seed.status === 'ARCHIVED' ? new Date(now - 30 * DAY) : null,
            translations: {
              create: [
                { locale: 'he', ...seed.he, author: AUTHOR_HE },
                ...(seed.en ? [{ locale: 'en', ...seed.en, author: AUTHOR_EN }] : []),
              ],
            },
          },
        });
        if (seed.file) {
          const fileId = await sampleDocument(tx, seed.file, seed.en?.title ?? seed.slug, editor);
          await tx.educationFile.create({ data: { itemId: id, fileId, sortOrder: 0 } });
        }
        const steps: [string, Status | null, Status, string][] = [
          ['create', null, 'DRAFT', editor],
          ...(submitted ? [['SUBMIT', 'DRAFT', 'IN_REVIEW', editor] as const] : []),
          ...(published ? [['PUBLISH', 'IN_REVIEW', 'PUBLISHED', admin] as const] : []),
          ...(seed.status === 'ARCHIVED'
            ? [['ARCHIVE', 'PUBLISHED', 'ARCHIVED', admin] as const]
            : []),
        ].map((step) => [...step] as [string, Status | null, Status, string]);
        const start = (publishedAt?.getTime() ?? now) - DAY;
        for (const [index, [action, fromStatus, toStatus, actorUserId]] of steps.entries()) {
          await tx.educationHistory.create({
            data: {
              id: uuidv7(),
              itemId: id,
              action,
              fromStatus,
              toStatus,
              actorUserId,
              at: new Date(start + index * HOUR),
            },
          });
        }
      }
      for (const seed of ITEMS) {
        for (const [index, slug] of (seed.lessons ?? []).entries()) {
          await tx.courseItem.create({
            data: { courseId: ids.get(seed.slug)!, itemId: ids.get(slug)!, position: index + 1 },
          });
        }
      }

      for (const question of questions) {
        const id = uuidv7();
        await tx.examQuestion.create({
          data: {
            id,
            status: 'PUBLISHED',
            publishedAt: new Date(now - HOUR),
            level: question.level,
            subspecialtyId: subspecialtyOf(question.subspecialty),
            authorUserId: editor,
            submittedBy: editor,
            translations: {
              create: [
                { locale: 'he', ...question.he },
                { locale: 'en', ...question.en },
              ],
            },
            options: {
              create: question.options.map((option, index) => ({
                id: uuidv7(),
                position: index + 1,
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
                  actorUserId: editor,
                  at: new Date(now - 3 * HOUR),
                },
                {
                  id: uuidv7(),
                  action: 'SUBMIT',
                  fromStatus: 'DRAFT',
                  toStatus: 'IN_REVIEW',
                  actorUserId: editor,
                  comment: REVIEW_NOTE,
                  at: new Date(now - 2 * HOUR),
                },
                {
                  id: uuidv7(),
                  action: 'PUBLISH',
                  fromStatus: 'IN_REVIEW',
                  toStatus: 'PUBLISHED',
                  actorUserId: admin,
                  comment: PUBLISH_NOTE,
                  at: new Date(now - HOUR),
                },
              ],
            },
          },
        });
      }
    },
    { timeout: 60_000 },
  );
  console.log(
    `seed: demo education created (${ITEMS.length} items, 1 course, ${questions.length} exam questions, published)`,
  );
}

/** Stores a one-page sample PDF the way an upload is stored, and returns the file's id. */
async function sampleDocument(
  tx: Tx,
  name: string,
  heading: string,
  ownerUserId: string,
): Promise<string> {
  const body = onePagePdf([heading, 'Med Connect demo. This document is fictional.']);
  const today = new Date();
  const folder = `${today.getUTCFullYear()}/${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const storageKey = `${folder}/${randomUUID()}`;
  const file = path.join(REPO_ROOT, process.env.STORAGE_DIR ?? 'storage', ...storageKey.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, { flag: 'wx' });
  const id = uuidv7();
  await tx.storedFile.create({
    data: {
      id,
      storageKey,
      originalName: name,
      mimeType: 'application/pdf',
      kind: 'DOCUMENT',
      purpose: 'CONTENT',
      sizeBytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      scanStatus: 'UNSCANNED',
      ownerUserId,
      attachedAt: today,
    },
  });
  return id;
}

/** A minimal, valid one-page PDF with the given lines of plain ASCII text. */
export function onePagePdf(lines: string[]): Buffer {
  const escape = (line: string) =>
    line.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, (char) => `\\${char}`);
  const text = lines
    .map(
      (line, index) =>
        `BT /F1 ${index === 0 ? 18 : 12} Tf 72 ${720 - index * 32} Td (${escape(line)}) Tj ET`,
    )
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
