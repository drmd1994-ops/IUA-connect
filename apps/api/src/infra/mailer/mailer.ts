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
}

export type EmailTemplate = keyof EmailTemplates;

export interface EmailMessage<T extends EmailTemplate = EmailTemplate> {
  to: string;
  locale: Locale;
  template: T;
  params: EmailTemplates[T];
}

/**
 * Mailer adapter (ARCHITECTURE.md §5). Demo: ConsoleMailer (writes to outbox/). Later: SMTP or
 * a provider, selected with MAILER_ADAPTER.
 */
export abstract class Mailer {
  abstract send<T extends EmailTemplate>(message: EmailMessage<T>): Promise<void>;
}
