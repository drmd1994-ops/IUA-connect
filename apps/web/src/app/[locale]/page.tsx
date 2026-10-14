import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { HomeSwitch } from '@/features/dashboard/member-dashboard';
import { Link } from '@/i18n/navigation';

/** What the site offers, for visitors. A signed-in person gets their dashboard instead. */
const SECTIONS = [
  { key: 'news', href: '/news' },
  { key: 'events', href: '/events' },
  { key: 'education', href: '/education' },
  { key: 'guidelines', href: '/guidelines' },
  { key: 'membership', href: '/organisations' },
] as const;

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('common.home');

  return (
    <HomeSwitch>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-text-muted">{t('heroBody')}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
            >
              {t('signUp')}
            </Link>
            <Link href="/about" className="font-semibold text-primary underline underline-offset-4">
              {t('join')}
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="available-title" className="mx-auto max-w-6xl px-6 py-14">
        <h2 id="available-title" className="text-xl font-semibold text-text">
          {t('availableTitle')}
        </h2>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map(({ key, href }) => (
            <li key={key}>
              <article className="h-full rounded-lg border border-border bg-surface p-6 shadow-card">
                <h3 className="text-lg font-semibold">
                  <Link href={href} className="text-primary underline underline-offset-4">
                    {t(`sections.${key}.title`)}
                  </Link>
                </h3>
                <p className="mt-2 text-text-muted">{t(`sections.${key}.body`)}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </HomeSwitch>
  );
}
