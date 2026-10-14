import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'portal.about' });
  return { title: t('title') };
}

const button =
  'rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover';
const link = 'font-semibold text-primary underline underline-offset-4';

/**
 * The product's public face (M17 plan §2): what it is, who runs it, how a physician joins and
 * how their details are treated. It claims no more than the product does.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'portal.about' });
  const list = (key: 'join' | 'data') => t.raw(key) as string[];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
        <p className="mt-4 text-lg">{t('intro')}</p>
        <p className="mt-2 text-text-muted">{t('demo')}</p>
      </div>
      <section aria-labelledby="about-who">
        <h2 id="about-who" className="text-xl font-semibold">
          {t('whoTitle')}
        </h2>
        <p className="mt-2">{t('who')}</p>
      </section>
      <section aria-labelledby="about-join">
        <h2 id="about-join" className="text-xl font-semibold">
          {t('joinTitle')}
        </h2>
        <ol className="mt-2 flex list-decimal flex-col gap-2 ps-6">
          {list('join').map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link href="/register" className={button}>
            {t('signUp')}
          </Link>
          <Link href="/account/verification" className={link}>
            {t('verification')}
          </Link>
        </div>
      </section>
      <section aria-labelledby="about-open">
        <h2 id="about-open" className="text-xl font-semibold">
          {t('openTitle')}
        </h2>
        <p className="mt-2">{t('open')}</p>
      </section>
      <section aria-labelledby="about-data">
        <h2 id="about-data" className="text-xl font-semibold">
          {t('dataTitle')}
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-2 ps-6">
          {list('data').map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
