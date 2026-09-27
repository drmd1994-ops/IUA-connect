'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { AuthCard } from '@/components/ui/auth-card';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Link } from '@/i18n/navigation';
import { errorMessage, passwordProblems } from '@/lib/api-errors';
import { unwrap, useAuth } from './auth-context';

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations();
  const { api } = useAuth();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <AuthCard title={t('auth.reset.title')}>
        <Alert tone="error">{t('auth.reset.missingToken')}</Alert>
        <Link href="/forgot-password" className="text-primary underline underline-offset-4">
          {t('auth.reset.requestNew')}
        </Link>
      </AuthCard>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('newPassword'));
    setPending(true);
    setError(null);
    try {
      unwrap(
        await api.POST('/api/v1/auth/password/reset', { body: { token: token!, newPassword } }),
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
      <AuthCard title={t('auth.reset.successTitle')}>
        <Alert tone="success">{t('auth.reset.successBody')}</Alert>
        <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
          {t('auth.verify.goToSignIn')}
        </Link>
      </AuthCard>
    );
  }

  const problems = passwordProblems(error).map((key) => t(key));
  return (
    <AuthCard title={t('auth.reset.title')}>
      {error !== null && problems.length === 0 && (
        <>
          <Alert tone="error">{errorMessage(error, t)}</Alert>
          <Link href="/forgot-password" className="text-primary underline underline-offset-4">
            {t('auth.reset.requestNew')}
          </Link>
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <TextField
          name="newPassword"
          type="password"
          label={t('auth.fields.newPassword')}
          hint={t('auth.hints.newPassword')}
          autoComplete="new-password"
          errors={problems}
          required
        />
        <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
          {t('auth.reset.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
