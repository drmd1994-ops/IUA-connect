import { type Locale } from '@medconnect/i18n';

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
  // The platform's verification (M17). "as" is what they are verified as, and "until" the date,
  // both in the recipient's language.
  physicianVerificationReceived: { link: string };
  physicianVerificationApproved: { as: string; until: string; link: string };
  physicianVerificationRejected: { reason: string; link: string };
  physicianVerificationRevoked: { reason: string; link: string };
  physicianVerificationExpiring: { until: string; link: string };
  physicianVerificationExpired: { link: string };
  /** A colleague invites the address to the platform (M17); inviter is their name. */
  platformInvitation: { inviter: string; link: string };
  // News (M3), to the item's author.
  newsSentBack: { title: string; reason: string; link: string };
  newsPublished: { title: string; link: string };
  // Education (M6), to the item's or question's author.
  educationSentBack: { title: string; reason: string; link: string };
  educationPublished: { title: string; link: string };
  // The question bank (M23): a reviewer dealt with the reader's report; "reason" is their answer.
  examReportHandled: { title: string; reason: string; link: string };
  // Positions (M28), to the position's writer.
  positionSentBack: { title: string; reason: string; link: string };
  positionPublished: { title: string; link: string };
  // The journal club (M31), to the one who submitted the entry.
  journalClubSentBack: { title: string; reason: string; link: string };
  journalClubPublished: { title: string; link: string };
  // Case discussions (M26): to the author, and to the reviewers of its subspecialty.
  caseApproved: { title: string; link: string };
  caseReturned: { title: string; reason: string; link: string };
  caseWaiting: { title: string; link: string };
  caseReported: { title: string; link: string };
  // Mentorship (M28). name is the other person's.
  mentorshipRequested: { name: string; link: string };
  mentorshipAccepted: { name: string; link: string };
  mentorshipDeclined: { name: string; link: string };
  mentorshipExpired: { name: string; link: string };
  mentorshipEnded: { name: string; link: string };
  // Communities (M25). name is the writer's; title the post's.
  communityComment: { name: string; title: string; link: string };
  communityReply: { name: string; title: string; link: string };
  communityMention: { name: string; title: string; link: string };
  // Research (M27). name is the other person's; title the project's.
  researchRequested: { name: string; title: string; link: string };
  researchAccepted: { name: string; title: string; link: string };
  researchDeclined: { name: string; title: string; link: string };
  researchExpired: { name: string; title: string; link: string };
  researchStale: { name: string; title: string; link: string };
  // Events (M5), to people registered for the event. "when" is formatted for the recipient.
  eventRegistered: { title: string; when: string; link: string };
  eventWaitlisted: { title: string; link: string };
  eventPromoted: { title: string; when: string; link: string };
  eventCancelled: { title: string; reason: string; link: string };
  eventChanged: { title: string; when: string; place: string; link: string };
  eventReminder: { title: string; when: string; place: string; link: string };
  // Notifications (M7). The daily summary of new content; its items are the message's list.
  contentDigest: { count: number; link: string };
  // A broadcast from the association; its text is the message's paragraphs.
  broadcast: { title: string; link: string };
  // Chat (M11): unread private messages are waiting, in this many conversations. Never the
  // text of a message or who sent it.
  chatUnread: { count: number; link: string };
}

export type EmailTemplate = keyof EmailTemplates;

export interface EmailMessage<T extends EmailTemplate = EmailTemplate> {
  to: string;
  locale: Locale;
  template: T;
  params: EmailTemplates[T];
  /** Free text written by a person (a broadcast), shown as paragraphs of plain text. */
  paragraphs?: string[];
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
