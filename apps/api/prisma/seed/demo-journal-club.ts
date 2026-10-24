import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';

/**
 * The journal club for the demo (M31 plan §3, owner answer §10.4): three entries about made-up
 * articles, without real PubMed IDs or DOIs, on training and research methods, never clinical
 * advice. October's is published, with its discussion and a few anonymous answers; September's is
 * closed; November's waits for review, so the demo can show publishing it.
 * Development and the hosted demo only. Runs once: skipped when its first entry exists, and when
 * the demo or communities layers are missing. Its own layer, so a hosted demo seeded before M31
 * gets it.
 */
const MARKER_TITLE =
  'Simulator practice before the first console case: a randomised study (fictional sample)';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface DemoEntry {
  subspecialty: string;
  month: string;
  locale: 'he' | 'en';
  status: 'PUBLISHED' | 'ARCHIVED' | 'IN_REVIEW';
  articleTitle: string;
  journal: string;
  year: number;
  summary: string;
  summaryBy: string;
  commentary: string;
  commentaryBy: string;
  keyPoints: string[];
  writtenBy: string;
  publishedBy?: string;
  daysAgo: number;
  votes: ('YES' | 'PERHAPS' | 'NO')[];
  comments: { by: string; body: string }[];
}

const ENTRIES: DemoEntry[] = [
  {
    subspecialty: 'ROBOTIC',
    month: '2026-10',
    locale: 'he',
    status: 'PUBLISHED',
    articleTitle: MARKER_TITLE,
    journal: 'Journal of Imaginary Surgical Education (fictional)',
    year: 2026,
    summary:
      'מאמר בדיוני לדוגמה. מתמחים בשלוש מחלקות חולקו בהגרלה לשתי קבוצות: אחת תרגלה על סימולטור שעתיים בשבוע במשך שלושה חודשים לפני הישיבה הראשונה בקונסולה, והשנייה התחילה בלי תרגול מובנה. המדד העיקרי היה ציון מיומנות שנתן בודק שלא ידע לאיזו קבוצה שייך המתמחה. הקבוצה שתרגלה קיבלה ציונים גבוהים יותר בפעם הראשונה, אבל ההבדל הצטמצם אחרי חמש ישיבות. המדגם קטן, והמחקר לא בדק דבר על מטופלים.',
    summaryBy: 'mentor.rana@demo.test',
    commentary:
      'פרשנות לדוגמה. התוצאה מוכרת מתחומי הדרכה אחרים: תרגול מקדים מקצר את תחילת עקומת הלמידה, ופחות משנה את סופה. השאלה המעניינת למחלקות היא כמה זמן סימולטור אפשר לשריין בפועל בתוך שבוע עבודה, ומי מלווה את התרגול.',
    commentaryBy: 'director.sheba@demo.test',
    keyPoints: [
      'מחקר בדיוני לדוגמה, על הדרכה בלבד',
      'תרגול מקדים שיפר את הציון בפעם הראשונה',
      'ההבדל הצטמצם אחרי חמש ישיבות',
    ],
    writtenBy: 'editor@demo.test',
    publishedBy: 'admin@demo.test',
    daysAgo: 6,
    votes: ['YES', 'YES', 'PERHAPS', 'NO'],
    comments: [
      {
        by: 'member.resident@demo.test',
        body: 'אצלנו הסימולטור פנוי רק בערבים. מישהו מצא דרך לשריין לו זמן קבוע?',
      },
      {
        by: 'mentor.rana@demo.test',
        body: 'קבענו שעה קבועה פעם בשבוע ביום ההדרכה של המתמחים, והיא נשמרת יותר טוב מכל שעה אחרת.',
      },
    ],
  },
  {
    subspecialty: 'URO_ONCOLOGY',
    month: '2026-09',
    locale: 'en',
    status: 'ARCHIVED',
    articleTitle:
      'Structured feedback after tumour board: a before-and-after study (fictional sample)',
    journal: 'Sample Journal of Urology (fictional)',
    year: 2025,
    summary:
      'A made-up article for the demo. A department added five minutes of structured feedback for residents at the end of each tumour board meeting, using a one-page form, and compared residents’ ratings of the meeting before and after. Ratings of “I understood the reasoning behind decisions” went up; attendance did not change. Nothing about patients was measured.',
    summaryBy: 'member.full@demo.test',
    commentary:
      'A sample commentary. The intervention is cheap and easy to copy; the weak point is that the ratings came from the same residents who knew about the change. A comparison with another department would say more.',
    commentaryBy: 'director.rambam@demo.test',
    keyPoints: [
      'A fictional sample study about teaching only',
      'Five minutes of structured feedback, with a one-page form',
      'Self-rated understanding went up; attendance stayed the same',
    ],
    writtenBy: 'editor@demo.test',
    publishedBy: 'admin@demo.test',
    daysAgo: 36,
    votes: ['YES', 'PERHAPS', 'PERHAPS'],
    comments: [
      {
        by: 'mentor.yonatan@demo.test',
        body: 'We tried a similar form; the trick was keeping it to one page.',
      },
    ],
  },
  {
    subspecialty: 'PEDIATRIC',
    month: '2026-11',
    locale: 'en',
    status: 'IN_REVIEW',
    articleTitle: 'Short teaching videos in a paediatric rotation: a survey (fictional sample)',
    journal: 'Examples in Urology (fictional)',
    year: 2026,
    summary:
      'A made-up article for the demo. Residents on a paediatric rotation were offered a set of short teaching videos and asked afterwards how they used them. Most watched them before a session rather than after, and asked for shorter ones.',
    summaryBy: 'mentor.hila@demo.test',
    commentary:
      'A sample commentary. A survey of one rotation says little on its own, but the finding that videos are watched beforehand is worth testing elsewhere.',
    commentaryBy: 'mentor.hila@demo.test',
    keyPoints: ['A fictional sample survey about teaching only'],
    writtenBy: 'editor@demo.test',
    daysAgo: 1,
    votes: [],
    comments: [],
  },
];

