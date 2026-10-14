'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { useLocalName } from '@/features/membership/reference';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { useDates } from './verification-page';

type Review = components['schemas']['ReviewVerificationDto'];
type RegisterStatus = NonNullable<
  components['schemas']['VerificationDecisionDto']['registerStatus']
>;
type Tab = 'PENDING' | 'APPROVED' | 'REJECTED';

const TABS: Tab[] = ['PENDING', 'APPROVED', 'REJECTED'];
const REGISTER_STATUSES: RegisterStatus[] = [
  'ACTIVE_PERMANENT',
  'ACTIVE_TEMPORARY',
  'SUSPENDED',
  'NOT_FOUND',
];
/** The Ministry of Health's public search of licensed professionals. */
const REGISTER_URL = 'https://www.gov.il/he/service/licensed-medical-practitioners';

/**
 * The platform's reviewers (physicians.verify, M17): requests waiting, oldest first, and those
 * decided. A licence number is never shown here: the reviewer searches the register by name and
 * types the number it shows, which the API compares.
 */
export function VerificationReviewPage() {
  const t = useTranslations('verification.review');
  const all = useTranslations();
  const { api, call } = useAuth();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [items, setItems] = useState<Review[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/physician-verifications', { params: { query: { state: tab } } }))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, tab, version]);

  const done = (text: string) => {
    setMessage(text);
    setVersion((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
        <p className="mt-2 text-text-muted">{t('intro')}</p>
        <a
          href={REGISTER_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block font-semibold text-primary underline underline-offset-4"
        >
          {t('registerLink')}
        </a>
      </div>
      <div role="tablist" aria-label={t('title')} className="flex flex-wrap gap-2">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setMessage(null);
              setItems(null);
              setTab(value);
            }}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${
              tab === value
                ? 'border-primary bg-primary text-on-primary'
                : 'border-border hover:bg-surface-muted'
            }`}
          >
            {t(`tabs.${value}`)}
          </button>
        ))}
      </div>
      {message && <Alert tone="success">{message}</Alert>}
      {error !== null && (
        <Alert tone="error">
          {isApiError(error, 'FORBIDDEN') ? t('notAllowed') : errorMessage(error, all)}
        </Alert>
      )}
      {!items && error === null && <p role="status">{t('loading')}</p>}
      {items &&
        (items.length === 0 ? (
          <p className="text-text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-4" data-testid="verification-queue">
            {items.map((item) => (
              <ReviewItem key={item.id} item={item} onDone={done} />
            ))}
          </ul>
        ))}
    </div>
  );
}

function ReviewItem({ item, onDone }: { item: Review; onDone: (message: string) => void }) {
  const t = useTranslations('verification');
  const all = useTranslations();
  const name = useLocalName();
  const { day, long } = useDates();
  const { api, call } = useAuth();
  const [registerStatus, setRegisterStatus] = useState<RegisterStatus | ''>('');
  const [registerLicence, setRegisterLicence] = useState('');
  const [registerCertificate, setRegisterCertificate] = useState('');
  const [mode, setMode] = useState<'idle' | 'rejecting' | 'revoking'>('idle');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const student = item.kind === 'STUDENT';
  const person =
    [item.person.firstName, item.person.lastName].filter(Boolean).join(' ') || item.person.email;
  const otherNames = [item.person.nameHe, item.person.nameEn].filter(Boolean).join(' · ');

  async function attempt(work: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const decide = (decision: 'APPROVE' | 'REJECT') =>
    attempt(async () => {
      await call(() =>
        api.POST('/api/v1/physician-verifications/{id}/decisions', {
          params: { path: { id: item.id } },
          body:
            decision === 'REJECT'
              ? { decision, reason: reason.trim() }
              : {
                  decision,
                  ...(registerStatus ? { registerStatus } : {}),
                  ...(registerLicence ? { registerLicence } : {}),
                  ...(registerCertificate ? { registerCertificate } : {}),
                },
        }),
      );
      onDone(t(decision === 'APPROVE' ? 'review.approved' : 'review.rejected'));
    });

  const revoke = () =>
    attempt(async () => {
      await call(() =>
        api.POST('/api/v1/physician-verifications/people/{userId}/revoke', {
          params: { path: { userId: item.person.userId } },
          body: { reason: reason.trim() },
        }),
      );
      onDone(t('review.revoked'));
    });

  const openDocument = () =>
    attempt(async () => {
      const link = await call(() =>
        api.GET('/api/v1/physician-verifications/{id}/document', {
          params: { path: { id: item.id } },
        }),
      );
      window.open(link.url, '_blank', 'noopener,noreferrer');
    });

  const headingId = `verification-${item.id}`;
  return (
    <li
      className="flex flex-col gap-3 rounded-md border border-border p-5"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {person}
      </h2>
      {otherNames && <p className="text-sm text-text-muted">{otherNames}</p>}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">{t('review.kind')}</dt>
          <dd className="font-semibold">{t(`kinds.${item.kind}`)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('review.email')}</dt>
          <dd dir="ltr" className="break-words text-start">
            {item.person.email}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('review.sent')}</dt>
          <dd>
            {long(item.createdAt)}
            {item.state === 'PENDING' && (
              <span className="block text-text-muted">
                {t('review.waiting', { days: item.waitingDays })}
              </span>
            )}
          </dd>
        </div>
        {item.school && (
          <div>
            <dt className="text-text-muted">{t('review.school')}</dt>
            <dd>{name(item.school)}</dd>
          </div>
        )}
        {item.expectedGraduation && (
          <div>
            <dt className="text-text-muted">{t('review.graduation')}</dt>
            <dd>{day(item.expectedGraduation)}</dd>
          </div>
        )}
      </dl>
      {item.certificateProvided && <p className="text-sm">{t('review.certificateGiven')}</p>}
      {item.note && (
        <div className="text-sm">
          <p className="text-text-muted">{t('review.note')}</p>
          <p className="whitespace-pre-line break-words">{item.note}</p>
        </div>
      )}
      {item.earlier.length > 0 && (
        <div className="text-sm">
          <p className="text-text-muted">{t('review.earlier')}</p>
          <ul>
            {item.earlier.map((earlier) => (
              <li key={earlier.id}>
                {t('review.earlierLine', {
                  kind: t(`kinds.${earlier.kind}`),
                  state: t(`page.states.${earlier.state}`),
                  date: long(earlier.createdAt),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.findings.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {item.findings.map((finding) => (
            <li key={finding.at}>
              {t('page.decisionLine', {
                decision: t(`page.decisions.${finding.decision}`),
                date: long(finding.at),
              })}
              {finding.registerStatus && (
                <span className="text-text-muted">
                  {' · '}
                  {t(`review.registerStatuses.${finding.registerStatus}`)}
                </span>
              )}
              {finding.licenceMatches && (
                <span className="text-text-muted"> · {t('review.matches')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {item.decisions
        .filter((decision) => decision.reason)
        .map((decision) => (
          <p key={decision.at} className="text-sm text-text-muted">
            {t('page.reason', { reason: decision.reason! })}
          </p>
        ))}

      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}

      {item.state === 'PENDING' && mode === 'idle' && (
        <div className="flex flex-col gap-4">
          {student ? (
            <>
              <p className="text-sm">{t('review.studentCheck')}</p>
              {item.documentHeld ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="self-start"
                  pending={pending}
                  onClick={() => void openDocument()}
                >
                  {t('review.openDocument')}
                </Button>
              ) : (
                <Alert tone="warning">{t('review.documentGone')}</Alert>
              )}
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t('review.registerStatus')}
                placeholder={t('review.chooseStatus')}
                value={registerStatus}
                onChange={(event) => setRegisterStatus(event.target.value as RegisterStatus)}
                options={REGISTER_STATUSES.map((value) => ({
                  value,
                  label: t(`review.registerStatuses.${value}`),
                }))}
              />
              <TextField
                label={t('review.registerLicence')}
                value={registerLicence}
                onChange={(event) => setRegisterLicence(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={40}
              />
              {item.kind === 'SPECIALIST' && (
                <TextField
                  label={t('review.registerCertificate')}
                  value={registerCertificate}
                  onChange={(event) => setRegisterCertificate(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={40}
                />
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="button" pending={pending} onClick={() => void decide('APPROVE')}>
              {t('review.approve')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode('rejecting')}>
              {t('review.reject')}
            </Button>
          </div>
        </div>
      )}

      {item.state === 'APPROVED' && mode === 'idle' && (
        <div>
          <Button type="button" variant="secondary" onClick={() => setMode('revoking')}>
            {t('review.revoke')}
          </Button>
        </div>
      )}

      {mode !== 'idle' && (
        <div className="flex flex-col gap-3">
          <TextareaField
            label={mode === 'rejecting' ? t('review.reason') : t('review.revokeReason')}
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
              onClick={() => void (mode === 'rejecting' ? decide('REJECT') : revoke())}
            >
              {mode === 'rejecting' ? t('review.confirmReject') : t('review.confirmRevoke')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode('idle')}>
              {t('review.cancel')}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
