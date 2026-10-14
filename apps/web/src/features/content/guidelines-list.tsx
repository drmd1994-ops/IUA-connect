'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useDateFormat } from '@/features/membership/membership-page';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { Pager } from './pager';

type List = components['schemas']['PublicGuidelineListDto'];
export type GuidelineStatus = List['items'][number]['status'];

export const GUIDELINE_STATUSES: GuidelineStatus[] = ['CURRENT', 'SUPERSEDED', 'WITHDRAWN'];
const PAGE_SIZE = 20;

const badge: Record<GuidelineStatus, string> = {
  CURRENT: 'bg-success-100 text-success-700',
  SUPERSEDED: 'bg-warning-100 text-warning-700',
  WITHDRAWN: 'bg-danger-100 text-danger-700',
};

export function StatusBadge({ status }: { status: GuidelineStatus }) {
  const t = useTranslations('content.guidelines.statuses');
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[status]}`}>
      {t(status)}
    </span>
  );
}

/** Public guideline list: details and official links only (the documents stay at the source). */
export function GuidelinesList() {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const name = useLocalName();
  const { dateOrYear } = useDateFormat();
  const { api, call, status: session } = useAuth();
  const reference = useReference();
  const [subspecialty, setSubspecialty] = useState('');
  const [status, setStatus] = useState<GuidelineStatus | ''>('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (session === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/guidelines', {
        params: {
          query: {
            locale,
            page,
            pageSize: PAGE_SIZE,
            ...(subspecialty ? { subspecialty } : {}),
            ...(status ? { status } : {}),
          },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, session, locale, page, subspecialty, status]);

  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('content.guidelines.title')}</h1>
        <p className="mt-2 text-text-muted">{t('content.guidelines.intro')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t('content.guidelines.subspecialty')}
          placeholder={t('content.guidelines.allSubspecialties')}
          value={subspecialty}
          onChange={(event) => {
            setSubspecialty(event.target.value);
            setPage(1);
          }}
          options={(reference?.subspecialties ?? []).map((s) => ({
            value: s.key,
            label: name(s),
          }))}
        />
        <SelectField
          label={t('content.guidelines.status')}
          placeholder={t('content.guidelines.allStatuses')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as GuidelineStatus | '');
            setPage(1);
          }}
          options={GUIDELINE_STATUSES.map((s) => ({
            value: s,
            label: t(`content.guidelines.statuses.${s}`),
          }))}
        />
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && (
        <p className="text-text-muted">{t('content.guidelines.empty')}</p>
      )}
      {list && list.items.length > 0 && (
        <ul className="flex flex-col gap-4" data-testid="guidelines-list">
          {list.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold" lang={item.locale}>
                  <Link
                    href={`/guidelines/${item.id}`}
                    className="text-primary underline underline-offset-4"
                  >
                    {item.title}
                  </Link>
                </h2>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-2 text-sm text-text-muted">
                {[
                  item.sourceOrg,
                  item.version && `${t('content.guidelines.version')} ${item.version}`,
                  item.publishedOn && dateOrYear(item.publishedOn, item.yearOnly),
                  item.subspecialty && name(item.subspecialty),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}
