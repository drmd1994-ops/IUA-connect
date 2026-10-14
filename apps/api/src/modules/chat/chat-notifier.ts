import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { JobQueue } from '../../infra/jobs/job-queue';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PushProvider } from '../../infra/push/push-provider';
import { Notifier } from '../notifications';

export const CHAT_UNREAD_EMAIL_JOB = 'chat.unread-email';
/** A message waits this long unread before an email mentions it. */
export const UNREAD_EMAIL_AFTER_MS = 30 * 60 * 1000;
/** At most one "messages are waiting" email in this time. */
export const UNREAD_EMAIL_EVERY_MS = 24 * 60 * 60 * 1000;

interface Waiting {
  userId: string;
  email: string;
  locale: string;
  /** How many conversations (or room notices) are waiting. */
  waiting: number;
}

/**
 * Notices about private messages (M11 plan §2.13), under the "Private messages" switches.
 * In the app the notice is the number on the Chat link, not a line under the bell. By email it
 * is at most one message a day saying that unread messages are waiting; it never carries the
 * text of a message or who sent it. Muted conversations cause neither.
 */
@Injectable()
export class ChatNotifier implements OnModuleInit {
  private readonly logger = new Logger(ChatNotifier.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueue,
    private readonly notifier: Notifier,
    private readonly push: PushProvider,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: CHAT_UNREAD_EMAIL_JOB,
      cron: '*/30 * * * *',
      run: async () => {
        const sent = await this.sendUnreadEmails();
        if (sent) this.logger.log({ sent }, 'Sent "messages are waiting" emails');
      },
    });
  }

  async wantsInApp(userId: string): Promise<boolean> {
    return (await this.notifier.channels(userId, 'MESSAGES')).APP;
  }

  /**
   * A message was sent: hands the push connection point a notice for each recipient who has
   * the kind switched on in the app and has not muted the conversation. Nothing happens while
   * no push service is plugged in. A failure never undoes the message.
   */
  async messageSent(
    conversationId: string,
    recipientIds: readonly string[],
    link = `/chat/${conversationId}`,
  ): Promise<void> {
    if (!this.push.enabled || recipientIds.length === 0) return;
    try {
      const now = new Date();
      const members = await this.prisma.conversationMember.findMany({
        where: {
          conversationId,
          userId: { in: [...recipientIds] },
          OR: [{ muted: false }, { mutedUntil: { lte: now } }],
        },
        select: { user: { select: { id: true, locale: true } } },
      });
      for (const { user } of members) {
        if (!(await this.wantsInApp(user.id))) continue;
        await this.push.send({
          userId: user.id,
          locale: localeOf(user.locale),
          type: 'chatMessage',
          params: {},
          link,
        });
      }
    } catch (error) {
      this.logger.warn({ err: error, conversationId }, 'Push notice for a message failed');
    }
  }

  /**
   * The "messages are waiting" email. A person gets one when something has waited unread for
   * half an hour, they have had no such email in the last day, and it arrived after the last
   * one. "Something" is a private message in a conversation they have not muted or archived
   * (the "Private messages" switch), or a mention, a reply or an announcement in a room (the
   * "Chat rooms" switch, which starts off). One email covers both, and never carries a text
   * or a name. The time is recorded before the email goes out, so a repeated run never sends
   * two.
   */
  async sendUnreadEmails(now = new Date()): Promise<number> {
    const waitedSince = new Date(now.getTime() - UNREAD_EMAIL_AFTER_MS);
    const lastAllowed = new Date(now.getTime() - UNREAD_EMAIL_EVERY_MS);
    const [direct, rooms] = await Promise.all([
      this.prisma.$queryRaw<Waiting[]>`
        SELECT u.id AS "userId", u.email::text AS email, u.locale,
               count(DISTINCT m.conversation_id)::int AS waiting
        FROM conversation_members m
        JOIN conversations c ON c.id = m.conversation_id AND c.kind IN ('DIRECT', 'GROUP')
        JOIN users u ON u.id = m.user_id
        LEFT JOIN chat_preferences p ON p.user_id = u.id
        WHERE u.status = 'ACTIVE'
          AND u.email_verified_at IS NOT NULL
          AND m.archived_at IS NULL
          AND NOT (m.muted AND (m.muted_until IS NULL OR m.muted_until > ${now}))
          AND (p.unread_emailed_at IS NULL OR p.unread_emailed_at <= ${lastAllowed})
          AND EXISTS (
            SELECT 1 FROM messages x
            WHERE x.conversation_id = m.conversation_id
              AND x.seq > m.last_read_seq
              AND x.sender_id IS DISTINCT FROM u.id
              AND x.deleted_at IS NULL
              AND x.created_at <= ${waitedSince}
              AND (p.unread_emailed_at IS NULL OR x.created_at > p.unread_emailed_at)
              AND NOT EXISTS (
                SELECT 1 FROM message_hides h WHERE h.message_id = x.id AND h.user_id = u.id
              )
          )
        GROUP BY u.id, u.email, u.locale`,
      // Email about rooms starts switched off, so only people with a stored switch get it.
      this.prisma.$queryRaw<Waiting[]>`
        SELECT u.id AS "userId", u.email::text AS email, u.locale, count(*)::int AS waiting
        FROM notifications n
        JOIN users u ON u.id = n.user_id
        JOIN notification_preferences s
          ON s.user_id = u.id AND s.kind = 'ROOMS' AND s.channel = 'EMAIL' AND s.enabled
        LEFT JOIN chat_preferences p ON p.user_id = u.id
        WHERE n.kind = 'ROOMS'
          AND n.read_at IS NULL
          AND n.created_at <= ${waitedSince}
          AND (p.unread_emailed_at IS NULL OR n.created_at > p.unread_emailed_at)
          AND (p.unread_emailed_at IS NULL OR p.unread_emailed_at <= ${lastAllowed})
          AND u.status = 'ACTIVE'
          AND u.email_verified_at IS NOT NULL
        GROUP BY u.id, u.email, u.locale`,
    ]);

    const people = new Map<string, Waiting & { kinds: ('MESSAGES' | 'ROOMS')[] }>();
    for (const [kind, rows] of [
      ['MESSAGES', direct],
      ['ROOMS', rooms],
    ] as const) {
      for (const row of rows) {
        // The private-messages switch is checked here; the rooms one was part of the query.
        if (kind === 'MESSAGES' && !(await this.notifier.channels(row.userId, kind)).EMAIL)
          continue;
        const entry = people.get(row.userId) ?? { ...row, waiting: 0, kinds: [] };
        entry.waiting += row.waiting;
        entry.kinds.push(kind);
        people.set(row.userId, entry);
      }
    }

    let sent = 0;
    for (const person of people.values()) {
      try {
        await this.prisma.chatPreference.upsert({
          where: { userId: person.userId },
          update: { unreadEmailedAt: now },
          create: { userId: person.userId, unreadEmailedAt: now },
        });
        const locale = localeOf(person.locale);
        const delivered = await this.notifier.email({
          userId: person.userId,
          // The "stop these emails" link switches off the kind that caused the email.
          kind: person.kinds[0]!,
          to: person.email,
          locale,
          template: 'chatUnread',
          params: {
            count: person.waiting,
            link: new URL(`/${locale}/chat`, this.env.APP_BASE_URL).toString(),
          },
        });
        if (delivered) sent += 1;
      } catch (error) {
        this.logger.warn({ err: error, userId: person.userId }, 'Unread messages email failed');
      }
    }
    return sent;
  }
}
const localeOf = (value: string): Locale => (isLocale(value) ? value : DEFAULT_LOCALE);
