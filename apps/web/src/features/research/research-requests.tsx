'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { PersonLine, ResearchFrame, ResearchNav, link } from './research-parts';

type ResearchRequest = components['schemas']['ResearchRequestDto'];
type Step = 'accept' | 'decline' | 'withdraw';

/** Requests to join the reader's projects, and the reader's own requests (M27). Theirs alone. */
export function ResearchRequests() {
  return (
    <ResearchFrame>
      <Requests />
    </ResearchFrame>
  );
}

function Requests() {
  const t = useTranslations();
  const { api, call, me } = useAuth();
  const [items, setItems] = useState<ResearchRequest[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/research/requests'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function act(item: ResearchRequest, step: Step) {
    setPending(item.id);
    setError(null);
    try {
      const params = { params: { path: { id: item.id } } };
      const next = await call(() =>
        step === 'accept'
          ? api.POST('/api/v1/research/requests/{id}/accept', params)
          : step === 'decline'
            ? api.POST('/api/v1/research/requests/{id}/decline', params)
            : api.POST('/api/v1/research/requests/{id}/withdraw', params),
      );
      setItems((current) => current && current.map((x) => (x.id === next.id ? next : x)));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  const r = (key: string) => t(`research.requests.${key}`);
  const toYou = items?.filter((item) => item.role === 'lead') ?? [];
  const yours = items?.filter((item) => item.role === 'asker') ?? [];
  const section = (
    id: string,
    title: string,
    empty: string,
    list: ResearchRequest[],
    testId: string,
  ) => (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {list.length === 0 ? (
        <p className="text-text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-4" data-testid={testId}>
          {list.map((item) => (
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
  );
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{r('title')}</h1>
        <p className="mt-2 text-text-muted">{r('intro')}</p>
      </div>
      <ResearchNav canList={me?.verifiedAs !== 'STUDENT'} />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items && (
        <>
          {me?.verifiedAs !== 'STUDENT' &&
            section('requests-to-you', r('toYou'), r('emptyToYou'), toYou, 'requests-to-you')}
          {section('requests-yours', r('yours'), r('emptyYours'), yours, 'requests-yours')}
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
  item: ResearchRequest;
  pending: boolean;
  onStep: (step: Step) => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const r = (key: string) => t(`research.requests.${key}`);
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5">
      <h3 className="text-lg font-semibold">
        <PersonLine person={item.other} />
      </h3>
      <p>
        <Link href={`/research/${item.project.id}`} className={link}>
          {t('research.requests.project', { title: item.project.title })}
        </Link>
      </p>
      <p className="text-sm text-text-muted">
        {t(`research.requests.states.${item.state}`)} ·{' '}
        {t('research.requests.sentOn', {
          date: format.dateTime(new Date(item.createdAt), { dateStyle: 'long' }),
        })}
      </p>
      <p className="whitespace-pre-line">{item.message}</p>
      <div className="flex flex-wrap items-center gap-3">
        {item.role === 'lead' && item.state === 'PENDING' && (
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
        {item.role === 'asker' && item.state === 'PENDING' && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onStep('withdraw')}
          >
            {r('withdraw')}
          </Button>
        )}
      </div>
    </article>
  );
}
