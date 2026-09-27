'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-errors';
import { useAuth } from '../auth-context';

type SessionItem = components['schemas']['SessionListDto']['sessions'][number];

export function SessionsSection({ refreshKey }: { refreshKey: number }) {
  const t = useTranslations();
  const format = useFormatter();
  const { api, call } = useAuth();
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [version, setVersion] = useState(0);
  const load = async () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/auth/sessions'))
      .then((result) => active && setSessions(result.sessions))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, refreshKey, version]);

  async function revoke(id: string) {
    setError(null);
    try {
      await call(() => api.DELETE('/api/v1/auth/sessions/{id}', { params: { path: { id } } }));
      await load();
    } catch (caught) {
      setError(caught);
    }
  }

  async function revokeOthers() {
    setError(null);
    try {
      const result = await call(() => api.DELETE('/api/v1/auth/sessions'));
      setMessage(t('auth.security.revokedOthers', { count: result.revoked }));
      await load();
    } catch (caught) {
      setError(caught);
    }
  }

  if (!sessions) return <p role="status">{t('auth.loading')}</p>;
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const others = sessions.filter((session) => !session.current);

  return (
    <div className="flex flex-col gap-4">
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      <ul
        className="flex flex-col divide-y divide-border rounded-md border border-border"
        data-testid="sessions"
      >
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">
                {session.device}
                {session.current && (
                  <span className="ms-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                    {t('auth.security.sessionCurrent')}
                  </span>
                )}
              </p>
              <p className="text-sm text-text-muted">
                {t('auth.security.sessionDetails', {
                  lastSeen: when(session.lastSeenAt),
                  started: when(session.createdAt),
                })}
              </p>
            </div>
            {!session.current && (
              <Button type="button" variant="secondary" onClick={() => void revoke(session.id)}>
                {t('auth.security.revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => void revokeOthers()}>
            {t('auth.security.revokeOthers')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-text-muted">{t('auth.security.noOtherSessions')}</p>
      )}
    </div>
  );
}
