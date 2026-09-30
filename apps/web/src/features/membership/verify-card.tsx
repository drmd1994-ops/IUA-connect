'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { errorMessage } from '@/lib/api-errors';
import { useLocalName } from './reference';

type Verification = components['schemas']['CardVerificationDto'];

/** Decorative marks beside the translated result (hidden from screen readers). */
const CHECK = '✓';
const CROSS = '✕';

/** The public page a card's QR code opens: valid or not, the name and the type only. */
export function VerifyCard({ token }: { token: string | null }) {
  const t = useTranslations();
  const name = useLocalName();
  const { api, call } = useAuth();
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    call(() => api.GET('/api/v1/card/verify', { params: { query: { t: token } } }))
      .then((verification) => active && setResult(verification))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, token]);

  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{t('membership.verify.title')}</h1>
      {!token && <Alert>{t('membership.verify.missing')}</Alert>}
      {token && !result && error === null && <p role="status">{t('membership.verify.checking')}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {result?.valid && result.type && (
        <section
          className="flex flex-col gap-3 rounded-xl border-2 border-success-700 bg-success-100 p-6"
          data-testid="verification"
        >
          <p className="text-2xl font-semibold text-success-700" role="status">
            <span aria-hidden="true">{CHECK} </span>
            {t('membership.verify.valid')}
          </p>
          <dl className="grid gap-2">
            <div>
              <dt className="text-sm">{t('membership.verify.name')}</dt>
              <dd className="text-lg font-semibold">{result.name}</dd>
            </div>
            <div>
              <dt className="text-sm">{t('membership.verify.type')}</dt>
              <dd className="text-lg font-semibold">{name(result.type)}</dd>
            </div>
          </dl>
        </section>
      )}
      {result && !result.valid && (
        <section
          className="flex flex-col gap-2 rounded-xl border-2 border-danger-700 bg-danger-100 p-6"
          data-testid="verification"
        >
          <p className="text-2xl font-semibold text-danger-700" role="status">
            <span aria-hidden="true">{CROSS} </span>
            {t('membership.verify.invalid')}
          </p>
          <p>{t('membership.verify.invalidHint')}</p>
        </section>
      )}
    </PageFrame>
  );
}
