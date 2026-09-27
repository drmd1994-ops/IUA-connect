import { useTranslations } from 'next-intl';

/** Always visible: this build contains fictional data only (D1). */
export function DemoBanner() {
  const t = useTranslations('common.demo');
  return (
    <div role="note" className="bg-warning-100 px-6 py-2 text-center text-sm text-warning-700">
      {t('banner')}
    </div>
  );
}
