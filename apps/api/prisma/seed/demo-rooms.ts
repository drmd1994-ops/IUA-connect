import { uuidv7 } from '@iua/shared';
import { type Prisma, type PrismaClient } from '../../src/generated/prisma/client';

/**
 * Demo chat rooms (M12 plan §2.17): five categories and six rooms with messages in Hebrew and
 * English, reactions, a reply, a mention, a pinned announcement, a moderator, a message a
 * moderator removed, a ban and a reported room message waiting for review. Everything is
 * fictional and says so; nothing in it is medical. Development only (the seed runner refuses
 * production). Runs once: skipped when a room already exists. It follows the demo chat, whose
 * people it uses.
 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Who = 'full' | 'honorary' | 'resident';

interface Line {
  from: Who;
  body: string;
  /** How long ago it was sent. */
  ago: number;
  announcement?: boolean;
  /** The number of the line this one answers, from 1. */
  replyTo?: number;
  mentions?: Who[];
  reactions?: [Who, string][];
  /** Removed by the room's moderator. */
  removed?: boolean;
  pinned?: boolean;
}

interface RoomSeed {
  nameHe: string;
  nameEn: string;
  descriptionHe: string;
  descriptionEn: string;
  category: string;
  moderatorsOnly?: boolean;
  /** Who is in the room, and how far each has read (all of it when left out). */
  people: Partial<Record<Who, { read?: number; moderator?: boolean; muted?: boolean }>>;
  lines: Line[];
}

const CATEGORIES = [
  { key: 'GENERAL', nameHe: 'כללי', nameEn: 'General' },
  { key: 'ASSOCIATION', nameHe: 'האיגוד', nameEn: 'The association' },
  { key: 'PROFESSIONAL', nameHe: 'מקצועי', nameEn: 'Professional' },
  { key: 'CONFERENCES', nameHe: 'כנסים ואירועים', nameEn: 'Conferences and events' },
  { key: 'RESIDENTS', nameHe: 'מתמחים', nameEn: 'Residents' },
];

