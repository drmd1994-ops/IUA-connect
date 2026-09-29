'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { useAuth } from '../auth-context';
import { ReauthForm } from './reauth-form';
import { RecoveryCodes } from './recovery-codes';

type Status = components['schemas']['MfaStatusDto'];
type Setup = components['schemas']['TotpSetupDto'];

type Pending = null | 'setup' | 'disable' | 'regenerate';

/** Authenticator app (TOTP). `refreshKey` changes when passkeys change (they affect canDisable). */
export function MfaSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const t = useTranslations();
  const { api, call, reloadMe } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  /** The action waiting for re-authentication, if any. */
  const [needsReauth, setNeedsReauth] = useState<Pending>(null);

  const [version, setVersion] = useState(0);
  const load = async () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/auth/mfa'))
      .then((result) => active && setStatus(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version, refreshKey]);

  /** Runs an action; if it needs re-authentication, asks for it and remembers the action. */
  async function run(action: Exclude<Pending, null>) {
    setBusy(true);
    setError(null);
    try {
      if (action === 'setup') {
        setSetup(await call(() => api.POST('/api/v1/auth/mfa/totp/setup')));
      } else if (action === 'regenerate') {
        const result = await call(() => api.POST('/api/v1/auth/mfa/recovery-codes'));
        setCodes(result.recoveryCodes);
        await load();
      } else if (action === 'disable' && status?.factorId) {
        const factorId = status.factorId;
        await call(() =>
          api.DELETE('/api/v1/auth/mfa/{factorId}', { params: { path: { factorId } } }),
        );
        await Promise.all([load(), reloadMe()]);
      }
      setNeedsReauth(null);
    } catch (caught) {
      if (isApiError(caught, 'REAUTHENTICATION_REQUIRED')) setNeedsReauth(action);
      else setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup) return;
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    setBusy(true);
    setError(null);
    try {
      const result = await call(() =>
        api.POST('/api/v1/auth/mfa/totp/confirm', { body: { factorId: setup.factorId, code } }),
      );
      setSetup(null);
      setCodes(result.recoveryCodes);
      await Promise.all([load(), reloadMe()]);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p role="status">{t('auth.loading')}</p>;

  return (
    <div className="flex flex-col gap-4">
      <p>
        <span className="font-semibold">{t('auth.security.mfaTitle')}: </span>
        <span data-testid="mfa-status">
          {status.enabled ? t('auth.security.mfaOn') : t('auth.security.mfaOff')}
        </span>
      </p>
      <p className="text-sm text-text-muted">{t('auth.security.mfaExplain')}</p>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}

      {needsReauth && (
        <ReauthForm
          needsCode={status.enabled}
          onDone={() => void run(needsReauth)}
          onCancel={() => setNeedsReauth(null)}
        />
      )}

      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

      {!status.enabled && !setup && !needsReauth && (
        <div>
          <Button
            type="button"
            onClick={() => void run('setup')}
            pending={busy}
            pendingLabel={t('auth.pending')}
          >
            {t('auth.security.setupStart')}
          </Button>
        </div>
      )}

      {setup && (
        <div className="flex flex-col gap-4 rounded-md border border-border p-5">
          <p>{t('auth.security.setupScan')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from our API */}
          <img
            src={setup.qrCode}
            alt={t('auth.security.qrAlt')}
            width={200}
            height={200}
            className="rounded-md bg-neutral-0 p-2"
          />
          <p className="text-sm">{t('auth.security.setupManual')}</p>
          <code
            dir="ltr"
            className="break-all rounded-md bg-surface-muted p-3 text-sm"
            data-testid="totp-secret"
          >
            {setup.secret}
          </code>
          <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
            <TextField
              name="code"
              label={t('auth.fields.code')}
              hint={t('auth.hints.totp')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <div>
              <Button type="submit" pending={busy} pendingLabel={t('auth.pending')}>
                {t('auth.security.setupConfirm')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {status.enabled && !codes && !needsReauth && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {t('auth.security.recoveryRemaining', { count: status.recoveryCodesRemaining })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => void run('regenerate')}>
              {t('auth.security.regenerate')}
            </Button>
            {!status.canDisable ? (
              <p className="text-sm text-text-muted">{t('auth.security.disableRequiredByRole')}</p>
            ) : (
              <Button type="button" variant="danger" onClick={() => void run('disable')}>
                {t('auth.security.disable')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
