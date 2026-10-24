import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';

/**
 * Cases for the demo (M26 plan; owner answer §10.5): three made-up cases, text only, seeded as
 * waiting for review. They are medical content, so nothing shows until the owner (or a
 * moderator of the community) approves each one in the review queue. Each is presented by a
 * demo person who is not that community's moderator, so a moderator can approve it.
 * Development and the hosted demo only. Runs once: skipped when its first case exists, and when
 * the demo layer is missing.
 */
const MARKER_TITLE = 'אבן בשופכן הדיסטלי עם כאב חוזר (מקרה בדוי)';
const HOUR = 60 * 60 * 1000;

interface DemoCase {
  by: string;
  subspecialty: string;
  title: string;
  ageRange: 'UNDER_18' | 'FROM_18_TO_39' | 'FROM_40_TO_64' | 'FROM_65_TO_79' | 'OVER_80';
  sex: 'FEMALE' | 'MALE' | 'NOT_STATED';
  history: string;
  examination?: string;
  labs?: string;
  imaging?: string;
  question: string;
  options: string[];
  hoursAgo: number;
}

const CASES: DemoCase[] = [
  {
    by: 'member.resident@demo.test',
    subspecialty: 'UROLITHIASIS',
    title: MARKER_TITLE,
    ageRange: 'FROM_40_TO_64',
    sex: 'MALE',
    history:
      'מקרה בדוי לדוגמה. גבר שמגיע עם כאב מותני שמאלי גלי שהחל לפני יומיים והוקל חלקית במשככי כאבים. ללא חום, ללא בחילות. אירוע דומה לפני כמה שנים שחלף מעצמו.',
    examination: 'רגישות קלה בזווית הצלעית־שדרתית משמאל. סימנים חיוניים תקינים.',
    labs: 'ספירת דם וקריאטינין בטווח התקין. בשתן: כדוריות דם אדומות, ללא ניטריטים.',
    imaging: 'CT ללא חומר ניגוד: אבן של כ־6 מ״מ בשופכן הדיסטלי משמאל, הרחבה קלה של הכליה.',
    question: 'האם הייתם מתחילים בטיפול שמרני, ולכמה זמן, או מתערבים כבר עכשיו?',
    options: ['טיפול שמרני והמתנה', 'יורטרוסקופיה עכשיו', 'החדרת סטנט ודחיית הטיפול'],
    hoursAgo: 30,
  },
  {
    by: 'mentor.rana@demo.test',
    subspecialty: 'URO_ONCOLOGY',
    title: 'An incidental small renal mass in an older patient (fictional case)',
    ageRange: 'FROM_65_TO_79',
    sex: 'MALE',
    history:
      'A made-up case for the demo. A small solid renal mass was found incidentally on imaging done for abdominal pain that has since settled. Known heart disease, on two blood-pressure medicines. Lives independently and is active.',
    labs: 'Kidney function mildly reduced, stable over the past year.',
    imaging:
      'A solid enhancing mass of about 3 cm in the lower pole of the right kidney, no spread seen.',
    question:
      'Would you offer surgery, ablation, or active surveillance first, and what would decide it?',
    options: ['Partial nephrectomy', 'Ablation', 'Active surveillance'],
    hoursAgo: 20,
  },
  {
    by: 'member.full@demo.test',
    subspecialty: 'PEDIATRIC',
    title: 'אשך שלא ירד בצד אחד אצל פעוט (מקרה בדוי)',
    ageRange: 'UNDER_18',
    sex: 'MALE',
    history:
      'מקרה בדוי לדוגמה. פעוט שהופנה מרופא הילדים בגלל אשך ימני שלא נמוש בכיס האשכים מאז הלידה. התפתחות תקינה, ללא בעיות רפואיות אחרות.',
    examination: 'אשך שמאלי תקין בכיס האשכים. מימין, אשך שנמוש בתעלה המפשעתית ואינו יורד לכיס.',
    question: 'מתי הייתם מנתחים, והאם יש צורך בבדיקת הדמיה לפני כן?',
    options: ['ניתוח בקרוב, ללא הדמיה', 'אולטרסאונד קודם', 'המתנה ומעקב'],
    hoursAgo: 8,
  },
];

export async function seedDemoCases(prisma: PrismaClient): Promise<void> {
  if (await prisma.clinicalCase.findFirst({ where: { title: MARKER_TITLE } })) {
    console.log('seed: cases layer already present, skipped');
    return;
  }
  const users = new Map(
    (
      await prisma.user.findMany({
        where: { email: { in: [...new Set(CASES.map((c) => c.by))] } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.email, u.id]),
  );
  if (!users.has('member.full@demo.test')) {
    console.log('seed: cases layer needs the demo layer first, skipped');
    return;
  }
  const subspecialties = new Map(
    (await prisma.subspecialty.findMany({ select: { id: true, key: true } })).map((s) => [
      s.key,
      s.id,
    ]),
  );
  const now = Date.now();
  let made = 0;
  await prisma.$transaction(async (tx) => {
    for (const demo of CASES) {
      const authorId = users.get(demo.by);
      const subspecialtyId = subspecialties.get(demo.subspecialty);
      if (!authorId || !subspecialtyId) continue;
      const id = uuidv7();
      const at = new Date(now - demo.hoursAgo * HOUR);
      await tx.clinicalCase.create({
        data: {
          id,
          authorId,
          subspecialtyId,
          title: demo.title,
          ageRange: demo.ageRange,
          sex: demo.sex,
          history: demo.history,
          examination: demo.examination ?? null,
          labs: demo.labs ?? null,
          imaging: demo.imaging ?? null,
          question: demo.question,
          status: 'IN_REVIEW',
          submittedAt: at,
          createdAt: at,
          options: {
            create: demo.options.map((text, i) => ({ id: uuidv7(), position: i + 1, text })),
          },
          steps: {
            create: [
              { id: uuidv7(), action: 'create', toStatus: 'DRAFT', actorUserId: authorId, at },
              {
                id: uuidv7(),
                action: 'submit',
                fromStatus: 'DRAFT',
                toStatus: 'IN_REVIEW',
                actorUserId: authorId,
                at,
              },
            ],
          },
        },
      });
      made++;
    }
  });
  console.log(`seed: cases layer — ${made} cases waiting for review`);
}
