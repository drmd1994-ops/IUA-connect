'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { AuthCard } from '@/components/ui/auth-card';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Link } from '@/i18n/navigation';
import { unwrap, useAuth } from './auth-context';

type State = 'verifying' | 'verified' | 'failed';

/** Opens from the emailed link: verifies once, or offers a new link. */
export function VerifyEmail({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const { api } = useAuth();
  const [state, setState] = useState<State>(token ? 'verifying' : 'failed');
  const [resent, setResent] = useState(false);
  // React runs effects twice in development; the token is single-use, so send it only once.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    void api
      .POST('/api/v1/auth/verify-email', { body: { token } })
      .then((result) => {
        unwrap(result);
        setState('verified');
      })
      .catch(() => setState('failed'));
  }, [api, token]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email'));
    await api.POST('/api/v1/auth/verify-email/resend', { body: { email } });
    setResent(true);
  }

  if (state === 'verifying') {
    return (
      <AuthCard title={t('verify.title')}>
        <p role="status">{t('verify.verifying')}</p>
      </AuthCard>
    );
  }
  if (state === 'verified') {
    return (
      <AuthCard title={t('verify.successTitle')}>
        <Alert tone="success">{t('verify.successBody')}</Alert>
        <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
          {t('verify.goToSignIn')}
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('verify.failedTitle')}>
      <p>{t('verify.failedBody')}</p>
      {resent ? (
        <Alert tone="success">{t('verify.resendDone')}</Alert>
      ) : (
        <form onSubmit={resend} className="flex flex-col gap-5" noValidate>
          <TextField
            name="email"
            type="email"
            label={t('fields.email')}
            autoComplete="email"
            required
          />
          <Button type="submit">{t('verify.resendSubmit')}</Button>
        </form>
      )}
    </AuthCard>
  );
}
