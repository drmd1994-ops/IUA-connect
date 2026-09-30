'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { type Me, useAuth } from './auth-context';

/**
 * Shows the page only to a signed-in user; otherwise a loading state or a sign-in prompt. The
 * page is only a view: the API enforces who may see and do what.
 */
export function RequireSignIn({ children }: { children: (me: Me) => ReactNode }) {
  const t = useTranslations('membership.common');
  const { status, me } = useAuth();
  if (status === 'loading') {
    return (
      <PageFrame>
        <p role="status">{t('loading')}</p>
      </PageFrame>
    );
  }
  if (status === 'signedOut' || !me) {
    return (
      <PageFrame>
        <Alert>{t('signInRequired')}</Alert>
        <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
          {t('signIn')}
        </Link>
      </PageFrame>
    );
  }
  return <>{children(me)}</>;
}

export function PageFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex ${wide ? 'max-w-6xl' : 'max-w-3xl'} flex-col gap-6 px-6 py-12`}>
      {children}
    </div>
  );
}
