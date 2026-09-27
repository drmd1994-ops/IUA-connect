import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { ComingSoonCard } from '@/components/coming-soon-card';

const SECTIONS = ['news', 'events', 'education', 'guidelines', 'membership'] as const;

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('common.home');

  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-text-muted">{t('heroBody')}</p>
        </div>
      </section>

      <section aria-labelledby="sections-title" className="mx-auto max-w-6xl px-6 py-14">
        <h2 id="sections-title" className="text-xl font-semibold text-text">
          {t('sectionsTitle')}
        </h2>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((key) => (
            <li key={key}>
              <ComingSoonCard
                title={t(`sections.${key}.title`)}
                body={t(`sections.${key}.body`)}
                badge={t('comingSoon')}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
