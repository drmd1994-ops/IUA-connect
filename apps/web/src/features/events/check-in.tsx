'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

/**
 * The page a venue's QR code opens on the member's phone (M5 plan §11.3). After sign-in, the code
 * is sent to the API, which records the attendance once.
 */
export function CheckIn({ slug, token }: { slug: string; token: string | null }) {
  const t = useTranslations('events.checkIn');
  if (!token) {
    return (
      <PageFrame>
        <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
        <Alert tone="warning">{t('missing')}</Alert>
      </PageFrame>
    );
  }
  return <RequireSignIn>{() => <Recording slug={slug} token={token} />}</RequireSignIn>;
}

function Recording({ slug, token }: { slug: string; token: string }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [result, setResult] = useState<'done' | 'already' | null>(null);
  const [error, setError] = useState<unknown>(null);

  // The code is sent once. A second request for the same code would answer "already recorded"
  // and could replace the first answer on the screen (effects run twice in development, and
  // again whenever the session is refreshed).
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${slug}|${token}`;
    if (sent.current === key) return;
    sent.current = key;
    call(() =>
      api.POST('/api/v1/events/{slug}/check-in', { params: { path: { slug } }, body: { token } }),
    )
      .then((response) => setResult(response.recorded ? 'done' : 'already'))
      .catch((caught: unknown) => setError(caught));
  }, [api, call, slug, token]);

  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{t('events.checkIn.title')}</h1>
      {result === null && error === null && <p role="status">{t('events.checkIn.working')}</p>}
      {result !== null && (
        <div data-testid="check-in-result">
          <Alert tone="success">{t(`events.checkIn.${result}`)}</Alert>
        </div>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <Link
        href={`/events/${encodeURIComponent(slug)}`}
        className="font-semibold text-primary underline underline-offset-4"
      >
        {t('events.checkIn.toEvent')}
      </Link>
    </PageFrame>
  );
}
