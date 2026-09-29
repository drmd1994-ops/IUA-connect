'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { useDateFormat } from './membership-page';
import { QrCode } from './qr-code';
import { useLocalName } from './reference';

type Membership = NonNullable<components['schemas']['MyMembershipDto']['membership']>;

/** Tokens live 5 minutes; fetch a new one well before that. */
const REFRESH_MS = 4 * 60 * 1000;

export function CardPage() {
  return <RequireSignIn>{() => <Card />}</RequireSignIn>;
}

function Card() {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  const name = useLocalName();
  const { date } = useDateFormat();
  const { api, call } = useAuth();
  const [details, setDetails] = useState<{ membership: Membership | null; person: string } | null>(
    null,
  );
  const [token, setToken] = useState<{ value: string; at: Date } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/me/membership')),
      call(() => api.GET('/api/v1/me/profile')),
    ])
      .then(([membership, profile]) => {
        if (!active) return;
        setDetails({
          membership: membership.membership,
          person: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
        });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  useEffect(() => {
    if (details?.membership?.status !== 'ACTIVE') return;
    let active = true;
    const fetchToken = () =>
      call(() => api.GET('/api/v1/me/membership/card-token'))
        .then((result) => active && setToken({ value: result.token, at: new Date() }))
        .catch((caught: unknown) => active && setError(caught));
    void fetchToken();
    const timer = window.setInterval(() => void fetchToken(), REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, call, details]);

  const membership = details?.membership;
  const verifyUrl =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/${locale}/card/verify?t=${encodeURIComponent(token.value)}`
      : null;

  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('membership.card.title')}</h1>
        <p className="mt-2 text-text-muted">{t('membership.card.intro')}</p>
      </div>
      {error !== null && !isApiError(error, 'BUSINESS_RULE_VIOLATION') && (
        <Alert tone="error">{errorMessage(error, t)}</Alert>
      )}
      {!details && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {details && membership?.status !== 'ACTIVE' && <Alert>{t('membership.card.noActive')}</Alert>}
      {details && membership?.status === 'ACTIVE' && (
        <article
          className="flex flex-col items-center gap-4 self-center rounded-xl border border-border bg-surface p-6 shadow-raised sm:w-96"
          data-testid="membership-card"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-800">
            {t('membership.card.association')}
          </p>
          <p className="text-2xl font-semibold">{details.person}</p>
          <p>{name(membership.type)}</p>
          <p className="text-sm text-text-muted">
            {t('membership.card.validUntil', { date: date(membership.endDate) })}
          </p>
          {verifyUrl ? (
            <QrCode
              value={verifyUrl}
              label={t('membership.card.qrLabel', { name: details.person })}
            />
          ) : (
            <p role="status">{t('membership.common.loading')}</p>
          )}
          {token && (
            <p className="text-xs text-text-muted" aria-live="polite">
              {t('membership.card.refreshed', {
                time: format.dateTime(token.at, { timeStyle: 'short' }),
              })}
            </p>
          )}
        </article>
      )}
    </PageFrame>
  );
}
