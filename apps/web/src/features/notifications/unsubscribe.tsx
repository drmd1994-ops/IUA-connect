'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { unwrap, useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

const link = 'font-semibold text-primary underline underline-offset-4';

/**
 * Opens from the link at the end of an email: switches that kind of email off, without signing
 * in. The request is sent by the page's script, not by opening the address, so programs that
 * only fetch the links in an email change nothing.
 */
export function Unsubscribe({ token }: { token: string | null }) {
  const t = useTranslations();
  const u = (key: string) => t(`notifications.unsubscribe.${key}`);
  const { api } = useAuth();
  const [kinds, setKinds] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  // React runs effects twice in development; one request is enough.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    void api
      .POST('/api/v1/notifications/unsubscribe', { body: { token } })
      .then((result) => setKinds(unwrap(result).kinds))
      .catch((caught: unknown) => setError(caught));
  }, [api, token]);

  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{u('title')}</h1>
      {!token && <Alert tone="warning">{u('missing')}</Alert>}
      {token && !kinds && error === null && <p role="status">{u('working')}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {kinds && (
        <div data-testid="unsubscribed">
          <Alert tone="success">{u('done')}</Alert>
          <ul className="mt-3 list-disc ps-6">
            {kinds.map((kind) => (
              <li key={kind}>{t(`notifications.kinds.${kind}`)}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <Link href="/account/notifications/preferences" className={link}>
          {u('preferences')}
        </Link>
        <span className="block text-sm text-text-muted">{u('signInNote')}</span>
      </p>
    </PageFrame>
  );
}
