'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { useDateFormat } from '@/features/membership/membership-page';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type List = components['schemas']['AdminMembershipListDto'];
type Status = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
type Payment = 'NOT_REQUIRED' | 'UNPAID' | 'PAID' | 'WAIVED';

const STATUSES: Status[] = ['ACTIVE', 'SUSPENDED', 'EXPIRED'];
const PAYMENTS: Payment[] = ['NOT_REQUIRED', 'UNPAID', 'PAID', 'WAIVED'];
const PAGE_SIZE = 25;

interface Filters {
  q: string;
  status: Status | '';
  type: string;
  paymentStatus: Payment | '';
  page: number;
}

export function MembersPage() {
  const t = useTranslations();
  const name = useLocalName();
  const { date } = useDateFormat();
  const { api, call } = useAuth();
  const reference = useReference();
  const [filters, setFilters] = useState<Filters>({
    q: '',
    status: '',
    type: '',
    paymentStatus: '',
    page: 1,
  });
  const [search, setSearch] = useState('');
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/memberships', {
        params: {
          query: {
            page: filters.page,
            pageSize: PAGE_SIZE,
            ...(filters.q ? { q: filters.q } : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.type ? { type: filters.type } : {}),
            ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
          },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, filters]);

  const pages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const set = (patch: Partial<Filters>) =>
    setFilters((current) => ({ ...current, page: 1, ...patch }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold text-brand-900">{t('admin.members.title')}</h1>
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          set({ q: search.trim() });
        }}
      >
        <TextField
          label={t('admin.members.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="lg:col-span-2"
        />
        <SelectField
          label={t('admin.members.status')}
          placeholder={t('admin.members.all')}
          value={filters.status}
          onChange={(event) => set({ status: event.target.value as Status | '' })}
          options={STATUSES.map((s) => ({
            value: s,
            label: t(`membership.membership.statuses.${s}`),
          }))}
        />
        <SelectField
          label={t('admin.members.type')}
          placeholder={t('admin.members.all')}
          value={filters.type}
          onChange={(event) => set({ type: event.target.value })}
          options={(reference?.types ?? []).map((type) => ({ value: type.key, label: name(type) }))}
        />
        <SelectField
          label={t('admin.members.payment')}
          placeholder={t('admin.members.all')}
          value={filters.paymentStatus}
          onChange={(event) => set({ paymentStatus: event.target.value as Payment | '' })}
          options={PAYMENTS.map((p) => ({
            value: p,
            label: t(`membership.membership.payments.${p}`),
          }))}
        />
        <div>
          <Button type="submit">{t('admin.members.searchButton')}</Button>
        </div>
      </form>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {t('admin.members.total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{t('admin.members.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="members-table">
                <thead className="bg-surface-muted text-start">
                  <tr>
                    <th scope="col" className="p-3 text-start">
                      {t('admin.members.name')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('admin.members.email')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('admin.members.type')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('admin.members.status')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('admin.members.validUntil')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('admin.members.payment')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <Link
                          href={`/admin/members/${item.id}`}
                          className="font-semibold text-primary underline underline-offset-4"
                        >
                          {[item.member.firstName, item.member.lastName]
                            .filter(Boolean)
                            .join(' ') || item.member.email}
                        </Link>
                      </td>
                      <td className="p-3" dir="ltr">
                        {item.member.email}
                      </td>
                      <td className="p-3">{name(item.type)}</td>
                      <td className="p-3">{t(`membership.membership.statuses.${item.status}`)}</td>
                      <td className="p-3">{date(item.endDate)}</td>
                      <td className="p-3">
                        {t(`membership.membership.payments.${item.paymentStatus}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav
            className="flex items-center gap-3"
            aria-label={t('admin.members.page', { page: filters.page, pages })}
          >
            <Button
              type="button"
              variant="secondary"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              {t('admin.members.previous')}
            </Button>
            <span className="text-sm">
              {t('admin.members.page', { page: filters.page, pages })}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={filters.page >= pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              {t('admin.members.next')}
            </Button>
          </nav>
        </>
      )}
      <CreateMembership />
    </div>
  );
}

function CreateMembership() {
  const t = useTranslations();
  const name = useLocalName();
  const router = useRouter();
  const { api, call } = useAuth();
  const reference = useReference();
  const [email, setEmail] = useState('');
  const [typeId, setTypeId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const type = reference?.types.find((candidate) => candidate.id === typeId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await call(() =>
        api.POST('/api/v1/admin/memberships', {
          body: {
            email,
            typeId,
            ...(type && type.identifier !== 'NONE' ? { identifier } : {}),
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
        }),
      );
      router.push(`/admin/members/${result.membership.id}`);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <details className="rounded-md border border-border p-5">
      <summary className="cursor-pointer font-semibold">{t('admin.members.create')}</summary>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
        <p className="text-sm text-text-muted">{t('admin.create.intro')}</p>
        <TextField
          type="email"
          label={t('admin.create.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <SelectField
          label={t('admin.create.type')}
          placeholder={t('membership.apply.chooseType')}
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          options={(reference?.types ?? []).map((option) => ({
            value: option.id,
            label: name(option),
          }))}
        />
        {type && type.identifier !== 'NONE' && (
          <TextField
            label={t(`membership.apply.identifiers.${type.identifier}`)}
            hint={t('admin.create.identifierHint')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        )}
        <TextField
          label={t('admin.create.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        <div>
          <Button type="submit" pending={pending} disabled={!email || !typeId}>
            {t('admin.create.submit')}
          </Button>
        </div>
      </form>
    </details>
  );
}
