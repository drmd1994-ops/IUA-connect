'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import {
  ETHICS,
  NEEDS,
  PROJECT_STATUSES,
  type Project,
  ResearchFrame,
  ResearchNav,
  STUDY_TYPES,
  link,
} from './research-parts';

type Input = components['schemas']['ProjectInputDto'];

const EMPTY: Input = {
  title: '',
  description: '',
  studyType: 'PROSPECTIVE',
  status: 'PLANNING',
  ethics: 'NOT_YET',
  funding: null,
  contact: null,
  needs: [],
  subspecialtyIds: [],
  open: true,
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Lists a new research project (M27), or edits one the reader leads (`id`). */
export function ProjectForm({ id }: { id?: string }) {
  return (
    <ResearchFrame>
      <FormPage {...(id ? { id } : {})} />
    </ResearchFrame>
  );
}

function FormPage({ id }: { id?: string }) {
  const t = useTranslations();
  const name = useLocalName();
  const reference = useReference();
  const router = useRouter();
  const { api, call, me } = useAuth();
  const [form, setForm] = useState<Input | null>(id ? null : EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    call(() => api.GET('/api/v1/research/projects/{id}', { params: { path: { id } } }))
      .then((project: Project) => {
        if (!active) return;
        setForm({
          title: project.title,
          description: project.description,
          studyType: project.studyType,
          status: project.status,
          ethics: project.ethics,
          funding: project.funding,
          contact: project.contact,
          needs: project.needs,
          subspecialtyIds: project.subspecialties.map((s) => s.id),
          open: project.open,
        });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  const set = (patch: Partial<Input>) => {
    setForm((current) => current && { ...current, ...patch });
    setSaved(false);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setPending(true);
    setError(null);
    const body: Input = {
      ...form,
      funding: form.funding?.trim() || null,
      contact: form.contact?.trim() || null,
    };
    try {
      if (id) {
        await call(() =>
          api.PUT('/api/v1/research/projects/{id}', { params: { path: { id } }, body }),
        );
        setSaved(true);
      } else {
        const created = await call(() => api.POST('/api/v1/research/projects', { body }));
        router.push(`/research/${created.id}`);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const f = (key: string) => t(`research.form.${key}`);
  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">
        {id ? f('editTitle') : f('newTitle')}
      </h1>
      <ResearchNav canList={me?.verifiedAs !== 'STUDENT'} />
      {id && (
        <Link href={`/research/${id}`} className={link}>
          {t('research.project.back')}
        </Link>
      )}
      {error !== null && (
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? t('research.project.notFound') : errorMessage(error, t)}
        </Alert>
      )}
      {!form && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {form && (
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5" noValidate>
          <TextField
            label={f('title')}
            value={form.title}
            maxLength={200}
            required
            onChange={(event) => set({ title: event.target.value })}
          />
          <TextareaField
            label={f('description')}
            hint={f('descriptionHint')}
            value={form.description}
            rows={8}
            maxLength={5000}
            required
            onChange={(event) => set({ description: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label={f('studyType')}
              value={form.studyType}
              onChange={(event) => set({ studyType: event.target.value as Input['studyType'] })}
              options={STUDY_TYPES.map((type) => ({
                value: type,
                label: t(`research.studyTypes.${type}`),
              }))}
            />
            <SelectField
              label={f('status')}
              value={form.status}
              onChange={(event) => set({ status: event.target.value as Input['status'] })}
              options={PROJECT_STATUSES.map((status) => ({
                value: status,
                label: t(`research.statuses.${status}`),
              }))}
            />
            <SelectField
              label={f('ethics')}
              hint={f('ethicsHint')}
              value={form.ethics}
              onChange={(event) => set({ ethics: event.target.value as Input['ethics'] })}
              options={ETHICS.map((ethics) => ({
                value: ethics,
                label: t(`research.ethicsShort.${ethics}`),
              }))}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">{f('needs')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {NEEDS.map((need) => (
                <label key={need} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={form.needs.includes(need)}
                    onChange={() => set({ needs: toggle(form.needs, need) })}
                  />
                  {t(`research.needs.${need}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">{f('subspecialties')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(reference?.subspecialties ?? []).map((subspecialty) => (
                <label key={subspecialty.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={form.subspecialtyIds.includes(subspecialty.id)}
                    onChange={() =>
                      set({ subspecialtyIds: toggle(form.subspecialtyIds, subspecialty.id) })
                    }
                  />
                  {name(subspecialty)}
                </label>
              ))}
            </div>
          </fieldset>
          <TextField
            label={f('funding')}
            value={form.funding ?? ''}
            maxLength={300}
            onChange={(event) => set({ funding: event.target.value })}
          />
          <TextField
            label={f('contact')}
            value={form.contact ?? ''}
            maxLength={300}
            onChange={(event) => set({ contact: event.target.value })}
          />
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-4"
              checked={form.open}
              onChange={(event) => set({ open: event.target.checked })}
            />
            {f('open')}
          </label>
          {saved && <Alert tone="success">{f('saved')}</Alert>}
          <div>
            <Button
              type="submit"
              pending={pending}
              disabled={!form.title.trim() || !form.description.trim()}
            >
              {f('save')}
            </Button>
          </div>
        </form>
      )}
    </PageFrame>
  );
}
