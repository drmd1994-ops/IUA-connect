'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { AuthCard } from '@/components/ui/auth-card';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { unwrap, useAuth } from './auth-context';

type Step = { kind: 'password' } | { kind: 'mfa'; mfaToken: string };

/** Sign-in: email + password, then (when MFA is on) an authenticator or recovery code. */
export function LoginForm() {
  const t = useTranslations();
  const { api, completeSignIn } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);

  async function finish(accessToken: string) {
    const me = await completeSignIn(accessToken);
    router.push(me.mfaEnrollmentRequired ? '/account/security' : '/');
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setResent(false);
    try {
      const result = unwrap(
        await api.POST('/api/v1/auth/login', {
          body: { email: String(form.get('email')), password: String(form.get('password')) },
        }),
      );
      if (result.mfaRequired && result.mfaToken) {
        setStep({ kind: 'mfa', mfaToken: result.mfaToken });
      } else if (result.accessToken) {
        await finish(result.accessToken);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== 'mfa') return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = unwrap(
        await api.POST('/api/v1/auth/mfa/verify', {
          body: { mfaToken: step.mfaToken, code: String(form.get('code')) },
        }),
      );
      await finish(result.accessToken);
    } catch (caught) {
      // A burned or expired challenge means starting again from the password step.
      if (isApiError(caught, 'INVALID_TOKEN')) setStep({ kind: 'password' });
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function resendVerification() {
    await api.POST('/api/v1/auth/verify-email/resend', { body: { email } });
    setResent(true);
  }

  if (step.kind === 'mfa') {
    return (
      <AuthCard title={t('auth.login.mfaTitle')}>
        <p className="text-text-muted">{t('auth.login.mfaIntro')}</p>
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        <form onSubmit={submitCode} className="flex flex-col gap-5" noValidate>
          <TextField
            name="code"
            label={t('auth.fields.code')}
            hint={t('auth.hints.code')}
            autoComplete="one-time-code"
            inputMode="text"
            autoFocus
            required
          />
          <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
            {t('auth.login.mfaSubmit')}
          </Button>
        </form>
        <Button variant="link" type="button" onClick={() => setStep({ kind: 'password' })}>
          {t('auth.login.restart')}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.login.title')}>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {isApiError(error, 'EMAIL_NOT_VERIFIED') &&
        (resent ? (
          <Alert tone="success">{t('auth.login.resendDone')}</Alert>
        ) : (
          <Button variant="secondary" type="button" onClick={resendVerification}>
            {t('auth.login.resendVerification')}
          </Button>
        ))}
      <form onSubmit={submitPassword} className="flex flex-col gap-5" noValidate>
        <TextField
          name="email"
          type="email"
          label={t('auth.fields.email')}
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          name="password"
          type="password"
          label={t('auth.fields.password')}
          autoComplete="current-password"
          required
        />
        <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="text-primary underline underline-offset-4">
          {t('auth.login.forgot')}
        </Link>
        <p className="text-text-muted">
          {t('auth.login.noAccount')}{' '}
          <Link href="/register" className="text-primary underline underline-offset-4">
            {t('auth.login.registerLink')}
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
