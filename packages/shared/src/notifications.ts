/**
 * Notification kinds and their starting settings (M7 plan §2.2, owner answers §11.1 and §11.3).
 * A person's stored switch overrides the starting setting; a locked kind can't be switched off.
 */
export const NOTIFICATION_CHANNELS = ['APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_KINDS = [
  /** Application decisions and membership changes. */
  'ACCOUNT',
  /** The person's own event registrations: confirmed, promoted, reminders, changes. */
  'MY_EVENTS',
  /** Broadcasts sent by an admin. */
  'ASSOCIATION',
  /** A news item was published. */
  'NEWS',
  /** An event was published. */
  'NEW_EVENTS',
  /** An education item was published. */
  'EDUCATION',
  /** A guideline entry was added or got a new version. */
  'GUIDELINES',
  /** Staff work: an item was sent back or published. Not shown in the preferences. */
  'WORK',
  /** Private messages in chat: the number on the Chat link, and one email a day at most. */
  'MESSAGES',
  /** Chat rooms: someone mentioned you or replied to you, or an announcement in your room. */
  'ROOMS',
  /** A job, fellowship or research post was published (M28). */
  'POSITIONS',
  /** Mentorship (M28): a request to you, and the answer to yours. */
  'MENTORSHIP',
  /**
   * Communities (M25): a comment on your post or under your comment, a mention, a new post in a
   * community you follow.
   */
  'COMMUNITIES',
  /** Research (M27): a request to join your project, and the answer to yours. */
  'RESEARCH',
  /** Journal club (M31): a new entry was published. */
  'JOURNAL_CLUB',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationKindSettings {
  /** On in the app before the person chooses. */
  app: boolean;
  /** On by email before the person chooses. */
  email: boolean;
  /** Always on, in both channels. */
  locked: boolean;
}

export const NOTIFICATION_DEFAULTS: Record<NotificationKind, NotificationKindSettings> = {
  ACCOUNT: { app: true, email: true, locked: true },
  MY_EVENTS: { app: true, email: true, locked: false },
  ASSOCIATION: { app: true, email: true, locked: false },
  NEWS: { app: true, email: false, locked: false },
  NEW_EVENTS: { app: true, email: false, locked: false },
  EDUCATION: { app: true, email: false, locked: false },
  GUIDELINES: { app: true, email: false, locked: false },
  WORK: { app: true, email: true, locked: true },
  MESSAGES: { app: true, email: true, locked: false },
  ROOMS: { app: true, email: false, locked: false },
  POSITIONS: { app: true, email: false, locked: false },
  MENTORSHIP: { app: true, email: true, locked: false },
  COMMUNITIES: { app: true, email: false, locked: false },
  RESEARCH: { app: true, email: true, locked: false },
  JOURNAL_CLUB: { app: true, email: false, locked: false },
};

/** The kinds a person can set, in the order the preferences page lists them. */
export const NOTIFICATION_PREFERENCE_KINDS = [
  'ACCOUNT',
  'MY_EVENTS',
  'ASSOCIATION',
  'MESSAGES',
  // Chat rooms closed in M25 (owner answer §10.6): their kind is no longer offered.
  'COMMUNITIES',
  'MENTORSHIP',
  'RESEARCH',
  'NEWS',
  'NEW_EVENTS',
  'EDUCATION',
  'GUIDELINES',
  'POSITIONS',
  'JOURNAL_CLUB',
] as const satisfies readonly NotificationKind[];

/** The kinds about newly published content; their emails arrive as one daily summary. */
export const CONTENT_NOTIFICATION_KINDS = [
  'NEWS',
  'NEW_EVENTS',
  'EDUCATION',
  'GUIDELINES',
  'POSITIONS',
  'JOURNAL_CLUB',
] as const satisfies readonly NotificationKind[];

export interface StoredNotificationSwitch {
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
}

/** Whether a kind reaches a person through a channel, given the switches they stored. */
export function notificationEnabled(
  kind: NotificationKind,
  channel: NotificationChannel,
  stored: readonly StoredNotificationSwitch[],
): boolean {
  const settings = NOTIFICATION_DEFAULTS[kind];
  if (settings.locked) return true;
  const row = stored.find((s) => s.kind === kind && s.channel === channel);
  if (row) return row.enabled;
  return channel === 'APP' ? settings.app : settings.email;
}
