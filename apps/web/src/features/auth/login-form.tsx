'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState, useSyncExternalStore } from 'react';
import { Alert } from '@/components/ui/alert';
import { AuthCard } from '@/components/ui/auth-card';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { unwrap, useAuth } from './auth-context';
import {
  PasskeyCeremonyError,
  getAssertion,
  passkeyAutofillSupported,
  passkeysSupported,
} from './passkeys';

type Step =
  { kind: 'password' } | { kind: 'mfa'; mfaToken: string; methods: ('totp' | 'passkey')[] };

const noSubscribe = () => () => {};

/** True in browsers that support passkeys; false while rendering on the server. */
export function usePasskeysSupported(): boolean {
  return useSyncExternalStore(noSubscribe, passkeysSupported, () => false);
}

/**
 * Sign-in: a passkey on its own, or email + password followed (when MFA is on) by an
 * authenticator code, a recovery code, or a passkey.
 */
export function LoginForm() {
  const t = useTranslations();
  const { api, completeSignIn } = useAuth();
  const router = useRouter();
  const supportsPasskeys = usePasskeysSupported();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);

  async function finish(accessToken: string) {
    const me = await completeSignIn(accessToken);
    router.push(me.mfaEnrollmentRequired ? '/account/security' : '/');
  }

  /** Passkey sign-in (button or autofill). A closed prompt is not an error worth showing. */
  async function signInWithPasskey(autofill = false) {
    if (!autofill) {
      setPending(true);
      setError(null);
    }
    try {
      const response = await getAssertion(api, { autofill });
      const result = unwrap(
        await api.POST('/api/v1/auth/passkeys/authentication/verify', { body: { response } }),
      );
      await finish(result.accessToken);
    } catch (caught) {
      const cancelled = caught instanceof PasskeyCeremonyError && caught.reason === 'cancelled';
      if (!autofill && !cancelled) setError(caught);
    } finally {
      if (!autofill) setPending(false);
    }
  }

  // Offer passkeys in the email field's suggestions (conditional mediation), where supported.
  useEffect(() => {
    let active = true;
    void passkeyAutofillSupported().then((supported) => {
      if (active && supported) void signInWithPasskey(true);
    });
    return () => {
      active = false;
    };
    // Runs once per visit to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setStep({ kind: 'mfa', mfaToken: result.mfaToken, methods: result.mfaMethods ?? ['totp'] });
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

  const shownError =
    error instanceof PasskeyCeremonyError
      ? t(`auth.passkeys.${error.reason}`)
      : errorMessage(error, t);

  if (step.kind === 'mfa') {
    const hasTotp = step.methods.includes('totp');
    const hasPasskey = step.methods.includes('passkey') && supportsPasskeys;
    return (
      <AuthCard title={t('auth.login.mfaTitle')}>
        {error !== null && <Alert tone="error">{shownError}</Alert>}
        {hasPasskey && (
          <>
            <p className="text-text-muted">{t('auth.login.mfaPasskey')}</p>
            <Button
              type="button"
              onClick={() => void signInWithPasskey()}
              pending={pending}
              pendingLabel={t('auth.pending')}
            >
              {t('auth.login.signInWithPasskey')}
            </Button>
          </>
        )}
        {hasTotp && (
          <>
            {hasPasskey && (
              <p className="text-center text-sm text-text-muted">{t('auth.login.or')}</p>
            )}
            <p className="text-text-muted">{t('auth.login.mfaIntro')}</p>
            <form onSubmit={submitCode} className="flex flex-col gap-5" noValidate>
              <TextField
                name="code"
                label={t('auth.fields.code')}
                hint={t('auth.hints.code')}
                autoComplete="one-time-code"
                inputMode="text"
                autoFocus={!hasPasskey}
                required
              />
              <Button
                type="submit"
                variant={hasPasskey ? 'secondary' : 'primary'}
                pending={pending}
                pendingLabel={t('auth.pending')}
              >
                {t('auth.login.mfaSubmit')}
              </Button>
            </form>
          </>
        )}
        <Button variant="link" type="button" onClick={() => setStep({ kind: 'password' })}>
          {t('auth.login.restart')}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.login.title')}>
      {error !== null && <Alert tone="error">{shownError}</Alert>}
      {isApiError(error, 'EMAIL_NOT_VERIFIED') &&
        (resent ? (
          <Alert tone="success">{t('auth.login.resendDone')}</Alert>
        ) : (
          <Button variant="secondary" type="button" onClick={resendVerification}>
            {t('auth.login.resendVerification')}
          </Button>
        ))}
      {supportsPasskeys && (
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void signInWithPasskey()}
            pending={pending}
            pendingLabel={t('auth.pending')}
          >
            {t('auth.login.signInWithPasskey')}
          </Button>
          <p className="text-center text-sm text-text-muted">{t('auth.login.or')}</p>
        </>
      )}
      <form onSubmit={submitPassword} className="flex flex-col gap-5" noValidate>
        <TextField
          name="email"
          type="email"
          label={t('auth.fields.email')}
          autoComplete="username webauthn"
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
