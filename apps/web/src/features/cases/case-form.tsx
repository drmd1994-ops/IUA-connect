'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { PatientCheck, checkTexts, refusedDetails } from '@/features/communities/community-parts';
import { StoredImage } from '@/features/content/files';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import {
  AGE_RANGES,
  type Case,
  CasesFrame,
  CasesNav,
  SEXES,
  StandingNote,
  link,
} from './cases-parts';

type Input = components['schemas']['CaseInputDto'];
const TEXTS = ['history', 'examination', 'labs', 'imaging', 'pathology', 'management'] as const;
type TextKey = (typeof TEXTS)[number];

interface Form {
  subspecialtyId: string;
  title: string;
  ageRange: Case['ageRange'] | '';
  sex: Case['sex'] | '';
  history: string;
  examination: string;
  labs: string;
  imaging: string;
  pathology: string;
  management: string;
  question: string;
  options: string[];
  fileIds: string[];
  confirmed: boolean;
}

const EMPTY: Form = {
  subspecialtyId: '',
  title: '',
  ageRange: '',
  sex: '',
  history: '',
  examination: '',
  labs: '',
  imaging: '',
  pathology: '',
  management: '',
  question: '',
  options: ['', '', '', ''],
  fileIds: [],
  confirmed: false,
};

function formOf(item: Case): Form {
  const options = item.poll?.options.map((o) => o.text) ?? [];
  return {
    subspecialtyId: item.subspecialty.id,
    title: item.title,
    ageRange: item.ageRange,
    sex: item.sex,
    history: item.history,
    examination: item.examination ?? '',
    labs: item.labs ?? '',
    imaging: item.imaging ?? '',
    pathology: item.pathology ?? '',
    management: item.management ?? '',
    question: item.question,
    options: [...options, '', '', '', ''].slice(0, 4),
    fileIds: item.fileIds,
    confirmed: item.fileIds.length > 0,
  };
}

/** Presents a new case, or changes the reader's draft or returned case (`id`). */
export function CaseForm({ id }: { id?: string }) {
  return (
    <CasesFrame>
      <FormPage {...(id ? { id } : {})} />
    </CasesFrame>
  );
}

