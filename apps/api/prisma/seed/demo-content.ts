import { uuidv7 } from '@medconnect/shared';
import { FIRST_ORGANISATION } from './reference-data';
import { type Prisma, type PrismaClient } from '../../src/generated/prisma/client';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { slugify } from '../../src/modules/news/slug';
import { demoPassword } from '../../src/config/demo-password';

/**
 * Demo content (M3 plan §2.9): a content editor, news items in every workflow state and a few
 * guidelines. Everything is fictional and says so, including the guideline entries (their source
 * is a made-up society on a reserved domain). Real guideline details arrive with the curated
 * import in M4, where each one is checked against its source.
 * Development only (the seed runner refuses production). Runs once: skipped when the demo editor
 * exists. It follows the people layer, whose admin acts as the reviewer.
 */
const EDITOR_EMAIL = 'editor@demo.test';
const ADMIN_EMAIL = 'admin@demo.test';

type Status = 'DRAFT' | 'IN_REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
type Tier = 'PUBLIC' | 'VERIFIED' | 'MEMBERS' | 'TYPES';

interface NewsSeed {
  status: Status;
  category: 'association' | 'education';
  tier?: Tier;
  /** Days before today it was published (published and archived items). */
  publishedDaysAgo?: number;
  tags: string[];
  he: { title: string; summary: string; body: string };
  en?: { title: string; summary: string; body: string };
}

const DEMO_NOTE_HE = 'זוהי ידיעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.';
const DEMO_NOTE_EN = 'This is a sample item in the demo version. Every detail in it is fictional.';

