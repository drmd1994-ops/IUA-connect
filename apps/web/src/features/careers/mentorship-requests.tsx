'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { CareersNav } from './careers-parts';

type Mentorship = components['schemas']['MentorshipDto'];
type Step = 'accept' | 'decline' | 'withdraw' | 'end';
const link = 'font-semibold text-primary underline underline-offset-4';

/** The reader's requests and mentorships, as a mentor and as a mentee (M28). Theirs alone. */
export function MentorshipRequests() {
  return <RequireSignIn>{() => <Requests />}</RequireSignIn>;
}

function Requests() {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Mentorship[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/mentorship/requests'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function act(item: Mentorship, step: Step) {
    setPending(item.id);
    setError(null);
    try {
      const params = { params: { path: { id: item.id } } };
      const next = await call(() =>
        step === 'accept'
          ? api.POST('/api/v1/mentorship/requests/{id}/accept', params)
          : step === 'decline'
            ? api.POST('/api/v1/mentorship/requests/{id}/decline', params)
            : step === 'withdraw'
              ? api.POST('/api/v1/mentorship/requests/{id}/withdraw', params)
              : api.POST('/api/v1/mentorship/requests/{id}/end', params),
      );
      setItems((current) => current && current.map((x) => (x.id === next.id ? next : x)));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  const r = (key: string) => t(`careers.requests.${key}`);
  const toYou = items?.filter((item) => item.role === 'mentor') ?? [];
  const yours = items?.filter((item) => item.role === 'mentee') ?? [];
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{r('title')}</h1>
        <p className="mt-2 text-text-muted">{r('intro')}</p>
      </div>
      <CareersNav />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items && (
        <>
          <section aria-labelledby="requests-to-you" className="flex flex-col gap-3">
            <h2 id="requests-to-you" className="text-xl font-semibold">
              {r('toYou')}
            </h2>
            {toYou.length === 0 ? (
              <p className="text-text-muted">{r('emptyToYou')}</p>
            ) : (
              <ul className="flex flex-col gap-4" data-testid="requests-to-you">
                {toYou.map((item) => (
                  <li key={item.id}>
                    <RequestCard
                      item={item}
                      pending={pending === item.id}
                      onStep={(step) => void act(item, step)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="requests-yours" className="flex flex-col gap-3">
            <h2 id="requests-yours" className="text-xl font-semibold">
              {r('yours')}
            </h2>
            {yours.length === 0 ? (
              <p className="text-text-muted">
                {r('emptyYours')}{' '}
                <Link href="/mentorship" className={link}>
                  {r('findMentor')}
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-4" data-testid="requests-yours">
                {yours.map((item) => (
                  <li key={item.id}>
                    <RequestCard
                      item={item}
                      pending={pending === item.id}
                      onStep={(step) => void act(item, step)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PageFrame>
  );
}

function RequestCard({
  item,
  pending,
  onStep,
}: {
  item: Mentorship;
  pending: boolean;
  onStep: (step: Step) => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const name = useLocalName();
  const other = item.other;
  const fullName = `${other.firstName} ${other.lastName}`;
  const place = [
    other.department ? name(other.department) : null,
    other.hospital ? name(other.hospital) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const r = (key: string) => t(`careers.requests.${key}`);
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5">
      <h3 className="text-lg font-semibold">
        {fullName}
        {other.mark && (
          <span className="ms-2 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-muted">
            {t(`verification.marks.${other.mark}`)}
          </span>
        )}
      </h3>
      {place && <p className="text-text">{place}</p>}
      <p className="text-sm text-text-muted">
        {t(`careers.requests.states.${item.state}`)} ·{' '}
        {t('careers.requests.sentOn', {
          date: format.dateTime(new Date(item.createdAt), { dateStyle: 'long' }),
        })}
      </p>
      <p className="whitespace-pre-line">{item.message}</p>
      <div className="flex flex-wrap items-center gap-3">
        {item.role === 'mentor' && item.state === 'PENDING' && (
          <>
            <Button type="button" disabled={pending} onClick={() => onStep('accept')}>
              {r('accept')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onStep('decline')}
            >
              {r('decline')}
            </Button>
            <span className="text-sm text-text-muted">{r('declineNote')}</span>
          </>
        )}
        {item.role === 'mentee' && item.state === 'PENDING' && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onStep('withdraw')}
          >
            {r('withdraw')}
          </Button>
        )}
        {item.state === 'ACCEPTED' && (
          <>
            {item.conversationId && (
              <Link href={`/chat/${item.conversationId}`} className={link}>
                {r('openChat')}
              </Link>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onStep('end')}
            >
              {r('end')}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
