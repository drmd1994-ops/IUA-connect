import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StatementContact } from '@/features/site/site-settings';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'portal.accessibility' });
  return { title: t('title') };
}

/**
 * The accessibility statement (M9 plan §2.3): what was checked and how, what was not, the known
 * gaps, and how to report a problem. It claims no more than was done.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'portal.accessibility' });
  const list = (key: 'done' | 'gaps') => t.raw(key) as string[];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
        <p className="mt-2 text-text-muted">
          {t('updated')} {t('demo')}
        </p>
      </div>
      <section aria-labelledby="a11y-aim">
        <h2 id="a11y-aim" className="text-xl font-semibold">
          {t('aimTitle')}
        </h2>
        <p className="mt-2">{t('aim')}</p>
      </section>
      <section aria-labelledby="a11y-done">
        <h2 id="a11y-done" className="text-xl font-semibold">
          {t('doneTitle')}
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-2 ps-6">
          {list('done').map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="a11y-not-done">
        <h2 id="a11y-not-done" className="text-xl font-semibold">
          {t('notDoneTitle')}
        </h2>
        <p className="mt-2">{t('notDone')}</p>
      </section>
      <section aria-labelledby="a11y-gaps">
        <h2 id="a11y-gaps" className="text-xl font-semibold">
          {t('gapsTitle')}
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-2 ps-6">
          {list('gaps').map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="a11y-contact">
        <h2 id="a11y-contact" className="text-xl font-semibold">
          {t('contactTitle')}
        </h2>
        <p className="mt-2">{t('contact')}</p>
        <StatementContact />
      </section>
    </div>
  );
}
