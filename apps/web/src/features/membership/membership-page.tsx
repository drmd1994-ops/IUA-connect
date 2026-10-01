'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { useDepartments, useLocalName, useReference } from './reference';

type Schemas = components['schemas'];
type MyMembership = Schemas['MyMembershipDto'];
type Application = Schemas['ApplicationDto'];

/** Formats a calendar date ("YYYY-MM-DD") without shifting it by time zone. */
export function useDateFormat() {
  const format = useFormatter();
  return {
    date: (value: string) =>
      format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' }),
    dateTime: (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' }),
    /** A date of which only the year may be known (imported guideline entries). */
    dateOrYear: (value: string, yearOnly: boolean) =>
      yearOnly
        ? value.slice(0, 4)
        : format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' }),
  };
}

export function MembershipPage() {
  return <RequireSignIn>{() => <MembershipView />}</RequireSignIn>;
}

function MembershipView() {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [data, setData] = useState<{
    membership: MyMembership;
    applications: Application[];
    profileComplete: boolean;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/me/membership')),
      call(() => api.GET('/api/v1/verification-requests/mine')),
      call(() => api.GET('/api/v1/me/profile')),
    ])
      .then(([membership, applications, profile]) => {
        if (!active) return;
        setData({
          membership,
          applications: applications.items,
          profileComplete: !!profile.firstName && !!profile.lastName,
        });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  const latest = data?.applications[0];
  const open = latest && (latest.state === 'PENDING_DIRECTOR' || latest.state === 'PENDING_ADMIN');

  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{t('membership.membership.title')}</h1>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!data && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {data && (
        <>
          <MembershipSummary data={data.membership} />
          {latest && <ApplicationStatus application={latest} onChanged={reload} />}
          {!open &&
            (data.profileComplete ? (
              <ApplyForm onApplied={reload} />
            ) : (
              <section className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">{t('membership.apply.title')}</h2>
                <Alert>{t('membership.apply.profileFirst')}</Alert>
                <Link
                  href="/account/profile"
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  {t('membership.apply.goToProfile')}
                </Link>
              </section>
            ))}
        </>
      )}
    </PageFrame>
  );
}

function MembershipSummary({ data }: { data: MyMembership }) {
  const t = useTranslations('membership.membership');
  const name = useLocalName();
  const { date, dateTime } = useDateFormat();
  const membership = data.membership;
  if (!membership) return <p className="text-text-muted">{t('none')}</p>;
  return (
    <section className="flex flex-col gap-4" data-testid="membership-summary">
      <dl className="grid gap-4 rounded-md border border-border p-5 sm:grid-cols-2">
        <Item label={t('type')} value={name(membership.type)} />
        <Item label={t('status')} value={t(`statuses.${membership.status}`)} />
        <Item label={t('validFrom')} value={date(membership.startDate)} />
        <Item label={t('validUntil')} value={date(membership.endDate)} />
        <Item label={t('payment')} value={t(`payments.${membership.paymentStatus}`)} />
      </dl>
      {membership.status === 'ACTIVE' && (
        <Link
          href="/account/membership/card"
          className="self-start rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
        >
          {t('viewCard')}
        </Link>
      )}
      {data.history.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t('historyTitle')}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {data.history.map((entry) => (
              <li key={`${entry.at}-${entry.event}`} className="p-3 text-sm">
                <span className="font-semibold">{t(`events.${entry.event}`)}</span>
                <span className="text-text-muted"> · {dateTime(entry.at)}</span>
                {entry.reason && (
                  <p className="text-text-muted">{t('reason', { reason: entry.reason })}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

export function DecisionList({ application }: { application: Application }) {
  const t = useTranslations('membership.application');
  const { dateTime } = useDateFormat();
  if (application.decisions.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {application.decisions.map((decision) => (
        <li key={`${decision.stage}-${decision.at}`}>
          {t('decisionLine', {
            stage: t(`stages.${decision.stage}`),
            decision: t(`decisions.${decision.decision}`),
            date: dateTime(decision.at),
          })}
          {decision.reason && (
            <span className="block text-text-muted">
              {t('reason', { reason: decision.reason })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ApplicationStatus({
  application,
  onChanged,
}: {
  application: Application;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const name = useLocalName();
  const { dateTime } = useDateFormat();
  const { api, call } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const open = application.state === 'PENDING_DIRECTOR' || application.state === 'PENDING_ADMIN';

  async function withdraw() {
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/verification-requests/{id}/withdraw', {
          params: { path: { id: application.id } },
        }),
      );
      onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-border p-5"
      data-testid="application"
    >
      <h2 className="text-xl font-semibold">{t('membership.application.title')}</h2>
      <p>
        <span className="font-semibold">{name(application.type)}</span>
        {' · '}
        {t(`membership.application.states.${application.state}`)}
      </p>
      <p className="text-sm text-text-muted">
        {t('membership.application.submittedOn', { date: dateTime(application.createdAt) })}
      </p>
      <DecisionList application={application} />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {open && (
        <div>
          <Button
            type="button"
            variant="secondary"
            pending={pending}
            onClick={() => void withdraw()}
          >
            {t('membership.application.withdraw')}
          </Button>
        </div>
      )}
    </section>
  );
}

function ApplyForm({ onApplied }: { onApplied: () => void }) {
  const t = useTranslations();
  const name = useLocalName();
  const { api, call } = useAuth();
  const reference = useReference();
  const [typeId, setTypeId] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const departments = useDepartments(hospitalId);
  const types = (reference?.types ?? []).filter((type) => type.selfApply);
  const type = types.find((candidate) => candidate.id === typeId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/verification-requests', {
          body: {
            typeId,
            ...(hospitalId ? { hospitalId } : {}),
            ...(departmentId ? { departmentId } : {}),
            ...(type && type.identifier !== 'NONE' ? { identifier } : {}),
          },
        }),
      );
      setDone(true);
      onApplied();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t('membership.apply.title')}</h2>
      <p className="text-text-muted">{t('membership.apply.intro')}</p>
      {done && <Alert tone="success">{t('membership.apply.submitted')}</Alert>}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <SelectField
          label={t('membership.apply.type')}
          placeholder={t('membership.apply.chooseType')}
          value={typeId}
          required
          onChange={(event) => setTypeId(event.target.value)}
          options={types.map((option) => ({ value: option.id, label: name(option) }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('membership.apply.hospital')}
            placeholder={t('membership.profile.chooseHospital')}
            value={hospitalId}
            onChange={(event) => {
              setHospitalId(event.target.value);
              setDepartmentId('');
            }}
            options={(reference?.hospitals ?? []).map((h) => ({ value: h.id, label: name(h) }))}
          />
          <SelectField
            label={t('membership.apply.department')}
            placeholder={t('membership.profile.chooseDepartment')}
            value={departmentId}
            disabled={!hospitalId}
            onChange={(event) => setDepartmentId(event.target.value)}
            options={departments.map((d) => ({ value: d.id, label: name(d) }))}
          />
        </div>
        {type && type.identifier !== 'NONE' && (
          <TextField
            label={t(`membership.apply.identifiers.${type.identifier}`)}
            hint={t('membership.apply.identifierHint')}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={40}
            required
          />
        )}
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        <div>
          <Button
            type="submit"
            pending={pending}
            pendingLabel={t('auth.pending')}
            disabled={!typeId}
          >
            {t('membership.apply.submit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
