import { uuidv7 } from '@iua/shared';
import { FIRST_ORGANISATION } from './reference-data';
import { type Prisma, type PrismaClient } from '../../src/generated/prisma/client';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { slugify } from '../../src/modules/news/slug';
import { DEMO_PASSWORD } from './demo';

/**
 * Demo events (M5 plan §2.11): an event admin, fictional speakers and events in every state.
 * Everything is made up and says so. Development only (the seed runner refuses production).
 * Runs once: skipped when the demo event admin exists. It follows the people layer, whose
 * members register and attend.
 */
const EVENT_ADMIN_EMAIL = 'events@demo.test';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

interface SessionSeed {
  /** Hours after the event starts. */
  from: number;
  to: number;
  room: string;
  he: string;
  en: string;
  speakers: number[];
}

interface EventSeed {
  key: string;
  /** Days from today (negative: in the past). */
  inDays: number;
  hours: number;
  status: 'PUBLISHED' | 'CANCELLED';
  category: 'conference' | 'course';
  mode: 'INTERNAL' | 'EXTERNAL' | 'NONE';
  capacity?: number;
  tier?: 'PUBLIC' | 'MEMBERS';
  cme?: boolean;
  place: string;
  address: string;
  he: { title: string; summary: string };
  en: { title: string; summary: string };
  sessions?: SessionSeed[];
}

const NOTE_HE = 'אירוע לדוגמה בגרסת ההדגמה. כל הפרטים בו בדויים.';
const NOTE_EN = 'A sample event in the demo version. Every detail in it is fictional.';

const SPEAKERS = [
  {
    he: { name: 'נועם בדוי', title: 'פרופ׳', affiliation: 'מרכז רפואי לדוגמה' },
    en: { name: 'Noam Fictional', title: 'Prof.', affiliation: 'Example Medical Centre' },
  },
  {
    he: { name: 'תמר לדוגמה', title: 'ד״ר', affiliation: 'בית חולים לדוגמה' },
    en: { name: 'Tamar Sample', title: 'Dr.', affiliation: 'Example Hospital' },
  },
  {
    he: { name: 'יואב דמיוני', title: 'ד״ר', affiliation: 'מכון מחקר לדוגמה' },
    en: { name: 'Yoav Imaginary', title: 'Dr.', affiliation: 'Example Research Institute' },
  },
];

const EVENTS: EventSeed[] = [
  {
    key: 'annual',
    inDays: 30,
    hours: 9,
    status: 'PUBLISHED',
    category: 'conference',
    mode: 'INTERNAL',
    capacity: 200,
    cme: true,
    place: 'מרכז הכנסים לדוגמה',
    address: 'רחוב הדוגמה 1, תל אביב',
    he: { title: 'הכנס השנתי לדוגמה (הדגמה)', summary: 'יום עיון מלא עם מושבים ומרצים בדויים.' },
    en: {
      title: 'Sample annual meeting (demo)',
      summary: 'A full day with fictional sessions and speakers.',
    },
    sessions: [
      { from: 0, to: 1, room: 'אולם א', he: 'מושב פתיחה', en: 'Opening session', speakers: [0] },
      {
        from: 1,
        to: 3,
        room: 'אולם א',
        he: 'חידושים באנדואורולוגיה',
        en: 'What is new in endourology',
        speakers: [1, 2],
      },
      {
        from: 2,
        to: 4,
        room: 'אולם ב',
        he: 'סדנה מעשית (חופפת למושב אחר)',
        en: 'Hands-on workshop (overlaps another session)',
        speakers: [2],
      },
      { from: 5, to: 6, room: 'אולם א', he: 'מושב סיכום', en: 'Closing session', speakers: [0] },
    ],
  },
  {
    key: 'workshop',
    inDays: 14,
    hours: 3,
    status: 'PUBLISHED',
    category: 'course',
    mode: 'INTERNAL',
    capacity: 1,
    place: 'חדר הדרכה לדוגמה',
    address: 'שדרות הדוגמה 5, חיפה',
    he: { title: 'סדנה במקומות מוגבלים (הדגמה)', summary: 'מקום אחד בלבד, עם רשימת המתנה.' },
    en: {
      title: 'Workshop with limited places (demo)',
      summary: 'One place only, with a waiting list.',
    },
  },
  {
    key: 'members',
    inDays: 45,
    hours: 2,
    status: 'PUBLISHED',
    category: 'course',
    mode: 'EXTERNAL',
    tier: 'MEMBERS',
    place: 'מפגש מקוון',
    address: '',
    he: { title: 'מפגש לחברים בלבד (הדגמה)', summary: 'רק חברים פעילים רואים את האירוע הזה.' },
    en: { title: 'Members-only meeting (demo)', summary: 'Only active members see this event.' },
  },
  {
    key: 'cancelled',
    inDays: 20,
    hours: 2,
    status: 'CANCELLED',
    category: 'course',
    mode: 'INTERNAL',
    place: 'אולם לדוגמה',
    address: 'רחוב הדוגמה 9, באר שבע',
    he: { title: 'ערב עיון שבוטל (הדגמה)', summary: 'אירוע שבוטל נשאר ברשימה, מסומן.' },
    en: {
      title: 'A cancelled evening meeting (demo)',
      summary: 'A cancelled event stays listed, marked.',
    },
  },
  {
    key: 'past',
    inDays: -30,
    hours: 3,
    status: 'PUBLISHED',
    category: 'conference',
    mode: 'INTERNAL',
    cme: true,
    place: 'מרכז הכנסים לדוגמה',
    address: 'רחוב הדוגמה 1, תל אביב',
    he: { title: 'מפגש שכבר התקיים (הדגמה)', summary: 'אירוע שהתקיים, עם רישום נוכחות.' },
    en: {
      title: 'A past meeting (demo)',
      summary: 'An event that took place, with attendance recorded.',
    },
    sessions: [{ from: 0, to: 2, room: 'אולם א', he: 'הרצאות', en: 'Lectures', speakers: [1] }],
  },
];

