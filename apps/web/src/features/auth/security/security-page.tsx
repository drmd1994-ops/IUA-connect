'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { useAuth } from '../auth-context';
import { MfaSection } from './mfa-section';
import { PasswordSection } from './password-section';
import { SessionsSection } from './sessions-section';

/**
 * The signed-in user's security settings. The page is only a view: every rule (who may do what,
 * re-authentication, MFA required by role) is enforced by the API.
 */
export function SecurityPage() {
  const t = useTranslations();
  const { status, me } = useAuth();
  const [sessionsVersion, setSessionsVersion] = useState(0);

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p role="status">{t('auth.loading')}</p>
      </div>
    );
  }
  if (status === 'signedOut' || !me) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
        <Alert>{t('auth.security.signInRequired')}</Alert>
        <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
          {t('auth.nav.signIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('auth.security.title')}</h1>
        <p className="mt-2 text-text-muted" dir="ltr">
          {me.email}
        </p>
      </div>
      {me.mfaEnrollmentRequired && <Alert tone="warning">{t('auth.security.enrollBanner')}</Alert>}

      <section aria-labelledby="mfa-heading" className="flex flex-col gap-4">
        <h2 id="mfa-heading" className="text-xl font-semibold">
          {t('auth.security.mfaTitle')}
        </h2>
        <MfaSection />
      </section>

      <section aria-labelledby="password-heading" className="flex flex-col gap-4">
        <h2 id="password-heading" className="text-xl font-semibold">
          {t('auth.security.passwordTitle')}
        </h2>
        <PasswordSection onChanged={() => setSessionsVersion((v) => v + 1)} />
      </section>

      <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
        <h2 id="sessions-heading" className="text-xl font-semibold">
          {t('auth.security.sessionsTitle')}
        </h2>
        <SessionsSection refreshKey={sessionsVersion} />
      </section>
    </div>
  );
}
