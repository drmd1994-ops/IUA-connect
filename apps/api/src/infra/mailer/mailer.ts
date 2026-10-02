import { type Locale } from '@iua/i18n';

/** Emails the system sends, with the parameters each template needs. */
export interface EmailTemplates {
  verifyEmail: { link: string };
  accountExists: { signInLink: string };
  passwordReset: { link: string };
  passwordChanged: Record<string, never>;
  accountLocked: { minutes: number };
  newDevice: { device: string; time: string };
  // Membership (M2). typeName is in the recipient's language; endDate is formatted for it.
  membershipApplicationReceived: { typeName: string; link: string };
  membershipDirectorApproved: { typeName: string; link: string };
  membershipApproved: { typeName: string; endDate: string; link: string };
  membershipRejected: { typeName: string; reason: string; link: string };
  /** An import created the account: set a password (ACCOUNT_SETUP link, 7 days). */
  membershipImportWelcome: { typeName: string; link: string };
  // News (M3), to the item's author.
  newsSentBack: { title: string; reason: string; link: string };
  newsPublished: { title: string; link: string };
  // Education (M6), to the item's or question's author.
  educationSentBack: { title: string; reason: string; link: string };
  educationPublished: { title: string; link: string };
  // Events (M5), to people registered for the event. "when" is formatted for the recipient.
  eventRegistered: { title: string; when: string; link: string };
  eventWaitlisted: { title: string; link: string };
  eventPromoted: { title: string; when: string; link: string };
  eventCancelled: { title: string; reason: string; link: string };
  eventChanged: { title: string; when: string; place: string; link: string };
  eventReminder: { title: string; when: string; place: string; link: string };
  // Notifications (M7). The daily summary of new content; its items are the message's list.
  contentDigest: { count: number; link: string };
}

export type EmailTemplate = keyof EmailTemplates;

export interface EmailMessage<T extends EmailTemplate = EmailTemplate> {
  to: string;
  locale: Locale;
  template: T;
  params: EmailTemplates[T];
  /** Lines listed under the text, each with its own link (the daily summary). */
  list?: EmailListItem[];
  /** For emails a switch controls: how to turn this kind off, and where all switches are. */
  unsubscribe?: { link: string; preferencesLink: string };
}

export interface EmailListItem {
  /** What it is, in the recipient's language ("News", "Event"). */
  label: string;
  title: string;
  link: string;
}

/**
 * Mailer adapter (ARCHITECTURE.md §5). Demo: ConsoleMailer (writes to outbox/). Later: SMTP or
 * a provider, selected with MAILER_ADAPTER.
 */
export abstract class Mailer {
  abstract send<T extends EmailTemplate>(message: EmailMessage<T>): Promise<void>;
}