const ROOMS: RoomSeed[] = [
  {
    nameHe: 'כללי',
    nameEn: 'General',
    descriptionHe: 'שיחה חופשית בין חברי האיגוד. (חדר לדוגמה בגרסת ההדגמה.)',
    descriptionEn: 'Open conversation between the members. (A sample room in the demo version.)',
    category: 'GENERAL',
    people: { full: { read: 3, moderator: true }, honorary: {}, resident: {} },
    lines: [
      {
        from: 'honorary',
        body: 'בוקר טוב לכולם! (הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.)',
        ago: 2 * DAY,
        reactions: [
          ['full', 'like'],
          ['resident', 'like'],
        ],
      },
      { from: 'full', body: 'בוקר טוב. מי מגיע למפגש החברים בחודש הבא?', ago: 2 * DAY - HOUR },
      {
        from: 'resident',
        body: 'I will be there. Is there parking near the hall?',
        ago: DAY,
        replyTo: 2,
      },
      {
        from: 'honorary',
        body: 'There is a car park behind the building, free for members.',
        ago: 5 * HOUR,
        replyTo: 3,
        reactions: [['resident', 'thanks']],
      },
      { from: 'resident', body: 'תודה רבה!', ago: 90 * MINUTE },
    ],
  },
  {
    nameHe: 'הודעות האיגוד',
    nameEn: 'Announcements',
    descriptionHe: 'הודעות מטעם האיגוד. רק מנהלי החדר כותבים כאן. (חדר לדוגמה.)',
    descriptionEn: 'Notices from the association. Only moderators write here. (A sample room.)',
    category: 'ASSOCIATION',
    moderatorsOnly: true,
    people: { full: { moderator: true }, honorary: {}, resident: { read: 1 } },
    lines: [
      {
        from: 'full',
        body: 'ברוכים הבאים לחדר ההודעות של האיגוד. (הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.)',
        ago: 6 * DAY,
        pinned: true,
      },
      {
        from: 'full',
        body: 'ההרשמה למפגש החברים השנתי נפתחה. Registration for the annual members’ meeting is open.',
        ago: 4 * HOUR,
        announcement: true,
        pinned: true,
        reactions: [
          ['honorary', 'check'],
          ['resident', 'like'],
        ],
      },
    ],
  },
  {
    nameHe: 'שאלות ותשובות',
    nameEn: 'Questions and answers',
    descriptionHe:
      'שאלות על האתר, על החברות ועל פעילות האיגוד. לא לשאלות על מטופלים. (חדר לדוגמה.)',
    descriptionEn:
      'Questions about the site, membership and the association’s activity. Not for questions about patients. (A sample room.)',
    category: 'GENERAL',
    people: { full: { moderator: true }, resident: {} },
    lines: [
      {
        from: 'resident',
        body: 'Where do I update my workplace on the site? (A sample message in the demo version. Every detail in it is fictional.)',
        ago: 3 * DAY,
      },
      {
        from: 'full',
        body: '@Yoav Sela under “My account”, then “Profile”.',
        ago: 3 * DAY - 20 * MINUTE,
        replyTo: 1,
        mentions: ['resident'],
        reactions: [['resident', 'thanks']],
      },
      {
        from: 'honorary',
        body: 'A special price on conference posters, this week only!',
        ago: 9 * HOUR,
        removed: true,
      },
      { from: 'resident', body: 'מתי נשלחת תזכורת על חידוש החברות?', ago: 2 * HOUR },
    ],
  },
  {
    nameHe: 'דיון מקצועי',
    nameEn: 'Professional discussion',
    descriptionHe:
      'דיון על ספרות מקצועית, הנחיות והכשרה. בלי פרטים מזהים של מטופלים. (חדר לדוגמה.)',
    descriptionEn:
      'Discussion of the literature, guidelines and training. No identifying details of patients. (A sample room.)',
    category: 'PROFESSIONAL',
    people: { full: { read: 1 }, honorary: {}, resident: {} },
    lines: [
      {
        from: 'honorary',
        body: 'מי מוכן להציג מאמר במועדון הקריאה של החודש הבא? (הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.)',
        ago: 30 * HOUR,
      },
      {
        from: 'resident',
        body: 'I can present. Which week suits everyone?',
        ago: 28 * HOUR,
        reactions: [['honorary', 'like']],
      },
      {
        from: 'honorary',
        body: 'Buy my poster templates, a discount for whoever writes to me today! (A sample message in the demo version, written to show a report.)',
        ago: 7 * HOUR,
      },
    ],
  },
  {
    nameHe: 'כנסים ואירועים',
    nameEn: 'Conferences and events',
    descriptionHe: 'תיאום נסיעות, הצעות למושבים ורשמים מכנסים. (חדר לדוגמה.)',
    descriptionEn:
      'Travel arrangements, session ideas and impressions from meetings. (A sample room.)',
    category: 'CONFERENCES',
    people: { honorary: {}, resident: {} },
    lines: [
      {
        from: 'honorary',
        body: 'Is anyone driving from Haifa to the spring meeting? (A sample message in the demo version. Every detail in it is fictional.)',
        ago: 4 * DAY,
      },
      { from: 'resident', body: 'כן, יש לי שני מקומות ברכב.', ago: 4 * DAY - 2 * HOUR },
    ],
  },
  {
    nameHe: 'מתמחים',
    nameEn: 'Residents',
    descriptionHe: 'חדר למתמחים: בחינות, תורנויות וחומרי לימוד. (חדר לדוגמה.)',
    descriptionEn: 'A room for residents: exams, rotas and study material. (A sample room.)',
    category: 'RESIDENTS',
    people: { resident: {} },
    lines: [
      {
        from: 'resident',
        body: 'מישהו רוצה להקים קבוצת לימוד לקראת הבחינה? (הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.)',
        ago: 5 * DAY,
      },
    ],
  },
];

