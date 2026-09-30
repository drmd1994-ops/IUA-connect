import enAdmin from './messages/en/admin.json';
import enAuth from './messages/en/auth.json';
import enCommon from './messages/en/common.json';
import enEmails from './messages/en/emails.json';
import enErrors from './messages/en/errors.json';
import enMembership from './messages/en/membership.json';
import heAdmin from './messages/he/admin.json';
import heAuth from './messages/he/auth.json';
import heCommon from './messages/he/common.json';
import heEmails from './messages/he/emails.json';
import heErrors from './messages/he/errors.json';
import heMembership from './messages/he/membership.json';

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
};

const MESSAGES: Record<Locale, Messages> = {
  he: {
    common: heCommon,
    auth: heAuth,
    errors: heErrors,
    emails: heEmails,
    membership: heMembership,
    admin: heAdmin,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    errors: enErrors,
    emails: enEmails,
    membership: enMembership,
    admin: enAdmin,
  },
};

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
