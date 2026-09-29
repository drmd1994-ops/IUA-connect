import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AccountMenu } from './account-menu';
import { LocaleSwitcher } from './locale-switcher';

export function SiteHeader() {
  const t = useTranslations('common');
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
        <nav aria-label={t('a11y.mainNavigation')} className="flex items-center gap-4">
          <LocaleSwitcher />
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
