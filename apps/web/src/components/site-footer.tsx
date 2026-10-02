import { useTranslations } from 'next-intl';
import { FooterContact } from '@/features/site/site-settings';

export function SiteFooter() {
  const t = useTranslations('common');
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-text-muted">
        <p className="font-semibold text-text">{t('app.name')}</p>
        <p className="mt-2 max-w-3xl">{t('demo.disclaimer')}</p>
        <FooterContact />
      </div>
    </footer>
  );
}