const NEWS: NewsSeed[] = [
  {
    status: 'PUBLISHED',
    category: 'association',
    publishedDaysAgo: 2,
    tags: ['כנס שנתי'],
    he: {
      title: 'נפתחה ההרשמה לכנס השנתי (הדגמה)',
      summary: 'ההרשמה לכנס השנתי של האגודה נפתחה. ידיעה לדוגמה.',
      body: `${DEMO_NOTE_HE}\n\n## מה בתוכנית\n\n- מושבים מדעיים\n- סדנאות מעשיות\n- מפגש מתמחים\n\nפרטים נוספים יפורסמו בהמשך.`,
    },
    en: {
      title: 'Registration opens for the annual meeting (demo)',
      summary: 'Registration for the society’s annual meeting is open. A sample item.',
      body: `${DEMO_NOTE_EN}\n\n## On the programme\n\n- Scientific sessions\n- Hands-on workshops\n- A residents’ meeting\n\nMore details will follow.`,
    },
  },
  {
    status: 'PUBLISHED',
    category: 'education',
    publishedDaysAgo: 9,
    tags: ['מתמחים'],
    he: {
      title: 'סדרת מפגשי לימוד חדשה למתמחים (הדגמה)',
      summary: 'סדרת מפגשים חודשית למתמחים. הידיעה מוצגת בעברית בלבד.',
      body: `${DEMO_NOTE_HE}\n\nהמפגשים יתקיימו אחת לחודש. ידיעה זו נכתבה **בעברית בלבד**, כדי להדגים את ההודעה שמוצגת לקוראים באנגלית.`,
    },
  },
  {
    status: 'PUBLISHED',
    category: 'association',
    tier: 'MEMBERS',
    publishedDaysAgo: 5,
    tags: ['חברים'],
    he: {
      title: 'עדכון לחברי האגודה בלבד (הדגמה)',
      summary: 'ידיעה שרק חברים פעילים יכולים לקרוא.',
      body: `${DEMO_NOTE_HE}\n\nהידיעה הזאת פתוחה לחברים פעילים בלבד. מבקרים ומי שחברותם אינה פעילה לא יראו אותה.`,
    },
    en: {
      title: 'An update for members only (demo)',
      summary: 'An item only active members can read.',
      body: `${DEMO_NOTE_EN}\n\nThis item is open to active members only. Visitors, and people whose membership isn’t active, don’t see it.`,
    },
  },
  {
    status: 'ARCHIVED',
    category: 'association',
    publishedDaysAgo: 200,
    tags: ['כנס שנתי'],
    he: {
      title: 'סיכום הכנס של השנה שעברה (הדגמה)',
      summary: 'ידיעה ישנה שהועברה לארכיון.',
      body: `${DEMO_NOTE_HE}\n\nידיעה בארכיון אינה מופיעה ברשימה, אבל הקישור אליה ממשיך לעבוד.`,
    },
    en: {
      title: 'Summary of last year’s meeting (demo)',
      summary: 'An older item that was archived.',
      body: `${DEMO_NOTE_EN}\n\nAn archived item leaves the list, but its link keeps working.`,
    },
  },
  {
    status: 'SCHEDULED',
    category: 'education',
    tags: ['סדנה'],
    he: {
      title: 'סדנת אנדואורולוגיה: ידיעה מתוזמנת (הדגמה)',
      summary: 'תפורסם אוטומטית בעוד שבוע.',
      body: `${DEMO_NOTE_HE}\n\nהידיעה הזאת אושרה ותוזמנה. היא תפורסם מעצמה במועד שנקבע.`,
    },
    en: {
      title: 'Endourology workshop: a scheduled item (demo)',
      summary: 'It will be published automatically in a week.',
      body: `${DEMO_NOTE_EN}\n\nThis item was approved and scheduled. It publishes itself at the set time.`,
    },
  },
  {
    status: 'IN_REVIEW',
    category: 'association',
    tags: ['ועד האגודה'],
    he: {
      title: 'הודעה מוועד האגודה: ממתינה לבדיקה (הדגמה)',
      summary: 'הוגשה על ידי העורכת וממתינה לאישור.',
      body: `${DEMO_NOTE_HE}\n\nהידיעה הזאת הוגשה לבדיקה. מנהל/ת יכול/ה לפרסם אותה, לתזמן אותה או להחזיר אותה עם הערה.`,
    },
    en: {
      title: 'A note from the board: waiting for review (demo)',
      summary: 'Submitted by the editor and waiting for approval.',
      body: `${DEMO_NOTE_EN}\n\nThis item was submitted for review. An administrator can publish it, schedule it, or send it back with a comment.`,
    },
  },
  {
    status: 'DRAFT',
    category: 'education',
    tags: [],
    he: {
      title: 'טיוטה: יום עיון בנושא אבנים בדרכי השתן (הדגמה)',
      summary: 'טיוטה שעדיין נכתבת.',
      body: `${DEMO_NOTE_HE}\n\nטיוטה. רק העורכים והמנהלים רואים אותה.`,
    },
  },
];

interface GuidelineSeed {
  sourceOrg: string;
  officialUrl: string;
  subspecialty: string;
  status?: 'CURRENT' | 'SUPERSEDED' | 'WITHDRAWN';
  tier?: Tier;
  evidenceLevel?: string;
  titleHe: string;
  titleEn: string;
  summaryHe?: string;
  summaryEn?: string;
  versions: { version: string; publishedOn: string; url?: string; licenseNote?: string }[];
}

const FICTIONAL_SUMMARY_HE = 'רשומה בדויה, שנועדה להדגים את המסך. אין מאחוריה הנחיה אמיתית.';
const FICTIONAL_SUMMARY_EN =
  'A fictional entry that shows how the screen works. No real guideline stands behind it.';

