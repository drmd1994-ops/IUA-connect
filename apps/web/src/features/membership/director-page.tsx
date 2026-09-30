'use client';

import { useTranslations } from 'next-intl';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { ReviewQueue } from './review-queue';

/** Department directors: applications from their departments. */
export function DirectorApplicationsPage() {
  const t = useTranslations('membership.review');
  return (
    <RequireSignIn>
      {() => (
        <PageFrame>
          <div>
            <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
            <p className="mt-2 text-text-muted">{t('intro')}</p>
          </div>
          <ReviewQueue stage="director" />
        </PageFrame>
      )}
    </RequireSignIn>
  );
}
