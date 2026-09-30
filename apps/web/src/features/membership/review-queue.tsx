'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { DecisionList, useDateFormat } from './membership-page';
import { useLocalName } from './reference';

type Review = components['schemas']['ReviewApplicationDto'];
type Stage = 'director' | 'admin';

const CHECK = '✓';

/**
 * Applications waiting for the signed-in director (their departments) or admin (final approval).
 * The API decides which applications the caller may see and decide.
 */
export function ReviewQueue({ stage }: { stage: Stage }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Review[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/verification-requests', { params: { query: { stage } } }))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, stage, version]);

  if (error !== null) {
    return (
      <Alert tone="error">
        {isApiError(error, 'FORBIDDEN')
          ? t('membership.review.notAllowed')
          : errorMessage(error, t)}
      </Alert>
    );
  }
  if (!items) return <p role="status">{t('membership.common.loading')}</p>;
  return (
    <div className="flex flex-col gap-4">
      {message && <Alert tone="success">{message}</Alert>}
      {items.length === 0 ? (
        <p className="text-text-muted">{t('membership.review.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="review-queue">
          {items.map((item) => (
            <ReviewItem
              key={item.id}
              item={item}
              onDecided={(text) => {
                setMessage(text);
                setVersion((v) => v + 1);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewItem({ item, onDecided }: { item: Review; onDecided: (message: string) => void }) {
  const t = useTranslations();
  const name = useLocalName();
  const { dateTime } = useDateFormat();
  const { api, call } = useAuth();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const applicant =
    [item.applicant.firstName, item.applicant.lastName].filter(Boolean).join(' ') ||
    item.applicant.email;

  async function decide(decision: 'APPROVE' | 'REJECT') {
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/verification-requests/{id}/decisions', {
          params: { path: { id: item.id } },
          body: { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) },
        }),
      );
      onDecided(
        t(decision === 'APPROVE' ? 'membership.review.approved' : 'membership.review.rejected'),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const headingId = `application-${item.id}`;
  return (
    <li
      className="flex flex-col gap-3 rounded-md border border-border p-5"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {applicant}
      </h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">{t('membership.review.type')}</dt>
          <dd>{name(item.type)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('membership.review.place')}</dt>
          <dd>
            {[name(item.hospital), name(item.department)].filter(Boolean).join(' · ') ||
              t('membership.common.none')}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('membership.review.submitted')}</dt>
          <dd>{dateTime(item.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('membership.review.applicant')}</dt>
          <dd dir="ltr" className="text-start">
            {item.applicant.email}
          </dd>
        </div>
      </dl>
      {item.identifierProvided && (
        <p className="text-sm">
          <span aria-hidden="true">{CHECK} </span>
          {t('membership.application.numberProvided')}
        </p>
      )}
      {item.flags.map((flag) => (
        <Alert key={flag} tone="warning">
          {t(`membership.application.flags.${flag}`)}
        </Alert>
      ))}
      <DecisionList application={item} />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {rejecting ? (
        <div className="flex flex-col gap-3">
          <TextareaField
            label={t('membership.review.reason')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={3}
            required
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="danger"
              pending={pending}
              disabled={!reason.trim()}
              onClick={() => void decide('REJECT')}
            >
              {t('membership.review.confirmReject')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
              {t('membership.common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="button" pending={pending} onClick={() => void decide('APPROVE')}>
            {t('membership.review.approve')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRejecting(true)}>
            {t('membership.review.reject')}
          </Button>
        </div>
      )}
    </li>
  );
}
