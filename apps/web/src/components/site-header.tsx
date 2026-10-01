import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AccountMenu } from './account-menu';
import { LocaleSwitcher } from './locale-switcher';

export function SiteHeader() {
  const t = useTranslations('common');
  const nav = useTranslations('content.nav');
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-3 rounded-sm">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-md bg-primary text-sm font-semibold text-on-primary"
          >
            {t('app.shortName')}
          </span>
          <span className="text-lg font-semibold text-brand-900">{t('app.name')}</span>
        </Link>
        <nav
          aria-label={t('a11y.mainNavigation')}
          className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
        >
          <Link
            href="/news"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {nav('news')}
          </Link>
          <Link
            href="/guidelines"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {nav('guidelines')}
          </Link>
          <LocaleSwitcher />
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
