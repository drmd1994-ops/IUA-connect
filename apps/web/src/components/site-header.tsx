import { useTranslations } from 'next-intl';
import { ChatLink } from '@/features/chat/chat-link';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { OrganisationsLink } from '@/features/organisations/organisations-link';
import { SearchBox } from '@/features/search/search-box';
import { Link } from '@/i18n/navigation';
import { AccountMenu } from './account-menu';
import { LocaleSwitcher } from './locale-switcher';

export function SiteHeader() {
  const t = useTranslations('common');
  const nav = useTranslations('content.nav');
  const events = useTranslations('events');
  const education = useTranslations('education');
  const calculators = useTranslations('calculators');
  const careers = useTranslations('careers');
  const communities = useTranslations('communities');
  const research = useTranslations('research');
  return (
    <header className="border-b border-border bg-surface">
      {/* Wraps on narrow screens (and at high zoom), so nothing needs sideways scrolling. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6">
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
          className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2"
        >
          <Link
            href="/news"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {nav('news')}
          </Link>
          <Link
            href="/events"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {events('nav')}
          </Link>
          <Link
            href="/education"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {education('nav')}
          </Link>
          <Link
            href="/guidelines"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {nav('guidelines')}
          </Link>
          <Link
            href="/calculators"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {calculators('nav')}
          </Link>
          <Link
            href="/positions"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {careers('nav')}
          </Link>
          <Link
            href="/communities"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {communities('nav')}
          </Link>
          <Link
            href="/research"
            className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            {research('nav')}
          </Link>
          <OrganisationsLink />
          <ChatLink />
          <SearchBox />
          <LocaleSwitcher />
          <NotificationBell />
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
