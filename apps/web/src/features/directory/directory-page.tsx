'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { StoredImage } from '@/features/content/files';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';

type List = components['schemas']['DirectoryListDto'];
export type DirectoryMember = List['items'][number];

const link = 'font-semibold text-primary underline underline-offset-4';

/** The member directory: listed members, for members with an active membership. */
export function DirectoryPage() {
  return <RequireSignIn>{() => <Directory />}</RequireSignIn>;
}

/** The name as the member shows it: in the page's language when they share that form. */
export function useMemberName() {
  const locale = useLocale();
  return (member: Pick<DirectoryMember, 'firstName' | 'lastName' | 'nameHe' | 'nameEn'>) =>
    (locale === 'he' ? member.nameHe : member.nameEn) ??
    [member.firstName, member.lastName].filter(Boolean).join(' ');
}

function Directory() {
  const t = useTranslations();
  const d = (key: string, values?: Record<string, string | number>) =>
    t(`directory.list.${key}`, values);
  const name = useLocalName();
  const memberName = useMemberName();
  const reference = useReference();
  const { api, call } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [subspecialtyId, setSubspecialtyId] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/members', {
        params: {
          query: {
            page,
            ...(q ? { q } : {}),
            ...(hospitalId ? { hospitalId } : {}),
            ...(subspecialtyId ? { subspecialtyId } : {}),
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
  }, [api, call, page, q, hospitalId, subspecialtyId]);

  // Not an active member: the reason, and nothing else.
  if (error !== null && isApiError(error, 'FORBIDDEN')) {
    return (
      <PageFrame>
        <h1 className="text-3xl font-semibold text-brand-900">{d('title')}</h1>
        <Alert>{d('membersOnly')}</Alert>
        <Link href="/account/membership" className={link}>
          {t('membership.nav.membership')}
        </Link>
      </PageFrame>
    );
  }

  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{d('title')}</h1>
        <p className="mt-2 text-text-muted">{d('intro')}</p>
      </div>
      <form
        role="search"
        aria-label={d('title')}
        className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim().length >= 2 ? search.trim() : '');
          setPage(1);
        }}
      >
        <TextField
          label={d('search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
        />
        <SelectField
          label={d('hospital')}
          placeholder={d('allHospitals')}
          value={hospitalId}
          onChange={(event) => {
            setHospitalId(event.target.value);
            setPage(1);
          }}
          options={(reference?.hospitals ?? []).map((h) => ({ value: h.id, label: name(h) }))}
        />
        <SelectField
          label={d('subspecialty')}
          placeholder={d('allSubspecialties')}
          value={subspecialtyId}
          onChange={(event) => {
            setSubspecialtyId(event.target.value);
            setPage(1);
          }}
          options={(reference?.subspecialties ?? []).map((s) => ({
            value: s.id,
            label: name(s),
          }))}
        />
        <div>
          <Button type="submit">{d('searchButton')}</Button>
        </div>
      </form>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {d('total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{d('empty')}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="directory-list">
              {list.items.map((member) => {
                const shown = memberName(member);
                const details = [member.title, member.position, name(member.hospital)].filter(
                  Boolean,
                );
                return (
                  <li
                    key={member.id}
                    className="flex gap-4 rounded-md border border-border bg-surface p-4"
                  >
                    {member.photoFileId && (
                      <StoredImage
                        fileId={member.photoFileId}
                        variant="thumb"
                        alt=""
                        className="size-14 shrink-0 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <h2 className="text-lg font-semibold">
                        <Link href={`/members/${member.id}`} className={link}>
                          {shown}
                        </Link>
                      </h2>
                      {details.length > 0 && (
                        <p className="text-sm text-text-muted">{details.join(' · ')}</p>
                      )}
                      {member.subspecialties.length > 0 && (
                        <p className="text-sm text-text-muted">
                          {member.subspecialties.map((s) => name(s)).join(', ')}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
        </>
      )}
      <p className="text-sm text-text-muted">
        {d('joinHint')}{' '}
        <Link href="/account/profile" className={link}>
          {d('profileLink')}
        </Link>
      </p>
    </PageFrame>
  );
}
