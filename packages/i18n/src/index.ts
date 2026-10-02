import enAdmin from './messages/en/admin.json';
import enAuth from './messages/en/auth.json';
import enCommon from './messages/en/common.json';
import enContent from './messages/en/content.json';
import enEducation from './messages/en/education.json';
import enEmails from './messages/en/emails.json';
import enErrors from './messages/en/errors.json';
import enEvents from './messages/en/events.json';
import enDirectory from './messages/en/directory.json';
import enMembership from './messages/en/membership.json';
import enNotifications from './messages/en/notifications.json';
import enPortal from './messages/en/portal.json';
import enSearch from './messages/en/search.json';
import heAdmin from './messages/he/admin.json';
import heAuth from './messages/he/auth.json';
import heCommon from './messages/he/common.json';
import heContent from './messages/he/content.json';
import heEducation from './messages/he/education.json';
import heEmails from './messages/he/emails.json';
import heErrors from './messages/he/errors.json';
import heEvents from './messages/he/events.json';
import heDirectory from './messages/he/directory.json';
import heMembership from './messages/he/membership.json';
import heNotifications from './messages/he/notifications.json';
import hePortal from './messages/he/portal.json';
import heSearch from './messages/he/search.json';

/**
 * Locales enabled at launch (D6). Arabic (rtl) and Russian (ltr) are added by creating
 * `messages/ar` and `messages/ru`, registering them below, and adding them to `LOCALES`.
 */
export const LOCALES = ['he', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'he';

const RTL_LOCALES: ReadonlySet<string> = new Set(['he', 'ar']);

export type Direction = 'rtl' | 'ltr';

export function directionOf(locale: string): Direction {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export type Messages = {
  common: typeof heCommon;
  auth: typeof heAuth;
  errors: typeof heErrors;
  emails: typeof heEmails;
  membership: typeof heMembership;
  admin: typeof heAdmin;
  content: typeof heContent;
  events: typeof heEvents;
  education: typeof heEducation;
  notifications: typeof heNotifications;
  directory: typeof heDirectory;
  search: typeof heSearch;
  portal: typeof hePortal;
};

const MESSAGES: Record<Locale, Messages> = {
  he: {
    common: heCommon,
    auth: heAuth,
    errors: heErrors,
    emails: heEmails,
    membership: heMembership,
    admin: heAdmin,
    content: heContent,
    events: heEvents,
    education: heEducation,
    notifications: heNotifications,
    directory: heDirectory,
    search: heSearch,
    portal: hePortal,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    errors: enErrors,
    emails: enEmails,
    membership: enMembership,
    admin: enAdmin,
    content: enContent,
    events: enEvents,
    education: enEducation,
    notifications: enNotifications,
    directory: enDirectory,
    search: enSearch,
    portal: enPortal,
  },
};

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
