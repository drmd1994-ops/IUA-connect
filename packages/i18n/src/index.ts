import enCommon from './messages/en/common.json';
import enEmails from './messages/en/emails.json';
import enErrors from './messages/en/errors.json';
import heCommon from './messages/he/common.json';
import heEmails from './messages/he/emails.json';
import heErrors from './messages/he/errors.json';

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
  errors: typeof heErrors;
  emails: typeof heEmails;
};

const MESSAGES: Record<Locale, Messages> = {
  he: { common: heCommon, errors: heErrors, emails: heEmails },
  en: { common: enCommon, errors: enErrors, emails: enEmails },
};

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