const GUIDELINES: GuidelineSeed[] = [
  {
    sourceOrg: 'Example Urology Society (fictional)',
    officialUrl: 'https://guidelines.example.test/functional',
    subspecialty: 'FUNCTIONAL',
    evidenceLevel: 'Strong',
    titleHe: 'הנחיה לדוגמה באורולוגיה תפקודית (בדויה)',
    titleEn: 'Sample guideline in functional urology (fictional)',
    summaryHe: FICTIONAL_SUMMARY_HE,
    summaryEn: FICTIONAL_SUMMARY_EN,
    versions: [
      {
        version: '2026',
        publishedOn: '2026-03-01',
        url: 'https://guidelines.example.test/functional/2026',
      },
      { version: '2024', publishedOn: '2024-03-01' },
    ],
  },
  {
    sourceOrg: 'Example Urology Society (fictional)',
    officialUrl: 'https://guidelines.example.test/pediatric',
    subspecialty: 'PEDIATRIC',
    status: 'SUPERSEDED',
    titleHe: 'הנחיה לדוגמה שהוחלפה (בדויה)',
    titleEn: 'Sample superseded guideline (fictional)',
    summaryHe: FICTIONAL_SUMMARY_HE,
    summaryEn: FICTIONAL_SUMMARY_EN,
    versions: [{ version: '2019', publishedOn: '2019-06-01' }],
  },
  {
    sourceOrg: 'Example Urology Society (fictional)',
    officialUrl: 'https://guidelines.example.test/members',
    subspecialty: 'COMMUNITY',
    tier: 'VERIFIED',
    titleHe: 'הנחיה לדוגמה לחברים בלבד (בדויה)',
    titleEn: 'Sample members-only guideline (fictional)',
    summaryHe: FICTIONAL_SUMMARY_HE,
    summaryEn: FICTIONAL_SUMMARY_EN,
    versions: [{ version: '1.0', publishedOn: '2026-01-15' }],
  },
  {
    sourceOrg: 'Example Urology Society (fictional)',
    officialUrl: 'https://guidelines.example.test/stones',
    subspecialty: 'UROLITHIASIS',
    status: 'WITHDRAWN',
    titleHe: 'הנחיה לדוגמה שבוטלה (בדויה)',
    titleEn: 'Sample withdrawn guideline (fictional)',
    summaryHe: FICTIONAL_SUMMARY_HE,
    summaryEn: FICTIONAL_SUMMARY_EN,
    versions: [{ version: '2015', publishedOn: '2015-09-01' }],
  },
];

const DAY = 24 * 60 * 60 * 1000;

