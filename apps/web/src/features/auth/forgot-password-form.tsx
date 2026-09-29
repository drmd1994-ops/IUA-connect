'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { AuthCard } from '@/components/ui/auth-card';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { unwrap, useAuth } from './auth-context';

export function ForgotPasswordForm() {
  const t = useTranslations();
  const { api } = useAuth();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email'));
    setPending(true);
    setError(null);
    try {
      unwrap(await api.POST('/api/v1/auth/password/forgot', { body: { email } }));
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={t('auth.forgot.title')}>
      {done ? (
        <>
          <Alert tone="success">{t('auth.forgot.doneBody')}</Alert>
          <Alert>{t('auth.demoOutboxNote')}</Alert>
        </>
      ) : (
        <>
          <p className="text-text-muted">{t('auth.forgot.intro')}</p>
          {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
          <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <TextField
              name="email"
              type="email"
              label={t('auth.fields.email')}
              autoComplete="email"
              required
            />
            <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
              {t('auth.forgot.submit')}
            </Button>
          </form>
        </>
      )}
      <Link href="/login" className="text-sm text-primary underline underline-offset-4">
        {t('auth.forgot.backToSignIn')}
      </Link>
    </AuthCard>
  );
}
