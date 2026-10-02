import { uuidv7 } from '@iua/shared';
import { type Prisma, type PrismaClient } from '../../src/generated/prisma/client';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { DEMO_PASSWORD } from './demo';

/**
 * Demo notifications, directory and broadcasts (M7 plan §2.9). A second association admin, so
 * the two-admin approval can be shown; members listed in the directory with different visible
 * fields; notices of every kind for the demo members; one broadcast waiting for approval and
 * one that was sent. Everything is fictional and says so.
 * Development only (the seed runner refuses production). Runs once: skipped when the second
 * admin exists. It follows the people, content, events and education layers.
 */
const SECOND_ADMIN_EMAIL = 'admin2@demo.test';
const DIRECTORY_CONSENT_VERSION = 'directory-2026-10';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOTE_HE = 'הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.';
const NOTE_EN = 'A sample message in the demo version. Every detail in it is fictional.';

type Tx = Prisma.TransactionClient;
type Field = 'TITLE' | 'POSITION' | 'INSTITUTION' | 'SUBSPECIALTIES' | 'NAME_HE' | 'BIO';

/** Who joins the directory, and what each of them shows to members. */
const LISTED: { email: string; shows: Field[]; bio?: string }[] = [
  {
    email: 'member.full@demo.test',
    shows: ['NAME_HE', 'TITLE', 'POSITION', 'INSTITUTION', 'BIO'],
    bio: 'A fictional member profile for the demo. Nothing here describes a real person.',
  },
  { email: 'member.honorary@demo.test', shows: ['NAME_HE', 'TITLE'] },
  // Name only: listed, with every other field kept private.
  { email: 'member.resident@demo.test', shows: [] },
];