export async function seedDemoContent(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: EDITOR_EMAIL } })) {
    console.log('seed: demo content already present, skipped');
    return;
  }
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    console.log('seed: demo content needs the demo people first, skipped');
    return;
  }
  const passwordHash = await new PasswordHasher().hash(demoPassword());
  const editorRole = await prisma.role.findUniqueOrThrow({ where: { key: 'CONTENT_EDITOR' } });
  const subspecialties = new Map(
    (await prisma.subspecialty.findMany()).map((s) => [s.key, s.id] as const),
  );
  const now = Date.now();

  await prisma.$transaction(
    async (tx) => {
      const editor = uuidv7();
      await tx.user.create({
        data: {
          id: editor,
          email: EDITOR_EMAIL,
          passwordHash,
          emailVerifiedAt: new Date(now - 60 * DAY),
          verifiedAt: new Date(now - 60 * DAY),
          verifiedAs: 'PHYSICIAN',
          locale: 'he',
        },
      });
      await tx.profile.create({
        data: {
          userId: editor,
          firstName: 'Noa',
          lastName: 'Shalev',
          nameHe: 'נועה שלו',
          nameEn: 'Noa Shalev',
          position: 'Content editor',
          languages: ['he', 'en'],
        },
      });
      // An editor of the organisation's news, and of the platform's library (M16).
      for (const organisationId of [FIRST_ORGANISATION.id, null]) {
        await tx.userRole.create({
          data: {
            id: uuidv7(),
            userId: editor,
            roleId: editorRole.id,
            organisationId,
            grantedBy: admin.id,
          },
        });
      }

      const categories = {
        association: await category(tx, 'association', 'הודעות הארגון', 'Organisation updates', 1),
        education: await category(tx, 'education', 'הוראה והשתלמות', 'Education', 2),
      };

      for (const item of NEWS) {
        const id = uuidv7();
        const published = item.status === 'PUBLISHED' || item.status === 'ARCHIVED';
        const publishedAt = published ? new Date(now - (item.publishedDaysAgo ?? 1) * DAY) : null;
        const submitted = item.status !== 'DRAFT';
        await tx.news.create({
          data: {
            id,
            organisationId: FIRST_ORGANISATION.id,
            slug: slugify(item.he.title),
            status: item.status,
            categoryId: categories[item.category],
            authorUserId: editor,
            submittedBy: submitted ? editor : null,
            accessTier: item.tier ?? 'PUBLIC',
            publishAt: item.status === 'SCHEDULED' ? new Date(now + 7 * DAY) : null,
            publishedAt,
            archivedAt: item.status === 'ARCHIVED' ? new Date(now - 30 * DAY) : null,
            translations: {
              create: [
                { locale: 'he', ...item.he },
                ...(item.en ? [{ locale: 'en', ...item.en }] : []),
              ],
            },
          },
        });
        for (const name of item.tags) {
          const tag = await tx.tag.upsert({
            where: { name },
            update: {},
            create: { id: uuidv7(), name },
          });
          await tx.newsTag.create({ data: { newsId: id, tagId: tag.id } });
        }
        // The history a real item would have, in order.
        const steps: [string, Status | null, Status, string | null][] = [
          ['create', null, 'DRAFT', editor],
          ...(submitted ? [['SUBMIT', 'DRAFT', 'IN_REVIEW', editor] as const] : []),
          ...(item.status === 'SCHEDULED'
            ? [['SCHEDULE', 'IN_REVIEW', 'SCHEDULED', admin.id] as const]
            : []),
          ...(published ? [['PUBLISH', 'IN_REVIEW', 'PUBLISHED', admin.id] as const] : []),
          ...(item.status === 'ARCHIVED'
            ? [['ARCHIVE', 'PUBLISHED', 'ARCHIVED', admin.id] as const]
            : []),
        ].map((step) => [...step] as [string, Status | null, Status, string | null]);
        const start = (publishedAt?.getTime() ?? now) - DAY;
        for (const [index, [action, fromStatus, toStatus, actorUserId]] of steps.entries()) {
          await tx.newsHistory.create({
            data: {
              id: uuidv7(),
              newsId: id,
              action,
              fromStatus,
              toStatus,
              actorUserId,
              at: new Date(start + index * 60 * 60 * 1000),
            },
          });
        }
      }

      for (const item of GUIDELINES) {
        await tx.guideline.create({
          data: {
            id: uuidv7(),
            sourceOrg: item.sourceOrg,
            officialUrl: item.officialUrl,
            evidenceLevel: item.evidenceLevel ?? null,
            status: item.status ?? 'CURRENT',
            subspecialtyId: subspecialties.get(item.subspecialty) ?? null,
            accessTier: item.tier ?? 'PUBLIC',
            translations: {
              create: [
                { locale: 'he', title: item.titleHe, summary: item.summaryHe ?? null },
                { locale: 'en', title: item.titleEn, summary: item.summaryEn ?? null },
              ],
            },
            versions: {
              create: item.versions.map((version) => ({
                id: uuidv7(),
                version: version.version,
                publishedOn: new Date(`${version.publishedOn}T00:00:00.000Z`),
                url: version.url ?? null,
                licenseNote: version.licenseNote ?? null,
              })),
            },
          },
        });
      }
    },
    { timeout: 60_000 },
  );
  console.log(
    `seed: demo content created (${NEWS.length} news items, ${GUIDELINES.length} guidelines, 1 editor)`,
  );
}

/** A category by key: created once, reused afterwards. */
async function category(
  tx: Prisma.TransactionClient,
  key: string,
  nameHe: string,
  nameEn: string,
  sortOrder: number,
): Promise<string> {
  const row = await tx.newsCategory.upsert({
    where: { key },
    update: {},
    create: { id: uuidv7(), key, nameHe, nameEn, sortOrder },
  });
  return row.id;
}
