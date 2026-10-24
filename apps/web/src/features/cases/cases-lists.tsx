'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { errorMessage } from '@/lib/api-errors';
import { CaseCard, CasesFrame, CasesNav, StandingNote } from './cases-parts';

type Schemas = components['schemas'];
type List = Schemas['CaseListDto'];
type Mine = Schemas['MyCasesDto']['items'];
type Queue = Schemas['CaseQueueDto']['items'];

/** Whether the reader reviews cases: asked once by each page, for its tabs. */
function useReviewer(): boolean {
  const { api, call } = useAuth();
  const [reviewer, setReviewer] = useState(false);
  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/cases', { params: { query: { page: 1 } } }))
      .then((result) => active && setReviewer(result.reviewer))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);
  return reviewer;
}

/** Approved cases, the case of the week first (M26). */
export function CasesList() {
  return (
    <CasesFrame>
      <ListPage />
    </CasesFrame>
  );
}

function ListPage() {
  const t = useTranslations();
  const name = useLocalName();
  const reference = useReference();
  const { api, call } = useAuth();
  const [subspecialty, setSubspecialty] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/cases', {
        params: { query: { page, ...(subspecialty ? { subspecialty } : {}) } },
      }),
    )
      .then((result) => {
        if (!active) return;
        setList(result);
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, subspecialty]);

  const l = (key: string) => t(`cases.list.${key}`);
  const others = list?.items.filter((item) => item.id !== list.week?.id) ?? [];
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{l('title')}</h1>
        <p className="mt-2 text-text-muted">{l('intro')}</p>
      </div>
      <CasesNav reviewer={list?.reviewer ?? false} />
      <StandingNote />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list?.week && page === 1 && (
        <section aria-labelledby="cases-week" className="flex flex-col gap-3">
          <h2 id="cases-week" className="text-xl font-semibold">
            {l('week')}
          </h2>
          <CaseCard item={list.week} highlight />
        </section>
      )}
      <SelectField
        className="max-w-xs"
        label={l('subspecialty')}
        placeholder={l('allSubspecialties')}
        value={subspecialty}
        onChange={(event) => {
          setSubspecialty(event.target.value);
          setPage(1);
        }}
        options={(reference?.subspecialties ?? []).map((s) => ({ value: s.key, label: name(s) }))}
      />
      {list && others.length === 0 && (
        <p role="status" className="text-text-muted">
          {l('empty')}
        </p>
      )}
      {others.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="cases-list">
          {others.map((item) => (
            <li key={item.id}>
              <CaseCard item={item} />
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}

/** The reader's own cases, in every state, with a moderator's note when returned. */
export function MyCases() {
  return (
    <CasesFrame>
      <MinePage />
    </CasesFrame>
  );
}

function MinePage() {
  const t = useTranslations();
  const reviewer = useReviewer();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Mine | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/cases/mine'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  return (
    <PageFrame wide>
      <h1 className="text-3xl font-semibold text-brand-900">{t('cases.tabs.mine')}</h1>
      <CasesNav reviewer={reviewer} />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items?.length === 0 && <p className="text-text-muted">{t('cases.list.empty')}</p>}
      {items && items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="my-cases">
          {items.map((item) => (
            <li key={item.id}>
              <CaseCard item={item} showStatus />
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}

/** Cases waiting for the reader's review, and reported ones, oldest first. */
export function CasesReview() {
  return (
    <CasesFrame>
      <ReviewPage />
    </CasesFrame>
  );
}

function ReviewPage() {
  const t = useTranslations();
  const format = useFormatter();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Queue | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/cases/review'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  const r = (key: string, values?: Record<string, string | number>) =>
    t(`cases.review.${key}`, values);
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{r('title')}</h1>
        <p className="mt-2 text-text-muted">{r('intro')}</p>
      </div>
      <CasesNav reviewer />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items?.length === 0 && <p className="text-text-muted">{r('empty')}</p>}
      {items && items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="cases-review">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1">
              <CaseCard item={item} showStatus />
              <p className="text-sm text-text-muted">
                {r('waiting', {
                  date: format.dateTime(new Date(item.waitingSince), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
                {item.openReports > 0 && ` · ${r('reports', { count: item.openReports })}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
