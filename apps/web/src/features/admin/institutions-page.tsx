'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { useLocalName } from '@/features/membership/reference';
import { errorMessage } from '@/lib/api-errors';

type Hospital = components['schemas']['AdminHospitalListDto']['items'][number];
type Department = Hospital['departments'][number];

export function InstitutionsPage() {
  const t = useTranslations();
  const name = useLocalName();
  const { api, call } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/institutions/hospitals'))
      .then((result) => active && setHospitals(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  const needle = filter.trim().toLowerCase();
  const shown = (hospitals ?? []).filter(
    (h) =>
      !needle || `${h.nameHe} ${h.nameEn} ${h.cityHe} ${h.cityEn}`.toLowerCase().includes(needle),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('admin.institutions.title')}</h1>
        <p className="mt-2 text-text-muted">{t('admin.institutions.intro')}</p>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <AddHospital onAdded={reload} />
      <TextField
        label={t('admin.institutions.filter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        type="search"
      />
      {!hospitals && error === null && <p role="status">{t('membership.common.loading')}</p>}
      <ul className="flex flex-col gap-3" data-testid="hospitals">
        {shown.map((hospital) => (
          <li key={hospital.id}>
            <details className="rounded-md border border-border p-4">
              <summary className="cursor-pointer font-semibold">
                {name(hospital)}
                <span className="font-normal text-text-muted">
                  {' · '}
                  {name({ nameHe: hospital.cityHe, nameEn: hospital.cityEn })}
                </span>
                {!hospital.active && (
                  <span className="ms-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs">
                    {t('admin.institutions.inactive')}
                  </span>
                )}
              </summary>
              <HospitalPanel hospital={hospital} onChanged={reload} />
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HospitalPanel({ hospital, onChanged }: { hospital: Hospital; onChanged: () => void }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [nameHe, setNameHe] = useState('');
  const [nameEn, setNameEn] = useState('');

  async function attempt(request: () => Promise<unknown>) {
    setError(null);
    try {
      await request();
      onChanged();
    } catch (caught) {
      setError(caught);
    }
  }

  async function addDepartment(event: FormEvent) {
    event.preventDefault();
    await attempt(() =>
      call(() =>
        api.POST('/api/v1/admin/institutions/hospitals/{id}/departments', {
          params: { path: { id: hospital.id } },
          body: { nameHe, nameEn },
        }),
      ),
    );
    setNameHe('');
    setNameEn('');
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            void attempt(() =>
              call(() =>
                api.PATCH('/api/v1/admin/institutions/hospitals/{id}', {
                  params: { path: { id: hospital.id } },
                  body: { active: !hospital.active },
                }),
              ),
            )
          }
        >
          {hospital.active ? t('admin.institutions.hide') : t('admin.institutions.show')}
        </Button>
      </div>
      {hospital.departments.map((department) => (
        <DepartmentPanel key={department.id} department={department} onChanged={onChanged} />
      ))}
      <form
        onSubmit={addDepartment}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <TextField
          label={t('admin.institutions.nameHe')}
          value={nameHe}
          onChange={(e) => setNameHe(e.target.value)}
          dir="rtl"
        />
        <TextField
          label={t('admin.institutions.nameEn')}
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          dir="ltr"
        />
        <Button type="submit" variant="secondary" disabled={!nameHe.trim() || !nameEn.trim()}>
          {t('admin.institutions.addDepartment')}
        </Button>
      </form>
    </div>
  );
}

function DepartmentPanel({
  department,
  onChanged,
}: {
  department: Department;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const name = useLocalName();
  const { api, call } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);

  async function attempt(request: () => Promise<unknown>) {
    setError(null);
    try {
      await request();
      onChanged();
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    }
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    const ok = await attempt(() =>
      call(() =>
        api.POST('/api/v1/admin/institutions/departments/{id}/directors', {
          params: { path: { id: department.id } },
          body: { email },
        }),
      ),
    );
    if (ok) setEmail('');
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-md bg-surface-muted p-4"
      aria-label={name(department)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {name(department)}
          {!department.active && (
            <span className="ms-2 text-sm font-normal">({t('admin.institutions.inactive')})</span>
          )}
        </h3>
        <Button
          type="button"
          variant="link"
          onClick={() =>
            void attempt(() =>
              call(() =>
                api.PATCH('/api/v1/admin/institutions/departments/{id}', {
                  params: { path: { id: department.id } },
                  body: { active: !department.active },
                }),
              ),
            )
          }
        >
          {department.active ? t('admin.institutions.hide') : t('admin.institutions.show')}
        </Button>
      </div>
      <p className="text-sm font-semibold">{t('admin.institutions.directors')}</p>
      {department.directors.length === 0 ? (
        <p className="text-sm text-text-muted">{t('admin.institutions.noDirectors')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {department.directors.map((director) => (
            <li key={director.userId} className="flex flex-wrap items-center gap-3 text-sm">
              <span dir="ltr">{director.email}</span>
              <Button
                type="button"
                variant="link"
                aria-label={t('admin.institutions.removeDirector', { email: director.email })}
                onClick={() =>
                  void attempt(() =>
                    call(() =>
                      api.DELETE('/api/v1/admin/institutions/departments/{id}/directors/{userId}', {
                        params: { path: { id: department.id, userId: director.userId } },
                      }),
                    ),
                  )
                }
              >
                {t('admin.institutions.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <form onSubmit={assign} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextField
          type="email"
          label={t('admin.institutions.directorEmail')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!email.trim()}>
          {t('admin.institutions.assign')}
        </Button>
      </form>
    </section>
  );
}

function AddHospital({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const empty = { nameHe: '', nameEn: '', cityHe: '', cityEn: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<unknown>(null);
  const field = (key: keyof typeof empty) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: event.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await call(() => api.POST('/api/v1/admin/institutions/hospitals', { body: form }));
      setForm(empty);
      onAdded();
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <details className="rounded-md border border-border p-4">
      <summary className="cursor-pointer font-semibold">
        {t('admin.institutions.addHospital')}
      </summary>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
        <TextField label={t('admin.institutions.nameHe')} {...field('nameHe')} dir="rtl" />
        <TextField label={t('admin.institutions.nameEn')} {...field('nameEn')} dir="ltr" />
        <TextField label={t('admin.institutions.cityHe')} {...field('cityHe')} dir="rtl" />
        <TextField label={t('admin.institutions.cityEn')} {...field('cityEn')} dir="ltr" />
        {error !== null && (
          <div className="sm:col-span-2">
            <Alert tone="error">{errorMessage(error, t)}</Alert>
          </div>
        )}
        <div>
          <Button type="submit" disabled={Object.values(form).some((v) => !v.trim())}>
            {t('admin.institutions.add')}
          </Button>
        </div>
      </form>
    </details>
  );
}
