'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { errorMessage, passwordProblems } from '@/lib/api-errors';
import { useAuth } from '../auth-context';

export function PasswordSection({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);
    setDone(false);
    try {
      await call(() =>
        api.POST('/api/v1/auth/password/change', {
          body: {
            currentPassword: String(form.get('currentPassword')),
            newPassword: String(form.get('newPassword')),
          },
        }),
      );
      formElement.reset();
      setDone(true);
      onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const problems = passwordProblems(error).map((key) => t(key));
  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate>
      {done && <Alert tone="success">{t('auth.security.passwordChanged')}</Alert>}
      {error !== null && problems.length === 0 && (
        <Alert tone="error">{errorMessage(error, t)}</Alert>
      )}
      <TextField
        name="currentPassword"
        type="password"
        label={t('auth.fields.currentPassword')}
        autoComplete="current-password"
        required
      />
      <TextField
        name="newPassword"
        type="password"
        label={t('auth.fields.newPassword')}
        hint={t('auth.hints.newPassword')}
        autoComplete="new-password"
        errors={problems}
        required
      />
      <div>
        <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
          {t('auth.security.passwordSubmit')}
        </Button>
      </div>
    </form>
  );
}