export async function seedDemoNotifications(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: SECOND_ADMIN_EMAIL } })) {
    console.log('seed: demo notifications already present, skipped');
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
    console.log('seed: demo notifications need the demo people first, skipped');
    return;
  }
  const passwordHash = await new PasswordHasher().hash(DEMO_PASSWORD);
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'IUA_ADMIN' } });
  const [news, event, lesson, guideline] = await Promise.all([
    prisma.news.findFirst({
      where: { status: 'PUBLISHED', accessTier: 'PUBLIC', revisionOfId: null, sourceUrl: null },
      orderBy: { publishedAt: 'desc' },
      include: { translations: true },
    }),
    prisma.event.findFirst({
      where: { status: 'PUBLISHED', accessTier: 'PUBLIC', sourceUrl: null },
      orderBy: { startAt: 'desc' },
      include: { translations: true },
    }),
    prisma.educationItem.findUnique({
      where: { slug: 'demo-article' },
      include: { translations: true },
    }),
    prisma.guideline.findFirst({
      where: { status: 'CURRENT', accessTier: 'PUBLIC', sourceUrl: null },
      include: { translations: true },
    }),
  ]);
  const now = Date.now();
  let listed = 0;
  let announced = 0;

  await prisma.$transaction(
    async (tx) => {
      const secondAdmin = uuidv7();
      await tx.user.create({
        data: {
          id: secondAdmin,
          email: SECOND_ADMIN_EMAIL,
          passwordHash,
          emailVerifiedAt: new Date(now - 60 * DAY),
          locale: 'he',
        },
      });
      await tx.profile.create({
        data: {
          userId: secondAdmin,
          firstName: 'Yael',
          lastName: 'Tzur',
          nameHe: 'יעל צור',
          nameEn: 'Yael Tzur',
          position: 'Association secretary',
          languages: ['he', 'en'],
        },
      });
      await tx.userRole.create({
        data: { id: uuidv7(), userId: secondAdmin, roleId: adminRole.id, grantedBy: admin },
      });

      // The directory: three members, each showing something different.
      for (const entry of LISTED) {
        const profile = await tx.profile.findFirst({
          where: { user: { email: entry.email } },
          select: { userId: true },
        });
        if (!profile) continue;
        listed += 1;
        await tx.profile.update({
          where: { userId: profile.userId },
          data: { directoryOptIn: true, ...(entry.bio ? { bio: entry.bio } : {}) },
        });
        await tx.consent.create({
          data: {
            id: uuidv7(),
            userId: profile.userId,
            kind: 'DIRECTORY',
            version: DIRECTORY_CONSENT_VERSION,
            grantedAt: new Date(now - 20 * DAY),
          },
        });
        await tx.profileFieldVisibility.deleteMany({
          where: { userId: profile.userId, field: { in: ['INSTITUTION', ...entry.shows] } },
        });
        if (entry.shows.length > 0) {
          await tx.profileFieldVisibility.createMany({
            data: entry.shows.map((field) => ({
              userId: profile.userId,
              field,
              visibility: 'MEMBERS' as const,
            })),
          });
        }
      }

      // What was "newly published": one announcement per kind of content, already summarised.
      const announce = async (
        entityType: string,
        kind: 'NEWS' | 'NEW_EVENTS' | 'EDUCATION' | 'GUIDELINES',
        type: string,
        item: { id: string; translations: { locale: string; title: string }[] } | null,
        link: string | null,
        order: number,
      ) => {
        if (!item || !link) return;
        const title = (locale: string) =>
          item.translations.find((t) => t.locale === locale)?.title ?? null;
        if (!title('he') && !title('en')) return;
        announced += 1;
        await tx.contentAnnouncement.create({
          data: {
            id: uuidv7(),
            entityType,
            entityId: item.id,
            kind,
            type,
            titleHe: title('he'),
            titleEn: title('en'),
            link,
            accessTier: 'PUBLIC',
            // A person sees announcements made since their account exists, and on a fresh
            // database the demo accounts were created moments ago: so these are dated now.
            createdAt: new Date(now - order),
            digestedAt: new Date(now - order),
          },
        });
      };
      await announce('news', 'NEWS', 'contentNews', news, news && `/news/${news.slug}`, 0);
      await announce(
        'event',
        'NEW_EVENTS',
        'contentEvent',
        event,
        event && `/events/${event.slug}`,
        1,
      );
      await announce(
        'education',
        'EDUCATION',
        'contentEducation',
        lesson,
        lesson && `/education/${lesson.slug}`,
        2,
      );
      await announce(
        'guideline',
        'GUIDELINES',
        'contentGuideline',
        guideline,
        guideline && `/guidelines/${guideline.id}`,
        3,
      );

      // Personal notices for the two demo members.
      const notice = (
        userId: string,
        kind: 'ACCOUNT' | 'MY_EVENTS',
        type: string,
        params: Record<string, string>,
        link: string | null,
        hoursAgo: number,
        read = false,
      ) =>
        tx.notification.create({
          data: {
            id: uuidv7(),
            userId,
            kind,
            type,
            params,
            link,
            createdAt: new Date(now - hoursAgo * HOUR),
            readAt: read ? new Date(now - (hoursAgo - 1) * HOUR) : null,
          },
        });
      const eventTitle = event?.translations.find((t) => t.locale === 'he')?.title;
      for (const userId of [full, resident]) {
        await notice(
          userId,
          'ACCOUNT',
          'membershipApproved',
          { typeName: 'חברות (הדגמה)', endDate: '' },
          '/account/membership',
          24 * 30,
          true,
        );
      }
      if (event && eventTitle) {
        await notice(
          full,
          'MY_EVENTS',
          'eventRegistered',
          { title: eventTitle, when: '', place: '', reason: '' },
          `/events/${event.slug}`,
          24 * 10,
          true,
        );
        await notice(
          full,
          'MY_EVENTS',
          'eventChanged',
          { title: eventTitle, when: '', place: '', reason: '' },
          `/events/${event.slug}`,
          30,
        );
      }

      // A message that was sent (written by the first admin, approved by the second)…
      const sentAt = new Date(now - 3 * DAY);
      const recipients = await tx.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE u.status = 'ACTIVE' AND u.email_verified_at IS NOT NULL
          AND m.status = 'ACTIVE' AND m.end_date >= current_date`;
      const sent = await broadcast(tx, admin, sentAt, {
        he: {
          title: 'תזכורת: חידוש החברות לשנה הבאה (הדגמה)',
          body: `${NOTE_HE}\n\nחידוש החברות לשנה הבאה נפתח. אפשר לחדש מתוך ״החברות שלי״.\n\nבברכה,\nמזכירות האיגוד`,
        },
        en: {
          title: 'Reminder: renewing your membership for next year (demo)',
          body: `${NOTE_EN}\n\nRenewal for next year is open. You can renew from “My membership”.\n\nRegards,\nThe association office`,
        },
      });
      if (recipients.length > 0) {
        await tx.broadcastDelivery.createMany({
          data: recipients.map(({ id }) => ({
            broadcastId: sent.id,
            userId: id,
            // Already "emailed": the demo sends nothing when it starts.
            emailedAt: sentAt,
            createdAt: sentAt,
          })),
        });
        await tx.notification.createMany({
          data: recipients.map(({ id }) => ({
            id: uuidv7(),
            userId: id,
            kind: 'ASSOCIATION' as const,
            type: 'broadcast',
            params: { titleHe: sent.he, titleEn: sent.en },
            link: `/account/notifications/messages/${sent.id}`,
            createdAt: sentAt,
          })),
        });
        await tx.broadcast.update({
          where: { id: sent.id },
          data: {
            status: 'SENT',
            decidedBy: secondAdmin,
            decidedAt: sentAt,
            sentAt,
            recipientCount: recipients.length,
          },
        });
      }

      // …and one waiting for approval, written by the second admin, so the demo admin can
      // approve it (nobody approves their own message).
      await broadcast(tx, secondAdmin, new Date(now - 2 * HOUR), {
        he: {
          title: 'הזמנה למפגש החברים השנתי (הדגמה)',
          body: `${NOTE_HE}\n\nהמפגש השנתי של חברי האיגוד יתקיים בחודש הבא. פרטים והרשמה בעמוד האירועים.`,
        },
        en: {
          title: 'Invitation to the annual members’ meeting (demo)',
          body: `${NOTE_EN}\n\nThe annual members’ meeting takes place next month. Details and registration are on the events page.`,
        },
      });
    },
    { timeout: 60_000 },
  );
  console.log(
    `seed: demo notifications created (1 more admin, ${listed} members in the directory, ${announced} announcements, 2 broadcasts)`,
  );
}

/** A broadcast to all active members, submitted for approval at the given time. */
async function broadcast(
  tx: Tx,
  author: string,
  at: Date,
  text: Record<'he' | 'en', { title: string; body: string }>,
): Promise<{ id: string; he: string; en: string }> {
  const id = uuidv7();
  await tx.broadcast.create({
    data: {
      id,
      status: 'PENDING_APPROVAL',
      createdBy: author,
      audienceAll: true,
      submittedAt: at,
      createdAt: at,
      translations: {
        create: [
          { locale: 'he', ...text.he },
          { locale: 'en', ...text.en },
        ],
      },
    },
  });
  return { id, he: text.he.title, en: text.en.title };
}
