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
import {
  NEEDS,
  PROJECT_STATUSES,
  type Project,
  ProjectCard,
  ResearchFrame,
  ResearchNav,
  STUDY_TYPES,
} from './research-parts';

type List = components['schemas']['ProjectListDto'];

interface Filters {
  q: string;
  subspecialty: string;
  studyType: Project['studyType'] | '';
  need: Project['needs'][number] | '';
  status: Project['status'] | '';
}
const NO_FILTERS: Filters = { q: '', subspecialty: '', studyType: '', need: '', status: '' };

/**
 * Research projects that seek collaborators (M27), for verified people. `mine` shows only the
 * projects the reader leads.
 */
export function ProjectsList({ mine = false }: { mine?: boolean }) {
  return (
    <ResearchFrame>
      <Projects mine={mine} />
    </ResearchFrame>
  );
}

function Projects({ mine }: { mine: boolean }) {
  const t = useTranslations();
  const name = useLocalName();
  const reference = useReference();
  const { api, call, me } = useAuth();
  const [typed, setTyped] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  const change = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/research/projects', {
        params: {
          query: {
            page,
            ...(mine ? { mine: true } : {}),
            ...(filters.q ? { q: filters.q } : {}),
            ...(filters.subspecialty ? { subspecialty: filters.subspecialty } : {}),
            ...(filters.studyType ? { studyType: filters.studyType } : {}),
            ...(filters.need ? { need: filters.need } : {}),
            ...(filters.status ? { status: filters.status } : {}),
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
  }, [api, call, page, filters, mine]);

  const l = (key: string) => t(`research.list.${key}`);
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">
          {mine ? t('research.tabs.mine') : l('title')}
        </h1>
        <p className="mt-2 text-text-muted">{l('intro')}</p>
      </div>
      <ResearchNav canList={me?.verifiedAs !== 'STUDENT'} />
      {!mine && (
        <>
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
              label={l('search')}
              hint={l('searchHint')}
              type="search"
              value={typed}
              maxLength={100}
              onChange={(event) => setTyped(event.target.value)}
            />
            <Button type="submit" variant="secondary">
              {l('search')}
            </Button>
          </form>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label={l('subspecialty')}
              placeholder={l('allSubspecialties')}
              value={filters.subspecialty}
              onChange={(event) => change({ subspecialty: event.target.value })}
              options={(reference?.subspecialties ?? []).map((s) => ({
                value: s.key,
                label: name(s),
              }))}
            />
            <SelectField
              label={l('studyType')}
              placeholder={l('allStudyTypes')}
              value={filters.studyType}
              onChange={(event) =>
                change({ studyType: event.target.value as Filters['studyType'] })
              }
              options={STUDY_TYPES.map((type) => ({
                value: type,
                label: t(`research.studyTypes.${type}`),
              }))}
            />
            <SelectField
              label={l('need')}
              placeholder={l('allNeeds')}
              value={filters.need}
              onChange={(event) => change({ need: event.target.value as Filters['need'] })}
              options={NEEDS.map((need) => ({ value: need, label: t(`research.needs.${need}`) }))}
            />
            <SelectField
              label={l('status')}
              placeholder={l('allStatuses')}
              value={filters.status}
              onChange={(event) => change({ status: event.target.value as Filters['status'] })}
              options={PROJECT_STATUSES.map((status) => ({
                value: status,
                label: t(`research.statuses.${status}`),
              }))}
            />
          </div>
        </>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.total === 0 && (
        <p role="status" className="text-text-muted">
          {mine ? l('mineEmpty') : l('empty')}
        </p>
      )}
      {list && list.items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="projects-list">
          {list.items.map((item) => (
            <li key={item.id}>
              <ProjectCard item={item} />
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}