export async function seedDemoRooms(prisma: PrismaClient): Promise<void> {
  const user = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
  const [admin, full, honorary, resident] = await Promise.all([
    user('admin@demo.test'),
    user('member.full@demo.test'),
    user('member.honorary@demo.test'),
    user('member.resident@demo.test'),
  ]);
  if (!admin || !full || !honorary || !resident) {
    console.log('seed: demo rooms need the demo people first, skipped');
    return;
  }
  const ids: Record<Who, string> = { full, honorary, resident };
  if (await prisma.conversation.findFirst({ where: { kind: 'ROOM' } })) {
    console.log('seed: demo rooms already present, skipped');
    return;
  }
  const spam = await prisma.chatReportCategory.findUnique({ where: { key: 'SPAM' } });
  if (!spam) {
    console.log('seed: demo rooms need the reference layer first, skipped');
    return;
  }
  const now = Date.now();

  const room = async (tx: Prisma.TransactionClient, seed: RoomSeed, categoryId: string) => {
    const id = uuidv7();
    const first = seed.lines[0]!;
    const last = seed.lines.at(-1)!;
    const people = Object.entries(seed.people) as [Who, NonNullable<RoomSeed['people'][Who]>][];
    await tx.conversation.create({
      data: {
        id,
        kind: 'ROOM',
        nameHe: seed.nameHe,
        nameEn: seed.nameEn,
        descriptionHe: seed.descriptionHe,
        descriptionEn: seed.descriptionEn,
        categoryId,
        moderatorsOnly: seed.moderatorsOnly ?? false,
        createdBy: admin,
        memberCount: people.length,
        lastSeq: seed.lines.length,
        lastMessageAt: new Date(now - last.ago),
        createdAt: new Date(now - first.ago - HOUR),
        members: {
          create: people.map(([who, mine]) => ({
            userId: ids[who],
            role: mine.moderator ? ('MODERATOR' as const) : ('MEMBER' as const),
            joinedAt: new Date(now - first.ago - HOUR),
            lastReadSeq: mine.read ?? seed.lines.length,
            lastDeliveredSeq: seed.lines.length,
            muted: mine.muted ?? false,
          })),
        },
      },
    });
    const moderator = people.find(([, mine]) => mine.moderator)?.[0];
    const messageIds = seed.lines.map((line) => uuidv7(now - line.ago));
    const messages = seed.lines.map((line, index) => ({
      id: messageIds[index]!,
      conversationId: id,
      seq: index + 1,
      senderId: ids[line.from],
      body: line.removed ? '' : line.body,
      createdAt: new Date(now - line.ago),
      announcement: line.announcement ?? false,
      mentions: (line.mentions ?? []).map((who) => ids[who]),
      replyToId: line.replyTo ? messageIds[line.replyTo - 1]! : null,
      deletedAt: line.removed ? new Date(now - line.ago + 30 * MINUTE) : null,
      removedBy: line.removed && moderator ? ids[moderator] : null,
    }));
    await tx.message.createMany({ data: messages });
    await tx.messageReaction.createMany({
      data: seed.lines.flatMap((line, index) =>
        (line.reactions ?? []).map(([who, reaction]) => ({
          messageId: messageIds[index]!,
          userId: ids[who],
          reaction,
          createdAt: new Date(now - line.ago + 10 * MINUTE),
        })),
      ),
    });
    if (moderator) {
      await tx.messagePin.createMany({
        data: seed.lines.flatMap((line, index) =>
          line.pinned
            ? [
                {
                  conversationId: id,
                  messageId: messageIds[index]!,
                  pinnedBy: ids[moderator],
                  createdAt: new Date(now - line.ago + 5 * MINUTE),
                },
              ]
            : [],
        ),
      });
    }
    return { id, messages, lines: seed.lines };
  };

  await prisma.$transaction(
    async (tx) => {
      const categoryIds = new Map<string, string>();
      for (const [index, category] of CATEGORIES.entries()) {
        const row = await tx.chatRoomCategory.upsert({
          where: { key: category.key },
          update: {},
          create: { id: uuidv7(), ...category, sortOrder: index + 1 },
        });
        categoryIds.set(category.key, row.id);
      }
      const made = [];
      for (const seed of ROOMS) made.push(await room(tx, seed, categoryIds.get(seed.category)!));
      const [, , questions, professional] = made;

      // The advertiser was removed from "Questions and answers" and banned from it for a week.
      await tx.conversationBan.create({
        data: {
          id: uuidv7(),
          conversationId: questions!.id,
          userId: honorary,
          createdBy: full,
          reason: 'Advertising in the room. (A sample ban in the demo version.)',
          startsAt: new Date(now - 8 * HOUR),
          endsAt: new Date(now - 8 * HOUR + 7 * DAY),
        },
      });

      // The same kind of message in another room, reported and waiting for the staff.
      const reported = professional!.messages.at(-1)!;
      await tx.chatReport.create({
        data: {
          id: uuidv7(),
          reporterId: resident,
          reportedUserId: honorary,
          conversationId: professional!.id,
          messageId: reported.id,
          categoryId: spam.id,
          description: 'Advertising in a room. (A sample report in the demo version.)',
          snapshot: professional!.messages.map((message) => ({
            seq: message.seq,
            senderId: message.senderId,
            body: message.body,
            deleted: false,
            createdAt: message.createdAt.toISOString(),
            reported: message.id === reported.id,
          })),
          createdAt: new Date(now - 6 * HOUR),
        },
      });
    },
    { timeout: 60_000 },
  );
  console.log(
    `seed: demo rooms created (${CATEGORIES.length} categories, ${ROOMS.length} rooms, 1 ban, 1 report waiting)`,
  );
}
