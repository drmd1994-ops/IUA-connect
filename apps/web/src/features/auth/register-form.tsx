'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { isLocale } from '@medconnect/i18n';
import { Alert } from '@/components/ui/alert';
import { AuthCard } from '@/components/ui/auth-card';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Link } from '@/i18n/navigation';
import { errorMessage, passwordProblems } from '@/lib/api-errors';
import { unwrap, useAuth } from './auth-context';

export function RegisterForm() {
  const t = useTranslations();
  const locale = useLocale();
  const { api } = useAuth();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      unwrap(
        await api.POST('/api/v1/auth/register', {
          body: {
            email: String(form.get('email')),
            password: String(form.get('password')),
            ...(isLocale(locale) ? { locale } : {}),
          },
        }),
      );
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <AuthCard title={t('auth.register.doneTitle')}>
        <p>{t('auth.register.doneBody')}</p>
        <Alert>{t('auth.demoOutboxNote')}</Alert>
      </AuthCard>
    );
  }

  const problems = passwordProblems(error).map((key) => t(key));
  return (
    <AuthCard title={t('auth.register.title')}>
      <p className="text-text-muted">{t('auth.register.intro')}</p>
      {error !== null && problems.length === 0 && (
        <Alert tone="error">{errorMessage(error, t)}</Alert>
      )}
      <form method="post" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <TextField
          name="email"
          type="email"
          label={t('auth.fields.email')}
          autoComplete="email"
          required
        />
        <TextField
          name="password"
          type="password"
          label={t('auth.fields.password')}
          hint={t('auth.hints.newPassword')}
          autoComplete="new-password"
          errors={problems}
          required
        />
        <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
          {t('auth.register.submit')}
        </Button>
      </form>
      <p className="text-sm text-text-muted">
        {t('auth.register.haveAccount')}{' '}
        <Link href="/login" className="text-primary underline underline-offset-4">
          {t('auth.register.signInLink')}
        </Link>
      </p>
    </AuthCard>
  );
}
