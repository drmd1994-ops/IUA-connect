'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { errorMessage } from '@/lib/api-errors';
import { CareersNav, PositionCard, type PositionSummary, useDisplayNames } from './careers-parts';

type List = components['schemas']['PositionListDto'];
type Kind = PositionSummary['kind'];
type Audience = PositionSummary['audience'];

const PAGE_SIZE = 12;
const KINDS: Kind[] = ['JOB', 'FELLOWSHIP', 'RESEARCH'];
const AUDIENCES: Audience[] = ['SPECIALISTS', 'RESIDENTS', 'STUDENTS'];

interface Filters {
  q: string;
  kind: Kind | '';
  subspecialty: string;
  country: string;
  audience: Audience | '';
}
const NO_FILTERS: Filters = { q: '', kind: '', subspecialty: '', country: '', audience: '' };

/**
 * Open jobs, fellowships and research posts (M28), for everyone, visitors too (owner answer
 * §10.4). A signed-in reader can save them to their own list.
 */
export function PositionsList() {
  const t = useTranslations();
  const name = useLocalName();
  const names = useDisplayNames();
  const reference = useReference();
  const { api, call, status } = useAuth();
  const [typed, setTyped] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);

  const change = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/positions', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(filters.q ? { q: filters.q } : {}),
            ...(filters.kind ? { kind: filters.kind } : {}),
            ...(filters.subspecialty ? { subspecialty: filters.subspecialty } : {}),
            ...(filters.country ? { country: filters.country } : {}),
            ...(filters.audience ? { audience: filters.audience } : {}),
          },
        },
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
  }, [api, call, status, page, filters]);

  async function toggleSave(item: PositionSummary) {
    setPending(item.id);
    setError(null);
    try {
      const params = { params: { path: { id: item.id } } };
      if (item.saved) await call(() => api.DELETE('/api/v1/positions/{id}/saved', params));
      else await call(() => api.PUT('/api/v1/positions/{id}/saved', params));
      setList(
        (current) =>
          current && {
            ...current,
            items: current.items.map((p) => (p.id === item.id ? { ...p, saved: !item.saved } : p)),
          },
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  const p = (key: string) => t(`careers.positions.${key}`);
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{p('title')}</h1>
        <p className="mt-2 text-text-muted">{p('intro')}</p>
      </div>
      <CareersNav />
      <form
        role="search"
        noValidate
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          change({ q: typed.trim() });
        }}
      >
        <TextField
          className="min-w-56 flex-1"
          label={p('search')}
          hint={p('searchHint')}
          type="search"
          value={typed}
          maxLength={100}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {p('search')}
        </Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label={p('kind')}
          placeholder={p('allKinds')}
          value={filters.kind}
          onChange={(event) => change({ kind: event.target.value as Kind | '' })}
          options={KINDS.map((kind) => ({ value: kind, label: t(`careers.kinds.${kind}`) }))}
        />
        <SelectField
          label={p('subspecialty')}
          placeholder={p('allSubspecialties')}
          value={filters.subspecialty}
          onChange={(event) => change({ subspecialty: event.target.value })}
          options={(reference?.subspecialties ?? []).map((s) => ({ value: s.key, label: name(s) }))}
        />
        <SelectField
          label={p('country')}
          placeholder={p('allCountries')}
          value={filters.country}
          onChange={(event) => change({ country: event.target.value })}
          options={(list?.countries ?? []).map((code) => ({
            value: code,
            label: names.country.of(code) ?? code,
          }))}
        />
        <SelectField
          label={p('audience')}
          placeholder={p('allAudiences')}
          value={filters.audience}
          onChange={(event) => change({ audience: event.target.value as Audience | '' })}
          options={AUDIENCES.map((audience) => ({
            value: audience,
            label: t(`careers.audiences.${audience}`),
          }))}
        />
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <p role="status" className="text-text-muted">
          {list.total === 0 ? p('empty') : t('careers.positions.count', { count: list.total })}
        </p>
      )}
      {list && list.items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="positions-list">
          {list.items.map((item) => (
            <li key={item.id}>
              <PositionCard
                item={item}
                pending={pending === item.id}
                {...(status === 'signedIn' ? { onToggleSave: (it) => void toggleSave(it) } : {})}
              />
            </li>
          ))}
        </ul>
      )}
      {status === 'signedOut' && list && list.items.length > 0 && (
        <p className="text-sm text-text-muted">{p('signInToSave')}</p>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}
