import { uuidv7 } from '@medconnect/shared';
import { FIRST_ORGANISATION } from './reference-data';
import { type PrismaClient } from '../../src/generated/prisma/client';
import { demoPassword } from '../../src/config/demo-password';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { DEMO_CONFERENCE_SLUG } from '../../src/modules/events/conference.service';

/**
 * The demo's conference (M32 plan §4): a made-up conference with made-up speakers, a chair and a
 * moderator. Its polls wait as drafts, so nothing is shown until the chair opens one; they ask
 * about the conference, not about medicine. "Start the demonstration" in the event's admin page
 * moves its sessions to now, so "now" always has something on.
 * Development and the hosted demo only. Runs once: skipped when the conference exists.
 */
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const SESSIONS = [
  {
    from: 0,
    to: 45,
    room: 'A',
    he: 'פתיחה: מה חדש השנה (מושב לדוגמה)',
    en: "Opening: what's new this year (sample session)",
    polls: [
      {
        question: { he: 'מאיפה הגעת היום?', en: 'Where did you come from today?' },
        options: [
          { he: 'צפון', en: 'North' },
          { he: 'מרכז', en: 'Centre' },
          { he: 'דרום', en: 'South' },
        ],
      },
      {
        question: {
          he: 'איזה חלק בכנס מעניין אותך במיוחד?',
          en: 'Which part of the conference interests you most?',
        },
        options: [
          { he: 'הרצאות', en: 'Talks' },
          { he: 'סדנאות', en: 'Workshops' },
          { he: 'מפגשים עם עמיתים', en: 'Meeting colleagues' },
        ],
      },
    ],
  },
  {
    from: 50,
    to: 110,
    room: 'A',
    he: 'רב-שיח: הכשרת מתמחים (מושב לדוגמה)',
    en: 'Panel: training residents (sample session)',
    polls: [
      {
        question: {
          he: 'כמה זמן בשבוע מוקדש אצלכם להוראה?',
          en: 'How much time a week goes to teaching where you work?',
        },
        options: [
          { he: 'פחות משעתיים', en: 'Under two hours' },
          { he: 'שעתיים עד חמש', en: 'Two to five hours' },
          { he: 'יותר מחמש', en: 'Over five hours' },
        ],
      },
    ],
  },
  {
    from: 50,
    to: 110,
    room: 'B',
    he: 'סדנה: הצגת מקרה טובה (מושב לדוגמה)',
    en: 'Workshop: presenting a case well (sample session)',
    polls: [],
  },
  {
    from: 120,
    to: 165,
    room: 'A',
    he: 'סיכום הכנס (מושב לדוגמה)',
    en: 'Closing the conference (sample session)',
    polls: [],
  },
];

export async function seedDemoConference(prisma: PrismaClient): Promise<void> {
  if (await prisma.event.findUnique({ where: { slug: DEMO_CONFERENCE_SLUG } })) {
    console.log('seed: demo conference already present, skipped');
    return;
  }
  const user = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
  const [eventAdmin, full, resident] = await Promise.all([
    user('events@demo.test'),
    user('member.full@demo.test'),
    user('member.resident@demo.test'),
  ]);
  if (!eventAdmin || !full || !resident) {
    console.log('seed: the demo conference needs the demo people first, skipped');
    return;
  }
  const speakers = await prisma.speaker.findMany({
    where: { organisationId: FIRST_ORGANISATION.id },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 3,
  });
  const passwordHash = await new PasswordHasher().hash(demoPassword());
  const category = await prisma.eventCategory.findUnique({ where: { key: 'conference' } });
  const now = Date.now();
  const startAt = new Date(now - 10 * MINUTE);
  const last = SESSIONS.at(-1)!;

  await prisma.$transaction(async (tx) => {
    const staff = async (
      email: string,
      firstName: string,
      lastName: string,
      nameHe: string,
      position: string,
    ) => {
      const id = uuidv7();
      await tx.user.create({
        data: {
          id,
          email,
          passwordHash,
          emailVerifiedAt: new Date(now - 60 * DAY),
          verifiedAt: new Date(now - 60 * DAY),
          verifiedAs: 'PHYSICIAN',
          locale: 'he',
        },
      });
      await tx.profile.create({
        data: {
          userId: id,
          firstName,
          lastName,
          nameHe,
          nameEn: `${firstName} ${lastName}`,
          position,
          languages: ['he', 'en'],
        },
      });
      return id;
    };
    const chair = await staff('chair@demo.test', 'Dana', 'Example', 'דנה לדוגמה', 'Session chair');
    const moderator = await staff(
      'moderator@demo.test',
      'Yoav',
      'Sample',
      'יואב בדוי',
      'Questions moderator',
    );

    const eventId = uuidv7();
    await tx.event.create({
      data: {
        id: eventId,
        organisationId: FIRST_ORGANISATION.id,
        slug: DEMO_CONFERENCE_SLUG,
        status: 'PUBLISHED',
        categoryId: category?.id ?? null,
        startAt,
        endAt: new Date(startAt.getTime() + last.to * MINUTE),
        locationName: 'מרכז כנסים לדוגמה',
        organizer: 'Med Connect (demo)',
        registrationMode: 'INTERNAL',
        accessTier: 'PUBLIC',
        publishedAt: new Date(now - 30 * DAY),
        createdBy: eventAdmin,
        translations: {
          create: [
            {
              locale: 'he',
              title: 'כנס לדוגמה',
              summary: 'כנס בדוי בגרסת ההדגמה, עם לוח זמנים, סקרים ושאלות מהקהל.',
              description: 'כנס לדוגמה בגרסת ההדגמה. כל הפרטים בו בדויים.',
            },
            {
              locale: 'en',
              title: 'Sample conference',
              summary: 'A made-up conference in the demo, with a programme, polls and questions.',
              description:
                'A sample conference in the demo version. Every detail in it is fictional.',
            },
          ],
        },
      },
    });

    const sessionIds: string[] = [];
    for (const [index, session] of SESSIONS.entries()) {
      const id = uuidv7();
      sessionIds.push(id);
      await tx.eventSession.create({
        data: {
          id,
          eventId,
          room: session.room,
          startAt: new Date(startAt.getTime() + session.from * MINUTE),
          endAt: new Date(startAt.getTime() + session.to * MINUTE),
          translations: {
            create: [
              { locale: 'he', title: session.he },
              { locale: 'en', title: session.en },
            ],
          },
          speakers: {
            create: speakers[index % Math.max(speakers.length, 1)]
              ? [{ speakerId: speakers[index % speakers.length]!.id, sortOrder: 0 }]
              : [],
          },
          staff: {
            create: [
              { userId: chair, role: 'CHAIR' },
              { userId: moderator, role: 'MODERATOR' },
            ],
          },
        },
      });
      for (const poll of session.polls) {
        // The demo's language is Hebrew; a poll is shown in the language it was written in.
        await tx.poll.create({
          data: {
            id: uuidv7(),
            sessionId: id,
            question: poll.question.he,
            options: {
              create: poll.options.map((option, sortOrder) => ({
                id: uuidv7(),
                text: option.he,
                sortOrder,
              })),
            },
          },
        });
      }
    }

    for (const userId of [full, resident]) {
      await tx.eventRegistration.create({
        data: { id: uuidv7(), eventId, userId, status: 'REGISTERED' },
      });
      await tx.scheduleItem.createMany({
        data: [sessionIds[0]!, sessionIds[1]!].map((sessionId) => ({ userId, sessionId })),
      });
    }
  });
  console.log('seed: demo conference ready (chair@demo.test, moderator@demo.test)');
}
