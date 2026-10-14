'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Preference = components['schemas']['NotificationPreferencesDto']['items'][number];

const link = 'font-semibold text-primary underline underline-offset-4';

/** Which kinds of notice the person wants, in the app and by email. */
export function NotificationPreferencesPage() {
  return <RequireSignIn>{() => <Preferences />}</RequireSignIn>;
}

function Preferences() {
  const t = useTranslations();
  const p = (key: string, values?: Record<string, string>) =>
    t(`notifications.preferences.${key}`, values);
  const { api, call } = useAuth();
  const [items, setItems] = useState<Preference[] | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/notification-preferences'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  const set = (kind: Preference['kind'], channel: 'app' | 'email', value: boolean) => {
    setSaved(false);
    setItems(
      (current) =>
        current?.map((item) => (item.kind === kind ? { ...item, [channel]: value } : item)) ?? null,
    );
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!items) return;
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await call(() =>
        api.PUT('/api/v1/me/notification-preferences', {
          body: {
            items: items
              .filter((item) => !item.locked)
              .map(({ kind, app, email }) => ({ kind, app, email })),
          },
        }),
      );
      setItems(result.items);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <PageFrame>
      <div>
        <Link href="/account/notifications" className={link}>
          {p('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{p('title')}</h1>
        <p className="mt-2 text-text-muted">{p('intro')}</p>
      </div>
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items && (
        <form onSubmit={save} noValidate className="flex flex-col gap-6">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm" data-testid="preferences-table">
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="p-3 text-start">
                    {p('kind')}
                  </th>
                  <th scope="col" className="p-3 text-center">
                    {p('app')}
                  </th>
                  <th scope="col" className="p-3 text-center">
                    {p('email')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const kind = t(`notifications.kinds.${item.kind}`);
                  return (
                    <tr key={item.kind}>
                      <th scope="row" className="p-3 text-start font-normal">
                        <span className="font-semibold">{kind}</span>
                        <span className="block text-text-muted">
                          {t(`notifications.kindHints.${item.kind}`)}
                          {item.locked && ` ${p('alwaysOn')}.`}
                        </span>
                      </th>
                      {(['app', 'email'] as const).map((channel) => (
                        <td key={channel} className="p-3 text-center">
                          <input
                            type="checkbox"
                            className="size-5"
                            aria-label={p(channel === 'app' ? 'appFor' : 'emailFor', { kind })}
                            checked={item[channel]}
                            disabled={item.locked || pending}
                            onChange={(event) => set(item.kind, channel, event.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-text-muted">{p('digestNote')}</p>
          <p className="text-sm text-text-muted">{p('securityNote')}</p>
          {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
          {saved && <Alert tone="success">{p('saved')}</Alert>}
          <div>
            <Button type="submit" pending={pending}>
              {p('save')}
            </Button>
          </div>
        </form>
      )}
      {!items && error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
    </PageFrame>
  );
}
