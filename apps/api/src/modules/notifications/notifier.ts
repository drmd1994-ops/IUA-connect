import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Locale } from '@iua/i18n';
import {
  NOTIFICATION_DEFAULTS,
  type NotificationChannel,
  type NotificationKind,
  notificationEnabled,
  uuidv7,
} from '@iua/shared';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type EmailTemplate, type EmailTemplates, Mailer } from '../../infra/mailer/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { unsubscribeUrl } from './content-announcer';
import { UnsubscribeTokens } from './unsubscribe-tokens';

/** A message to one person: a notice in the app and an email, each if the person wants it. */
export interface Notice<T extends EmailTemplate = EmailTemplate> {
  userId: string;
  kind: NotificationKind;
  /** The person's address and language, as the caller already loaded them. */
  to: string;
  locale: Locale;
  template: T;
  params: EmailTemplates[T];
  /** Free text for the email (a broadcast's paragraphs). */
  paragraphs?: string[];
}

/**
 * Sends a notice through the channels the person switched on (M7 plan §2.2, §2.4). The notice
 * in the app is stored as the template's name and its values, without the link's host and
 * language, so it is worded in whatever language the person reads it in.
 * One channel failing never stops the other, and never undoes the action that caused it.
 */
@Injectable()
export class Notifier {
  private readonly logger = new Logger(Notifier.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly tokens: UnsubscribeTokens,
  ) {}

  async send<T extends EmailTemplate>(notice: Notice<T>): Promise<void> {
    const wants = await this.channels(notice.userId, notice.kind);
    if (wants.APP) {
      try {
        const { link, ...values } = notice.params as Record<string, unknown>;
        await this.prisma.notification.create({
          data: {
            id: uuidv7(),
            userId: notice.userId,
            kind: notice.kind,
            type: notice.template,
            params: values as Record<string, string | number>,
            link: typeof link === 'string' ? sitePath(link) : null,
          },
        });
      } catch (error) {
        this.logger.warn({ err: error, template: notice.template }, 'Notice in the app failed');
      }
    }
    if (wants.EMAIL) await this.deliverEmail(notice);
  }

  /**
   * The email channel alone, for a notice whose line in the app is written elsewhere (a
   * broadcast). Returns whether the person has email switched on for this kind.
   */
  async email<T extends EmailTemplate>(notice: Notice<T>): Promise<boolean> {
    const wants = await this.channels(notice.userId, notice.kind);
    if (wants.EMAIL) await this.deliverEmail(notice);
    return wants.EMAIL;
  }

  private async deliverEmail<T extends EmailTemplate>(notice: Notice<T>): Promise<void> {
    // An email the person can switch off says how, in one step.
    const unsubscribe = NOTIFICATION_DEFAULTS[notice.kind].locked
      ? undefined
      : {
          link: unsubscribeUrl(
            this.env.APP_BASE_URL,
            notice.locale,
            await this.tokens.issue(notice.userId, notice.kind),
          ),
          preferencesLink: new URL(
            `/${notice.locale}/account/notifications/preferences`,
            this.env.APP_BASE_URL,
          ).toString(),
        };
    await this.mailer.send({
      to: notice.to,
      locale: notice.locale,
      template: notice.template,
      params: notice.params,
      ...(notice.paragraphs ? { paragraphs: notice.paragraphs } : {}),
      ...(unsubscribe ? { unsubscribe } : {}),
    });
  }

  /** Which channels a kind reaches this person through. */
  async channels(
    userId: string,
    kind: NotificationKind,
  ): Promise<Record<NotificationChannel, boolean>> {
    const stored = await this.prisma.notificationPreference.findMany({
      where: { userId, kind },
      select: { kind: true, channel: true, enabled: true },
    });
    return {
      APP: notificationEnabled(kind, 'APP', stored),
      EMAIL: notificationEnabled(kind, 'EMAIL', stored),
    };
  }
}

/**
 * The path of a site link without its host and language prefix ("/events/x" from
 * "https://host/he/events/x"), or null when it isn't a plain page path. Links that carry a
 * token in their query are never stored.
 */
export function sitePath(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link, 'http://site.invalid');
  } catch {
    return null;
  }
  if (url.search || url.hash) return null;
  let path: string;
  try {
    // Stored readable (Hebrew addresses are long once encoded); browsers encode it again.
    path = decodeURI(url.pathname).replace(/^\/(he|en)(?=\/|$)/, '') || '/';
  } catch {
    return null;
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 500) return null;
  return path;
}
