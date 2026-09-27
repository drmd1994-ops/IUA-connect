'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { errorMessage } from '@/lib/api-errors';
import { useAuth } from '../auth-context';

/** Password (+ code when MFA is on) before a sensitive change; then the change is retried. */
export function ReauthForm({
  needsCode,
  onDone,
  onCancel,
}: {
  needsCode: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '');
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/auth/reauthenticate', {
          body: { password: String(form.get('password')), ...(code ? { code } : {}) },
        }),
      );
      onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="reauth-title"
      className="rounded-md border border-brand-200 bg-brand-50 p-5"
    >
      <h3 id="reauth-title" className="font-semibold text-brand-900">
        {t('auth.security.reauthTitle')}
      </h3>
      <p className="mt-1 text-sm text-text-muted">{t('auth.security.reauthIntro')}</p>
      {error !== null && (
        <div className="mt-3">
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        </div>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
        <TextField
          name="password"
          type="password"
          label={t('auth.fields.password')}
          autoComplete="current-password"
          autoFocus
          required
        />
        {needsCode && (
          <TextField
            name="code"
            label={t('auth.fields.code')}
            hint={t('auth.hints.code')}
            autoComplete="one-time-code"
            required
          />
        )}
        <div className="flex gap-3">
          <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
            {t('auth.security.reauthSubmit')}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('auth.security.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
