import { useTranslations } from 'next-intl';
import { FooterContact } from '@/features/site/site-settings';
import { Link } from '@/i18n/navigation';

export function SiteFooter() {
  const t = useTranslations('common');
  const a = useTranslations('portal.accessibility');
  const about = useTranslations('portal.about');
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-text-muted">
        <p className="font-semibold text-text">{t('app.name')}</p>
        <p className="mt-2 max-w-3xl">{t('demo.disclaimer')}</p>
        <FooterContact />
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/about" className="font-semibold underline underline-offset-4">
            {about('footerLink')}
          </Link>
          <Link href="/accessibility" className="font-semibold underline underline-offset-4">
            {a('footerLink')}
          </Link>
        </p>
      </div>
    </footer>
  );
}
