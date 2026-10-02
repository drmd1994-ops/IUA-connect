import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, getMessages, isLocale } from '@iua/i18n';
import { CONTENT_NOTIFICATION_KINDS, type NotificationKind, uuidv7 } from '@iua/shared';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { JobQueue } from '../../infra/jobs/job-queue';
import { type EmailListItem, Mailer } from '../../infra/mailer/mailer';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UnsubscribeTokens } from './unsubscribe-tokens';

export const CONTENT_DIGEST_JOB = 'notifications.content-digest';
export const NOTIFICATIONS_CLEANUP_JOB = 'notifications.cleanup';
/** Notices in the app are kept this long (M7 plan §2.1). */
export const NOTIFICATION_RETENTION_DAYS = 180;

type ContentKind = (typeof CONTENT_NOTIFICATION_KINDS)[number];
type Tier = 'PUBLIC' | 'MEMBERS' | 'TYPES';

/** A newly published item to tell people about. */
export interface Announcement {
  /** "news", "event", "education", "guideline" or "guideline_version". */
  entityType: string;
  entityId: string;
  kind: ContentKind;
  /** The message key of the notice in the app, e.g. "contentNews". */
  type: string;
  /** The item's texts; the Hebrew and English titles are kept. */
  translations: readonly { locale: string; title: string }[];
  /** A path inside the site, without the language prefix. */
  link: string;
  accessTier: Tier;
  /** Whose tier rules apply, when they belong to another row (a version of a guideline). */
  rules?: { entity: string; id: string };
}

interface AnnouncementRow {
  id: string;
  kind: NotificationKind;
  titleHe: string | null;
  titleEn: string | null;
  link: string;
  accessTier: Tier;
  typeIds: string[];
}

/**
 * Tells people about newly published content (M7 plan §2.3). An item is announced once: the
 * announcement row is written first, and a second publication finds it and does nothing.
 * In the app it appears among the notices of everyone who may read it and has that kind
 * switched on; that is worked out when a person opens their notices, so nothing is written per
 * person here. By email, the item waits for the daily summary.
 */
