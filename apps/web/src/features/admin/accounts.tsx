'use client';

import type { components } from '@medconnect/api-client';
import type { RoleKey } from '@medconnect/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { PLATFORM } from './owners';

type Schemas = components['schemas'];
type List = Schemas['AccountListDto'];
type Account = Schemas['AccountDto'];
type Organisation = Schemas['OrganisationListDto']['items'][number];
type Roles = Schemas['RoleListDto']['items'];
type Status = Account['status'];

const PAGE_SIZE = 25;
const STATUSES: Status[] = ['ACTIVE', 'LOCKED', 'DISABLED'];
const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** Loads the roles and what each may do. */
function useRoles(): Roles | null {
  const { api, call } = useAuth();
  const [roles, setRoles] = useState<Roles | null>(null);
  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/roles'))
      .then((result) => active && setRoles(result.items))
      .catch(() => active && setRoles([]));
    return () => {
      active = false;
    };
  }, [api, call]);
  return roles;
}

/** Every account with its state and roles. */
export function AccountsPage() {
  const t = useTranslations();
  const u = (key: string, values?: Record<string, string | number>) =>
    t(`portal.admin.users.${key}`, values);
  const format = useFormatter();
  const roles = useRoles();
  const { api, call } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/users', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(q ? { q } : {}),
            ...(status ? { status } : {}),
            ...(role ? { role: role as RoleKey } : {}),
          },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, q, status, role]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{u('title')}</h1>
        <p className="mt-2 text-text-muted">{u('intro')}</p>
        <p className="mt-2">
          <Link href="/admin/users/roles" className={link}>
            {u('rolesLink')}
          </Link>
        </p>
      </div>
      <form
        role="search"
        className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <TextField
          label={u('search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
        />
        <SelectField
          label={u('status')}
          placeholder={u('all')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as Status | '');
            setPage(1);
          }}
          options={STATUSES.map((value) => ({ value, label: u(`statuses.${value}`) }))}
        />
        <SelectField
          label={u('role')}
          placeholder={u('all')}
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
          options={(roles ?? []).map((item) => ({
            value: item.key,
            label: t(`portal.admin.roles.${item.key}`),
          }))}
        />
        <div>
          <Button type="submit">{u('searchButton')}</Button>
        </div>
      </form>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {u('total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{u('empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="accounts-table">
                <thead className="bg-surface-muted">
                  <tr>
                    {(
                      [
                        'colEmail',
                        'colName',
                        'colStatus',
                        'colRoles',
                        'colTwoStep',
                        'colLastLogin',
                      ] as const
                    ).map((column) => (
                      <th key={column} scope="col" className="p-3 text-start">
                        {u(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <Link href={`/admin/users/${item.id}`} className={link}>
                          <span dir="ltr">{item.email}</span>
                        </Link>
                      </td>
                      <td className="p-3">{item.name ?? ''}</td>
                      <td className="p-3">
                        {u(`statuses.${item.status}`)}
                        {item.lockedNow && item.status === 'ACTIVE' && (
                          <span className={`${badge} ms-2 bg-warning-100 text-warning-700`}>
                            {u('lockedNow')}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {item.roles.length === 0
                          ? u('noRoles')
                          : item.roles.map((key) => t(`portal.admin.roles.${key}`)).join(', ')}
                      </td>
                      <td className="p-3">{u(item.twoStep ? 'yes' : 'no')}</td>
                      <td className="p-3">
                        {item.lastLoginAt
                          ? format.dateTime(new Date(item.lastLoginAt), {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : u('never')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

/** One account: its facts, the actions on it, and its roles. */
export function AccountPage({ id }: { id: string }) {
  const t = useTranslations();
  const u = (key: string, values?: Record<string, string | number>) =>
    t(`portal.admin.users.${key}`, values);
  const d = (key: string, values?: Record<string, string | number>) =>
    t(`portal.admin.users.detail.${key}`, values);
  const format = useFormatter();
  const roles = useRoles();
  const name = useLocalName();
  const reference = useReference();
  const { api, call, me } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [reason, setReason] = useState('');
  const [newRole, setNewRole] = useState('');
  // Where the new role is held (M16): on the platform, or inside one organisation.
  const [place, setPlace] = useState(PLATFORM);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/users/{id}', { params: { path: { id } } }))
      .then((result) => active && setAccount(result))
      .catch((caught: unknown) => active && setLoadError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/organisations'))
      .then((result) => active && setOrganisations(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);

  const dateTime = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  async function attempt(work: () => Promise<Account>) {
    setPending(true);
    setDone(false);
    setError(null);
    try {
      setAccount(await work());
      setDone(true);
      setReason('');
      setNewRole('');
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  const act = (action: 'disable' | 'enable' | 'unlock' | 'sessions/revoke') =>
    attempt(() =>
      call(() =>
        api.POST(`/api/v1/admin/users/{id}/${action}`, {
          params: { path: { id } },
          body: { reason: reason.trim() },
        }),
      ),
    );
  const changeRole = (
    change: 'roles' | 'roles/remove',
    role: string,
    organisationId: string | null,
  ) =>
    attempt(() =>
      call(() =>
        api.POST(`/api/v1/admin/users/{id}/${change}`, {
          params: { path: { id } },
          body: { role, organisationId, reason: reason.trim() },
        }),
      ),
    );

  if (loadError !== null) return <Alert tone="error">{errorMessage(loadError, t)}</Alert>;
  if (!account) return <p role="status">{t('membership.common.loading')}</p>;

  const self = me?.id === account.id;
  const canManage = !!me?.permissions.includes('users.manage') && !self;
  const canRoles = !!me?.permissions.includes('roles.manage') && !self;
  const hasReason = reason.trim().length >= 3;
  const placeId = place === PLATFORM ? null : place;
  // The roles that can be held in the place chosen, and are not held there already.
  const grantable = (roles ?? []).filter(
    (role) =>
      role.scope === 'NONE' &&
      (role.level === 'either' || role.level === (placeId ? 'organisation' : 'platform')) &&
      !account.roleGrants.some(
        (grant) => grant.role === role.key && (grant.organisation?.id ?? null) === placeId,
      ),
  );
  const placeOf = (organisation: Organisation | { nameHe: string; nameEn: string } | null) =>
    organisation ? d('inOrganisation', { organisation: name(organisation) }) : d('onPlatform');

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/users" className={link}>
          {u('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{d('title')}</h1>
        <p className="mt-2 text-lg" dir="ltr" data-testid="account-email">
          {account.email}
        </p>
        {account.name && <p className="text-text-muted">{account.name}</p>}
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]" data-testid="account-facts">
        <dt className="font-semibold">{d('status')}</dt>
        <dd data-testid="account-status">
          {u(`statuses.${account.status}`)}
          {account.lockedUntil && (
            <span className="block text-sm text-text-muted">
              {d('lockedUntil', { when: dateTime(account.lockedUntil) })}
            </span>
          )}
        </dd>
        <dt className="font-semibold">{d('email')}</dt>
        <dd>{d(account.emailVerified ? 'verified' : 'notVerified')}</dd>
        <dt className="font-semibold">{d('twoStep')}</dt>
        <dd>{d(account.twoStep ? 'twoStepOn' : 'twoStepOff')}</dd>
        <dt className="font-semibold">{d('lastLogin')}</dt>
        <dd>{account.lastLoginAt ? dateTime(account.lastLoginAt) : u('never')}</dd>
        <dt className="font-semibold">{d('created')}</dt>
        <dd>{date(account.createdAt)}</dd>
        <dt className="font-semibold">{d('sessions')}</dt>
        <dd data-testid="account-sessions">{account.openSessions}</dd>
        <dt className="font-semibold">{d('physician')}</dt>
        <dd>
          {account.verifiedAt
            ? d('physicianYes', { date: date(account.verifiedAt) })
            : d('physicianNo')}
        </dd>
        <dt className="font-semibold">{d('membership')}</dt>
        <dd>
          {account.memberships === null ? (
            // A membership is its organisation's business.
            <span className="text-text-muted">{d('membershipsHidden')}</span>
          ) : account.memberships.length === 0 ? (
            d('noMembership')
          ) : (
            <ul className="flex flex-col gap-1">
              {account.memberships.map((held) => (
                <li key={held.id}>
                  <Link href={`/admin/members/${held.id}`} className={link}>
                    {d('membershipIn', {
                      organisation: name(held.organisation),
                      type:
                        name(
                          reference?.types.find(
                            (type) =>
                              type.key === held.typeKey &&
                              type.organisation.id === held.organisation.id,
                          ),
                        ) || held.typeKey,
                      status: t(`membership.membership.statuses.${held.status}`),
                      date: date(held.endDate),
                    })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      <section aria-labelledby="account-roles" className="flex flex-col gap-3">
        <h2 id="account-roles" className="text-xl font-semibold">
          {d('roles')}
        </h2>
        {account.roleGrants.length === 0 ? (
          <p className="text-text-muted">{d('noRoles')}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="account-roles-list">
            {account.roleGrants.map((grant) => (
              <li
                key={`${grant.role}-${grant.scope}-${grant.organisation?.id ?? PLATFORM}-${grant.grantedAt}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <span>
                  <span className="font-semibold">
                    {d('rolePlace', {
                      role: t(`portal.admin.roles.${grant.role}`),
                      place: placeOf(grant.organisation),
                    })}
                  </span>
                  <span className="text-text-muted">
                    {' · '}
                    {d('since', { date: date(grant.grantedAt) })}
                    {!grant.removable && ` · ${d('scoped')}`}
                  </span>
                </span>
                {canRoles && grant.removable && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || !hasReason}
                    onClick={() =>
                      void changeRole('roles/remove', grant.role, grant.organisation?.id ?? null)
                    }
                  >
                    {d('removeRole', { role: t(`portal.admin.roles.${grant.role}`) })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-text-muted">{d('rolesHint')}</p>
      </section>

      {self && <Alert>{d('self')}</Alert>}
      {(canManage || canRoles) && (
        <section
          aria-labelledby="account-actions"
          className="flex flex-col gap-4 rounded-md border border-border p-5"
        >
          <h2 id="account-actions" className="text-xl font-semibold">
            {d('actions')}
          </h2>
          <TextareaField
            label={d('reason')}
            hint={d('reasonHint')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={2}
          />
          {canManage && (
            <>
              <div className="flex flex-wrap gap-3">
                {account.status === 'DISABLED' ? (
                  <Button
                    type="button"
                    disabled={pending || !hasReason}
                    onClick={() => void act('enable')}
                  >
                    {d('enable')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending || !hasReason}
                    onClick={() => void act('disable')}
                  >
                    {d('disable')}
                  </Button>
                )}
                {account.lockedNow && account.status !== 'DISABLED' && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || !hasReason}
                    onClick={() => void act('unlock')}
                  >
                    {d('unlock')}
                  </Button>
                )}
                {account.openSessions > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || !hasReason}
                    onClick={() => void act('sessions/revoke')}
                  >
                    {d('endSessions')}
                  </Button>
                )}
              </div>
              {account.status !== 'DISABLED' && (
                <p className="text-sm text-text-muted">{d('disableHint')}</p>
              )}
            </>
          )}
          {canRoles && (
            <div className="flex flex-wrap items-end gap-3">
              <SelectField
                label={d('where')}
                className="min-w-56"
                value={place}
                onChange={(event) => {
                  setPlace(event.target.value);
                  setNewRole('');
                }}
                options={[
                  { value: PLATFORM, label: placeOf(null) },
                  ...organisations.map((organisation) => ({
                    value: organisation.id,
                    label: placeOf(organisation),
                  })),
                ]}
              />
              <SelectField
                label={d('addRole')}
                placeholder={d('chooseRole')}
                className="min-w-64"
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
                options={grantable.map((role) => ({
                  value: role.key,
                  label: t(`portal.admin.roles.${role.key}`),
                }))}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !hasReason || !newRole}
                onClick={() => void changeRole('roles', newRole, placeId)}
              >
                {d('give')}
              </Button>
            </div>
          )}
          {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
          {done && <Alert tone="success">{d('done')}</Alert>}
        </section>
      )}

      {me?.permissions.includes('audit.read') && (
        <p>
          <Link href={`/admin/audit?entityType=user&entityId=${account.id}`} className={link}>
            {d('auditLink')}
          </Link>
        </p>
      )}
    </div>
  );
}

/** What each role may do. Roles are fixed; this only shows them. */
export function RolesPage() {
  const t = useTranslations();
  const r = (key: string) => t(`portal.admin.users.rolesPage.${key}`);
  const roles = useRoles();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/users" className={link}>
          {t('portal.admin.users.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{r('title')}</h1>
        <p className="mt-2 text-text-muted">{r('intro')}</p>
      </div>
      {!roles ? (
        <p role="status">{t('membership.common.loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" data-testid="roles-table">
            <thead className="bg-surface-muted">
              <tr>
                {(['role', 'holders', 'twoStep', 'scope', 'permissions'] as const).map((column) => (
                  <th key={column} scope="col" className="p-3 text-start align-top">
                    {r(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roles.map((role) => (
                <tr key={role.key}>
                  <th scope="row" className="p-3 text-start align-top">
                    {t(`portal.admin.roles.${role.key}`)}
                  </th>
                  <td className="p-3 align-top">{role.holders}</td>
                  <td className="p-3 align-top">
                    {t(`portal.admin.users.${role.requiresTwoStep ? 'yes' : 'no'}`)}
                  </td>
                  <td className="p-3 align-top">
                    {t(`portal.admin.users.rolesPage.scopes.${role.scope}`)}
                  </td>
                  <td className="p-3 align-top">
                    {role.permissions.length === 0 ? (
                      <span className="text-text-muted">{r('none')}</span>
                    ) : (
                      <ul className="list-disc ps-5">
                        {role.permissions.map((permission) => (
                          <li key={permission}>
                            {t(`portal.admin.permissions.${permission.replaceAll('.', '_')}`)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
