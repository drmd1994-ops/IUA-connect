import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFoundPage() {
  const t = useTranslations('common.notFound');
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
      <p className="mt-4 text-lg text-text-muted">{t('body')}</p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
      >
        {t('backHome')}
      </Link>
    </div>
  );
}
