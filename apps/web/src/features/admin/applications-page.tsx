'use client';

import { useTranslations } from 'next-intl';
import { ReviewQueue } from '@/features/membership/review-queue';

/** Final approval by the association. */
export function AdminApplicationsPage() {
  const t = useTranslations('membership.review');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('adminTitle')}</h1>
        <p className="mt-2 text-text-muted">{t('adminIntro')}</p>
      </div>
      <ReviewQueue stage="admin" />
    </div>
  );
}