const VOTERS = [
  'member.full@demo.test',
  'member.resident@demo.test',
  'mentor.yonatan@demo.test',
  'mentor.hila@demo.test',
];

const DISCUSSION: Record<'he' | 'en', { title: string; intro: string }> = {
  he: {
    title: 'מועדון עיתונות: {title}',
    intro: 'הרשומה של החודש במועדון העיתונות. הדיון עליה כאן.',
  },
  en: {
    title: 'Journal club: {title}',
    intro: 'This month’s journal club entry. Discuss it here.',
  },
};

export async function seedDemoJournalClub(prisma: PrismaClient): Promise<void> {
  if (await prisma.journalClubEntry.findFirst({ where: { articleTitle: MARKER_TITLE } })) {
    console.log('seed: journal club layer already present, skipped');
    return;
  }
  const emails = [
    ...new Set([
      ...ENTRIES.flatMap((e) => [
        e.summaryBy,
        e.commentaryBy,
        e.writtenBy,
        ...(e.publishedBy ? [e.publishedBy] : []),
        ...e.comments.map((c) => c.by),
      ]),
      ...VOTERS,
    ]),
  ];
  const users = new Map(
    (
      await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.email, u.id]),
  );
  if (!users.has('editor@demo.test')) {
    console.log('seed: journal club layer needs the demo layer first, skipped');
    return;
  }
  const subspecialties = new Map(
    (
      await prisma.subspecialty.findMany({
        select: { id: true, key: true, community: { select: { id: true, archivedAt: true } } },
      })
    ).map((s) => [s.key, s]),
  );
  const now = Date.now();
  let made = 0;
  await prisma.$transaction(async (tx) => {
    for (const entry of ENTRIES) {
      const subspecialty = subspecialties.get(entry.subspecialty);
      const community = subspecialty?.community;
      if (!subspecialty || (entry.status !== 'IN_REVIEW' && (!community || community.archivedAt))) {
        continue;
      }
      const id = uuidv7();
      const at = new Date(now - entry.daysAgo * DAY);
      const summaryAuthorId = users.get(entry.summaryBy) ?? null;
      const writer = users.get(entry.writtenBy) ?? null;
      const publisher = entry.publishedBy ? (users.get(entry.publishedBy) ?? null) : null;
      let postId: string | null = null;
      if (entry.status !== 'IN_REVIEW' && community) {
        postId = uuidv7();
        const texts = DISCUSSION[entry.locale];
        await tx.post.create({
          data: {
            id: postId,
            communityId: community.id,
            authorId: summaryAuthorId,
            kind: 'DISCUSSION',
            title: texts.title.replace('{title}', entry.articleTitle).slice(0, 200),
            body: `${texts.intro}\n\n${entry.summary}`,
            activityAt: new Date(at.getTime() + entry.comments.length * HOUR),
            commentCount: entry.comments.length,
            createdAt: at,
            ...(summaryAuthorId ? { follows: { create: { userId: summaryAuthorId } } } : {}),
          },
        });
        for (const [i, comment] of entry.comments.entries()) {
          const authorId = users.get(comment.by);
          if (!authorId) continue;
          await tx.postComment.create({
            data: {
              id: uuidv7(),
              postId,
              authorId,
              body: comment.body,
              createdAt: new Date(at.getTime() + (i + 1) * HOUR),
            },
          });
        }
      }
      await tx.journalClubEntry.create({
        data: {
          id,
          subspecialtyId: subspecialty.id,
          month: new Date(`${entry.month}-01T00:00:00Z`),
          locale: entry.locale,
          articleTitle: entry.articleTitle,
          articleAuthors: 'Fictional authors',
          journal: entry.journal,
          year: entry.year,
          summary: entry.summary,
          summaryAuthorId,
          commentary: entry.commentary,
          commentaryAuthorId: users.get(entry.commentaryBy) ?? null,
          keyPoints: entry.keyPoints,
          status: entry.status,
          createdBy: writer,
          submittedBy: writer,
          publishedBy: publisher,
          publishedAt: entry.status === 'IN_REVIEW' ? null : at,
          postId,
          createdAt: at,
          history: {
            create: [
              { id: uuidv7(), action: 'create', toStatus: 'DRAFT', actorUserId: writer, at },
              {
                id: uuidv7(),
                action: 'submit',
                fromStatus: 'DRAFT',
                toStatus: 'IN_REVIEW',
                actorUserId: writer,
                at,
              },
              ...(entry.status === 'IN_REVIEW'
                ? []
                : [
                    {
                      id: uuidv7(),
                      action: 'publish',
                      fromStatus: 'IN_REVIEW' as const,
                      toStatus: 'PUBLISHED' as const,
                      actorUserId: publisher,
                      at,
                    },
                  ]),
              ...(entry.status === 'ARCHIVED'
                ? [
                    {
                      id: uuidv7(),
                      action: 'archive',
                      fromStatus: 'PUBLISHED' as const,
                      toStatus: 'ARCHIVED' as const,
                      actorUserId: publisher,
                      at: new Date(at.getTime() + 30 * DAY),
                    },
                  ]
                : []),
            ],
          },
        },
      });
      for (const [i, answer] of entry.votes.entries()) {
        const userId = users.get(VOTERS[i % VOTERS.length]!);
        if (userId) await tx.journalClubVote.create({ data: { entryId: id, userId, answer } });
      }
      made++;
    }
  });
  console.log(`seed: journal club layer — ${made} entries`);
}
