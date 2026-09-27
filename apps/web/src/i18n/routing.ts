import { DEFAULT_LOCALE, LOCALES } from '@iua/i18n';
import { defineRouting } from 'next-intl/routing';

/** Locale-prefixed routes: /he/... (default, RTL) and /en/... (ARCHITECTURE.md §9). */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
});