function FormPage({ id }: { id?: string }) {
  const t = useTranslations();
  const name = useLocalName();
  const reference = useReference();
  const router = useRouter();
  const { api, call } = useAuth();
  const [form, setForm] = useState<Form | null>(id ? null : EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    call(() => api.GET('/api/v1/cases/{id}', { params: { path: { id } } }))
      .then((item) => active && setForm(formOf(item)))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  const set = (patch: Partial<Form>) => setForm((current) => current && { ...current, ...patch });
  const options = form?.options.map((o) => o.trim()).filter(Boolean) ?? [];
  const found = form
    ? checkTexts(form.title, form.question, ...TEXTS.map((key) => form[key]), ...form.options)
    : [];
  const refused = refusedDetails(error);

  async function addPicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !form || form.fileIds.length >= 4 || !form.confirmed) return;
    setUploading(true);
    setError(null);
    try {
      const stored = await call(() =>
        api.POST('/api/v1/cases/pictures', {
          params: { query: { confirmed: 'true' } },
          body: { file: '' },
          bodySerializer: () => {
            const data = new FormData();
            data.append('file', file);
            return data;
          },
        }),
      );
      set({ fileIds: [...form.fileIds, stored.id] });
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || found.length > 0 || !form.ageRange || !form.sex) return;
    setPending(true);
    setError(null);
    const body: Input = {
      subspecialtyId: form.subspecialtyId,
      title: form.title.trim(),
      ageRange: form.ageRange,
      sex: form.sex,
      history: form.history.trim(),
      examination: form.examination.trim() || null,
      labs: form.labs.trim() || null,
      imaging: form.imaging.trim() || null,
      pathology: form.pathology.trim() || null,
      management: form.management.trim() || null,
      question: form.question.trim(),
      pollOptions: options.length >= 2 ? options : [],
      fileIds: form.fileIds,
      picturesConfirmed: form.confirmed,
    };
    try {
      const saved = id
        ? await call(() => api.PUT('/api/v1/cases/{id}', { params: { path: { id } }, body }))
        : await call(() => api.POST('/api/v1/cases', { body }));
      router.push(`/cases/${saved.id}`);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const f = (key: string, values?: Record<string, string | number>) =>
    t(`cases.form.${key}`, values);
  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">
        {id ? f('editTitle') : f('newTitle')}
      </h1>
      <CasesNav reviewer={false} />
      {id && (
        <Link href={`/cases/${id}`} className={link}>
          {t('cases.case.back')}
        </Link>
      )}
      <Alert tone="warning">{f('warning')}</Alert>
      <StandingNote />
      {error !== null && refused.length === 0 && (
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? t('cases.case.notFound') : errorMessage(error, t)}
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
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label={f('subspecialty')}
              placeholder={f('chooseSubspecialty')}
              value={form.subspecialtyId}
              onChange={(event) => set({ subspecialtyId: event.target.value })}
              options={(reference?.subspecialties ?? []).map((s) => ({
                value: s.id,
                label: name(s),
              }))}
            />
            <SelectField
              label={f('ageRange')}
              placeholder="—"
              value={form.ageRange}
              onChange={(event) => set({ ageRange: event.target.value as Form['ageRange'] })}
              options={AGE_RANGES.map((value) => ({
                value,
                label: t(`cases.ageRanges.${value}`),
              }))}
            />
            <SelectField
              label={f('sex')}
              placeholder="—"
              value={form.sex}
              onChange={(event) => set({ sex: event.target.value as Form['sex'] })}
              options={SEXES.map((value) => ({ value, label: t(`cases.sexes.${value}`) }))}
            />
          </div>
          {TEXTS.map((key: TextKey) => (
            <TextareaField
              key={key}
              label={f(key)}
              rows={key === 'history' ? 6 : 3}
              maxLength={key === 'history' ? 5000 : 3000}
              required={key === 'history'}
              value={form[key]}
              onChange={(event) => set({ [key]: event.target.value })}
            />
          ))}
          <TextareaField
            label={f('question')}
            rows={3}
            maxLength={1000}
            required
            value={form.question}
            onChange={(event) => set({ question: event.target.value })}
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-semibold">{f('poll')}</legend>
            <p className="text-sm text-text-muted">{f('pollHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {form.options.map((option, index) => (
                <TextField
                  key={index}
                  label={f('option', { number: index + 1 })}
                  value={option}
                  maxLength={200}
                  onChange={(event) =>
                    set({
                      options: form.options.map((o, i) => (i === index ? event.target.value : o)),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-semibold">{f('pictures')}</legend>
            <p className="text-sm text-text-muted">{f('picturesHint')}</p>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="size-4"
                checked={form.confirmed}
                onChange={(event) => set({ confirmed: event.target.checked })}
              />
              {f('confirm')}
            </label>
            {form.fileIds.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2" data-testid="case-form-pictures">
                {form.fileIds.map((fileId, index) => (
                  <li key={fileId} className="flex flex-col gap-2">
                    <StoredImage
                      fileId={fileId}
                      alt={t('cases.case.pictureAlt', { number: index + 1 })}
                      className="w-full rounded-md border border-border"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => set({ fileIds: form.fileIds.filter((f) => f !== fileId) })}
                    >
                      {f('removePicture', { number: index + 1 })}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {form.fileIds.length < 4 && (
              <label
                className={`inline-flex w-fit items-center rounded-md border border-border px-4 py-2 font-semibold ${
                  form.confirmed && !uploading
                    ? 'cursor-pointer hover:bg-surface-muted'
                    : 'opacity-60'
                }`}
              >
                {f('addPicture')}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  disabled={!form.confirmed || uploading}
                  onChange={(event) => void addPicture(event)}
                />
              </label>
            )}
            {uploading && <p role="status">{t('membership.common.loading')}</p>}
          </fieldset>
          <PatientCheck found={found.length > 0 ? found : refused} />
          <div>
            <Button
              type="submit"
              pending={pending}
              disabled={
                found.length > 0 ||
                uploading ||
                !form.subspecialtyId ||
                !form.title.trim() ||
                !form.ageRange ||
                !form.sex ||
                !form.history.trim() ||
                !form.question.trim() ||
                options.length === 1 ||
                (form.fileIds.length > 0 && !form.confirmed)
              }
            >
              {f('save')}
            </Button>
          </div>
        </form>
      )}
    </PageFrame>
  );
}
