import { DEFAULT_LOCALE, type Locale, isLocale } from '@iua/i18n';

/**
 * The language the app starts in: the first of the phone's languages that the app has, else
 * Hebrew. (A language the member chose in the app replaces this.)
 */
export function startingLocale(phoneLanguages: readonly (string | null | undefined)[]): Locale {
  for (const language of phoneLanguages) {
    // Android still reports Hebrew by its old code on some phones.
    const code = language === 'iw' ? 'he' : language;
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}