@Injectable()
export class ContentAnnouncer implements OnModuleInit {
  private readonly logger = new Logger(ContentAnnouncer.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueue,
    private readonly mailer: Mailer,
    private readonly tokens: UnsubscribeTokens,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: CONTENT_DIGEST_JOB,
      // 05:00 UTC is the morning in Israel all year.
      cron: '0 5 * * *',
      run: async () => {
        const sent = await this.sendDigest();
        if (sent) this.logger.log({ sent }, 'Sent daily summaries');
      },
    });
    this.jobs.recurring({
      name: NOTIFICATIONS_CLEANUP_JOB,
      cron: '30 2 * * *',
      run: async () => {
        const removed = await this.cleanUp();
        if (removed) this.logger.log({ removed }, 'Removed old notices');
      },
    });
  }

  /**
   * Announces an item. Returns false when it was announced before.
   * A failure here never undoes the publication that caused it.
   */
  async announce(item: Announcement): Promise<boolean> {
    try {
      const title = (locale: string) =>
        item.translations
          .find((t) => t.locale === locale)
          ?.title.trim()
          .slice(0, 300) || null;
      const titleHe = title('he');
      const titleEn = title('en');
      if (!titleHe && !titleEn) return false;
      const typeIds =
        item.accessTier === 'TYPES'
          ? (
              await this.prisma.contentAccessRule.findMany({
                where: {
                  entityType: item.rules?.entity ?? item.entityType,
                  entityId: item.rules?.id ?? item.entityId,
                },
                select: { membershipTypeId: true },
              })
            ).map((rule) => rule.membershipTypeId)
          : [];
      try {
        await this.prisma.contentAnnouncement.create({
          data: {
            id: uuidv7(),
            entityType: item.entityType,
            entityId: item.entityId,
            kind: item.kind,
            type: item.type,
            titleHe,
            titleEn,
            link: item.link,
            accessTier: item.accessTier,
            typeIds,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        { err: error, entityType: item.entityType, entityId: item.entityId },
        'Announcing new content failed',
      );
      return false;
    }
  }

  /**
   * The daily summary: one email per person who switched email on for a kind of new content,
   * listing what was published since the last summary and that they may read. Nothing is sent
   * when there is nothing to list. The items are taken before the emails go out, so a repeated
   * run never lists an item twice; if a run is interrupted, the items it took are not listed
   * again.
   */
  async sendDigest(now = new Date()): Promise<number> {
    const items = await this.prisma.$queryRaw<AnnouncementRow[]>`
      UPDATE content_announcements SET digested_at = ${now}
      WHERE digested_at IS NULL
      RETURNING id, kind, title_he AS "titleHe", title_en AS "titleEn", link,
                access_tier AS "accessTier", type_ids AS "typeIds"`;
    if (items.length === 0) return 0;
    items.sort((a, b) => (a.id < b.id ? -1 : 1));

    // Email for new content starts switched off, so only people with a stored switch get it.
    const switches = await this.prisma.notificationPreference.findMany({
      where: {
        channel: 'EMAIL',
        enabled: true,
        kind: { in: [...CONTENT_NOTIFICATION_KINDS] },
        user: { status: 'ACTIVE', emailVerifiedAt: { not: null } },
      },
      select: {
        kind: true,
        user: {
          select: {
            id: true,
            email: true,
            locale: true,
            membership: { select: { status: true, endDate: true, typeId: true } },
          },
        },
      },
    });
    const people = new Map<
      string,
      { user: (typeof switches)[number]['user']; kinds: Set<string> }
    >();
    for (const row of switches) {
      const entry = people.get(row.user.id) ?? { user: row.user, kinds: new Set<string>() };
      entry.kinds.add(row.kind);
      people.set(row.user.id, entry);
    }

    let sent = 0;
    for (const { user, kinds } of people.values()) {
      const activeTypeId = activeMembershipType(user.membership, now);
      const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
      const labels = getMessages(locale).emails.layout.digestLabels as Record<string, string>;
      const list: EmailListItem[] = items
        .filter((item) => kinds.has(item.kind))
        .filter(
          (item) =>
            item.accessTier === 'PUBLIC' ||
            (activeTypeId !== null &&
              (item.accessTier === 'MEMBERS' || item.typeIds.includes(activeTypeId))),
        )
        .map((item) => ({
          label: labels[item.kind] ?? item.kind,
          title: (locale === 'he' ? item.titleHe : item.titleEn) ?? item.titleHe ?? item.titleEn!,
          link: this.url(locale, item.link),
        }));
      if (list.length === 0) continue;
      try {
        const preferencesLink = this.url(locale, '/account/notifications/preferences');
        await this.mailer.send({
          to: user.email,
          locale,
          template: 'contentDigest',
          params: { count: list.length, link: preferencesLink },
          list,
          unsubscribe: {
            link: unsubscribeUrl(
              this.env.APP_BASE_URL,
              locale,
              await this.tokens.issue(user.id, 'CONTENT', now),
            ),
            preferencesLink,
          },
        });
        sent += 1;
      } catch (error) {
        this.logger.warn({ err: error, userId: user.id }, 'Daily summary failed');
      }
    }
    return sent;
  }

  /** Deletes notices and announcements older than the retention period. */
  async cleanUp(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: before } },
    });
    await this.prisma.contentAnnouncement.deleteMany({ where: { createdAt: { lt: before } } });
    return count;
  }

  private url(locale: Locale, path: string): string {
    return new URL(`/${locale}${path}`, this.env.APP_BASE_URL).toString();
  }
}

/** The page a "stop these emails" link opens. */
export function unsubscribeUrl(base: string, locale: Locale, token: string): string {
  const url = new URL(`/${locale}/notifications/unsubscribe`, base);
  url.searchParams.set('t', token);
  return url.toString();
}

/**
 * The membership type when the membership is active today (not suspended, not past its end
 * date in Israel), or null. The same rule as the access tiers use.
 */
export function activeMembershipType(
  membership: { status: string; endDate: Date; typeId: string } | null,
  now = new Date(),
): string | null {
  if (!membership || membership.status !== 'ACTIVE') return null;
  return isoDate(membership.endDate) >= israelDate(now) ? membership.typeId : null;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Today's date in Israel, "YYYY-MM-DD". */
function israelDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
