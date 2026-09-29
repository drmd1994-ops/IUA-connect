'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { useAuth } from '../auth-context';
import { usePasskeysSupported } from '../login-form';
import { PasskeyCeremonyError, createPasskey } from '../passkeys';
import { ReauthForm } from './reauth-form';

type Passkey = components['schemas']['PasskeyDto'];
type PendingAction = { kind: 'add'; name: string } | { kind: 'remove'; id: string };

/** The user's passkeys: add (browser prompt), rename, remove. */
export function PasskeysSection({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const { api, call, reloadMe } = useAuth();
  const supported = usePasskeysSupported();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  /** Whether an authenticator app is on (re-authentication then asks for its code too). */
  const [hasAuthenticatorApp, setHasAuthenticatorApp] = useState(false);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** The action waiting for re-authentication, if any. */
  const [needsReauth, setNeedsReauth] = useState<PendingAction | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/auth/passkeys')),
      call(() => api.GET('/api/v1/auth/mfa')),
    ])
      .then(([list, mfa]) => {
        if (!active) return;
        setPasskeys(list.passkeys);
        setHasAuthenticatorApp(mfa.enabled);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  const refresh = async () => {
    setVersion((v) => v + 1);
    onChanged();
    await reloadMe();
  };

  async function run(action: PendingAction) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action.kind === 'add') {
        const options = await call(() => api.POST('/api/v1/auth/passkeys/registration/options'));
        const response = await createPasskey(options);
        await call(() =>
          api.POST('/api/v1/auth/passkeys/registration/verify', {
            body: { response, name: action.name },
          }),
        );
        setNotice(t('auth.passkeys.added'));
      } else {
        await call(() =>
          api.DELETE('/api/v1/auth/passkeys/{id}', { params: { path: { id: action.id } } }),
        );
      }
      setNeedsReauth(null);
      await refresh();
    } catch (caught) {
      if (isApiError(caught, 'REAUTHENTICATION_REQUIRED')) setNeedsReauth(action);
      else setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    await run({ kind: 'add', name: name || t('auth.passkeys.defaultName') });
  }

  async function rename(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    if (!name) return;
    setError(null);
    try {
      await call(() =>
        api.PATCH('/api/v1/auth/passkeys/{id}', { params: { path: { id } }, body: { name } }),
      );
      setRenaming(null);
      setVersion((v) => v + 1);
    } catch (caught) {
      setError(caught);
    }
  }

  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  const shownError =
    error instanceof PasskeyCeremonyError
      ? t(`auth.passkeys.${error.reason}`)
      : isApiError(error, 'MFA_REQUIRED_BY_ROLE')
        ? t('auth.passkeys.lastFactor')
        : errorMessage(error, t);

  if (!supported) {
    return <Alert>{t('auth.passkeys.unsupported')}</Alert>;
  }
  if (!passkeys) return <p role="status">{t('auth.loading')}</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{t('auth.passkeys.intro')}</p>
      {error !== null && <Alert tone="error">{shownError}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {needsReauth && (
        <ReauthForm
          needsCode={hasAuthenticatorApp}
          onDone={() => void run(needsReauth)}
          onCancel={() => setNeedsReauth(null)}
        />
      )}

      {passkeys.length === 0 ? (
        <p className="text-sm">{t('auth.passkeys.none')}</p>
      ) : (
        <ul
          className="flex flex-col divide-y divide-border rounded-md border border-border"
          data-testid="passkeys"
        >
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              {renaming === passkey.id ? (
                <form
                  onSubmit={(event) => void rename(event, passkey.id)}
                  className="flex flex-wrap items-end gap-3"
                  noValidate
                >
                  <TextField
                    name="name"
                    label={t('auth.passkeys.nameLabel')}
                    defaultValue={passkey.name}
                    maxLength={100}
                    autoFocus
                    required
                  />
                  <Button type="submit">{t('auth.passkeys.save')}</Button>
                  <Button type="button" variant="secondary" onClick={() => setRenaming(null)}>
                    {t('auth.passkeys.cancel')}
                  </Button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="font-semibold">
                      {passkey.name}
                      {passkey.synced && (
                        <span className="ms-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                          {t('auth.passkeys.synced')}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-text-muted">
                      {t('auth.passkeys.created', { date: when(passkey.createdAt) })}
                      {' · '}
                      {passkey.lastUsedAt
                        ? t('auth.passkeys.lastUsed', { date: when(passkey.lastUsedAt) })
                        : t('auth.passkeys.neverUsed')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setRenaming(passkey.id)}
                    >
                      {t('auth.passkeys.rename')}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => void run({ kind: 'remove', id: passkey.id })}
                    >
                      {t('auth.passkeys.remove')}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {passkeys.length === 1 && !hasAuthenticatorApp && (
        <p className="text-sm text-text-muted">{t('auth.passkeys.backupHint')}</p>
      )}

      {!needsReauth && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3" noValidate>
          <TextField
            name="name"
            label={t('auth.passkeys.nameLabel')}
            hint={t('auth.passkeys.nameHint')}
            maxLength={100}
            className="min-w-64"
          />
          <Button type="submit" pending={busy} pendingLabel={t('auth.pending')}>
            {t('auth.passkeys.add')}
          </Button>
        </form>
      )}
    </div>
  );
}