export async function seedDemoEvents(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: EVENT_ADMIN_EMAIL } })) {
    console.log('seed: demo events already present, skipped');
    return;
  }
  const user = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
  const [admin, full, resident] = await Promise.all([
    user('admin@demo.test'),
    user('member.full@demo.test'),
    user('member.resident@demo.test'),
  ]);
  if (!admin || !full || !resident) {
    console.log('seed: demo events need the demo people first, skipped');
    return;
  }
  const passwordHash = await new PasswordHasher().hash(DEMO_PASSWORD);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'EVENT_ADMIN' } });
  const now = Date.now();
  // 06:00 UTC is the morning in Israel all year.
  const startOf = (inDays: number) => {
    const day = new Date(now + inDays * DAY);
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 6));
  };

  await prisma.$transaction(
    async (tx) => {
      const eventAdmin = uuidv7();
      await tx.user.create({
        data: {
          id: eventAdmin,
          email: EVENT_ADMIN_EMAIL,
          passwordHash,
          emailVerifiedAt: new Date(now - 60 * DAY),
          verifiedAt: new Date(now - 60 * DAY),
          locale: 'he',
        },
      });
      await tx.profile.create({
        data: {
          userId: eventAdmin,
          firstName: 'Omer',
          lastName: 'Galili',
          nameHe: 'עומר גלילי',
          nameEn: 'Omer Galili',
          position: 'Events coordinator',
          languages: ['he', 'en'],
        },
      });
      await tx.userRole.create({
        data: {
          id: uuidv7(),
          userId: eventAdmin,
          roleId: role.id,
          organisationId: FIRST_ORGANISATION.id,
          grantedBy: admin,
        },
      });

      const categories = {
        conference: await category(tx, 'conference', 'כנסים', 'Conferences', 1),
        course: await category(tx, 'course', 'קורסים והשתלמויות', 'Courses and training', 2),
      };
      const speakerIds: string[] = [];
      for (const speaker of SPEAKERS) {
        const id = uuidv7();
        speakerIds.push(id);
        await tx.speaker.create({
          data: {
            id,
            organisationId: FIRST_ORGANISATION.id,
            translations: {
              create: [
                { locale: 'he', ...speaker.he, bio: 'מרצה בדוי לצורכי ההדגמה.' },
                { locale: 'en', ...speaker.en, bio: 'A fictional speaker for the demo.' },
              ],
            },
          },
        });
      }

      const eventIds = new Map<string, { id: string; sessions: string[]; startAt: Date }>();
      for (const seed of EVENTS) {
        const id = uuidv7();
        const startAt = startOf(seed.inDays);
        const endAt = new Date(startAt.getTime() + seed.hours * HOUR);
        const cancelled = seed.status === 'CANCELLED';
        await tx.event.create({
          data: {
            id,
            organisationId: FIRST_ORGANISATION.id,
            slug: slugify(seed.he.title),
            status: seed.status,
            categoryId: categories[seed.category],
            startAt,
            endAt,
            locationName: seed.place,
            address: seed.address || null,
            organizer: 'Med Connect (demo)',
            registrationMode: seed.mode,
            registrationUrl: seed.mode === 'EXTERNAL' ? 'https://tickets.example.test/demo' : null,
            capacity: seed.capacity ?? null,
            cmeAvailable: seed.cme ?? false,
            accessTier: seed.tier ?? 'PUBLIC',
            publishedAt: new Date(Math.min(now, startAt.getTime()) - 40 * DAY),
            cancelledAt: cancelled ? new Date(now - 2 * DAY) : null,
            cancelReason: cancelled ? 'המקום אינו זמין (סיבה לדוגמה).' : null,
            createdBy: eventAdmin,
            translations: {
              create: [
                { locale: 'he', ...seed.he, description: NOTE_HE },
                { locale: 'en', ...seed.en, description: NOTE_EN },
              ],
            },
          },
        });
        const sessions: string[] = [];
        for (const session of seed.sessions ?? []) {
          const sessionId = uuidv7();
          sessions.push(sessionId);
          await tx.eventSession.create({
            data: {
              id: sessionId,
              eventId: id,
              room: session.room,
              startAt: new Date(startAt.getTime() + session.from * HOUR),
              endAt: new Date(startAt.getTime() + session.to * HOUR),
              translations: {
                create: [
                  { locale: 'he', title: session.he },
                  { locale: 'en', title: session.en },
                ],
              },
              speakers: {
                create: session.speakers.map((index, sortOrder) => ({
                  speakerId: speakerIds[index]!,
                  sortOrder,
                })),
              },
            },
          });
        }
        eventIds.set(seed.key, { id, sessions, startAt });
      }

      const register = (
        key: string,
        userId: string,
        status: 'REGISTERED' | 'WAITLISTED',
        daysAgo: number,
      ) =>
        tx.eventRegistration.create({
          data: {
            id: uuidv7(),
            eventId: eventIds.get(key)!.id,
            userId,
            status,
            queuedAt: new Date(now - daysAgo * DAY),
          },
        });
      const annual = eventIds.get('annual')!;
      const past = eventIds.get('past')!;
      // The annual meeting: a member with two overlapping sessions in their schedule.
      await register('annual', full, 'REGISTERED', 10);
      await tx.scheduleItem.createMany({
        data: [annual.sessions[1]!, annual.sessions[2]!].map((sessionId) => ({
          userId: full,
          sessionId,
        })),
      });
      // The one-place workshop: one registered, one waiting.
      await register('workshop', resident, 'REGISTERED', 6);
      await register('workshop', full, 'WAITLISTED', 5);
      // The past meeting: both attended, one by code and one marked by hand.
      await register('past', full, 'REGISTERED', 50);
      await register('past', resident, 'REGISTERED', 45);
      await tx.eventAttendance.createMany({
        data: [
          {
            id: uuidv7(),
            eventId: past.id,
            userId: full,
            method: 'QR',
            at: new Date(past.startAt.getTime() + 10 * 60 * 1000),
          },
          {
            id: uuidv7(),
            eventId: past.id,
            userId: resident,
            method: 'MANUAL',
            recordedBy: eventAdmin,
            at: new Date(past.startAt.getTime() + 20 * 60 * 1000),
          },
        ],
      });
    },
    { timeout: 60_000 },
  );
  console.log(
    `seed: demo events created (${EVENTS.length} events, ${SPEAKERS.length} speakers, 1 event admin)`,
  );
}

/** A category by key: created once, reused afterwards. */
async function category(
  tx: Tx,
  key: string,
  nameHe: string,
  nameEn: string,
  sortOrder: number,
): Promise<string> {
  const row = await tx.eventCategory.upsert({
    where: { key },
    update: {},
    create: { id: uuidv7(), key, nameHe, nameEn, sortOrder },
  });
  return row.id;
}
