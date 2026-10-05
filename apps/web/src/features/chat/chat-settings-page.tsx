'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { Avatar, chatLink, usePersonLabel } from './chat-parts';

type Settings = components['schemas']['ChatSettingsDto'];
type Blocked = components['schemas']['BlockListDto']['items'];

/** Who may write to the person, what they show others, and the people they blocked. */
export function ChatSettingsPage() {
  return <RequireSignIn>{() => <ChatSettings />}</RequireSignIn>;
}

function ChatSettings() {
  const all = useTranslations();
  const t = useTranslations('chat.settings');
  const g = useTranslations('groups.settings');
  const label = usePersonLabel();
  const { api, call } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [listed, setListed] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/me/chat-settings')),
      call(() => api.GET('/api/v1/chat/blocks')),
      call(() => api.GET('/api/v1/me/consents')),
    ])
      .then(([own, blocks, consents]) => {
        if (!active) return;
        setSettings(own);
        setBlocked(blocks.items);
        setListed(consents.directory.granted);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  const set = (change: Partial<Settings>) => {
    setSaved(false);
    setSettings((current) => (current ? { ...current, ...change } : current));
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      setSettings(await call(() => api.PUT('/api/v1/me/chat-settings', { body: settings })));
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function unblock(userId: string) {
    setError(null);
    try {
      await call(() =>
        api.DELETE('/api/v1/chat/blocks/{userId}', { params: { path: { userId } } }),
      );
      setBlocked((current) => current?.filter((item) => item.user.id !== userId) ?? null);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <PageFrame>
      <div>
        <Link href="/chat" className={chatLink}>
          {t('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{t('title')}</h1>
      </div>
      {!settings && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {settings && (
        <form onSubmit={save} noValidate className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">{t('audience')}</legend>
            {(
              [
                ['LISTED', t('audienceListed')],
                ['NOBODY', t('audienceNobody')],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="audience"
                  className="mt-1 size-5"
                  checked={settings.audience === value}
                  disabled={pending}
                  onChange={() => set({ audience: value })}
                />
                <span>{text}</span>
              </label>
            ))}
            <p className="text-sm text-text-muted">{t('audienceNote')}</p>
            {listed === false && settings.audience === 'LISTED' && (
              <Alert>
                {t('notListed')}{' '}
                <Link href="/account/profile" className={chatLink}>
                  {t('profileLink')}
                </Link>
              </Alert>
            )}
          </fieldset>

          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={settings.readReceipts}
                disabled={pending}
                onChange={(event) => set({ readReceipts: event.target.checked })}
              />
              <span>
                <span className="font-semibold">{t('readReceipts')}</span>
                <span className="block text-sm text-text-muted">{t('readReceiptsHint')}</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={settings.typing}
                disabled={pending}
                onChange={(event) => set({ typing: event.target.checked })}
              />
              <span className="font-semibold">{t('typing')}</span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={settings.showActivity}
                disabled={pending}
                onChange={(event) => set({ showActivity: event.target.checked })}
              />
              <span>
                <span className="font-semibold">{g('showActivity')}</span>
                <span className="block text-sm text-text-muted">{g('showActivityHint')}</span>
              </span>
            </label>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">{g('invitesFrom')}</legend>
            {(
              [
                ['LISTED', g('invitesListed')],
                ['CONTACTS', g('invitesContacts')],
                ['NOBODY', g('invitesNobody')],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="invitesFrom"
                  className="mt-1 size-5"
                  checked={settings.invitesFrom === value}
                  disabled={pending}
                  onChange={() => set({ invitesFrom: value })}
                />
                <span>{text}</span>
              </label>
            ))}
            <p className="text-sm text-text-muted">{g('invitesNote')}</p>
          </fieldset>

          {saved && <Alert tone="success">{t('saved')}</Alert>}
          <div>
            <Button type="submit" pending={pending}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}

      {blocked && (
        <section aria-labelledby="chat-blocked" className="flex flex-col gap-3">
          <h2 id="chat-blocked" className="text-xl font-semibold">
            {t('blocked')}
          </h2>
          {blocked.length === 0 ? (
            <p className="text-text-muted">{t('noBlocked')}</p>
          ) : (
            <ul data-testid="blocked-list" className="flex flex-col gap-2">
              {blocked.map(({ user }) => {
                const name = label(user);
                return (
                  <li
                    key={user.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar person={user} size="size-9" />
                      <span className="truncate">{name}</span>
                    </span>
                    {user.id && (
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={t('unblockName', { name })}
                        onClick={() => void unblock(user.id!)}
                      >
                        {t('unblock')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <p className="text-sm text-text-muted">
        {t('notifications')}{' '}
        <Link href="/account/notifications/preferences" className={chatLink}>
          {t('notificationsLink')}
        </Link>
      </p>
    </PageFrame>
  );
}
