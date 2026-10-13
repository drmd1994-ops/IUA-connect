'use client';

import { LOCALES, directionOf } from '@medconnect/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/** Links to the current page in every other locale. Each label is in its own language. */
export function LocaleSwitcher() {
  const t = useTranslations('common');
  const current = useLocale();
  const pathname = usePathname();

  return (
    <ul aria-label={t('a11y.languageSwitcher')} className="flex items-center gap-1">
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <li key={locale}>
            <Link
              href={pathname}
              locale={locale}
              lang={locale}
              dir={directionOf(locale)}
              hrefLang={locale}
              aria-current={active ? 'true' : undefined}
              className={
                active
                  ? 'rounded-md bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800'
                  : 'rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface-muted hover:text-text'
              }
            >
              {t(`locales.${locale}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
