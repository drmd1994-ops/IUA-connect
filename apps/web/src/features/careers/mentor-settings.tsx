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
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { useLocalName, useReference } from '@/features/membership/reference';
import { errorMessage } from '@/lib/api-errors';
import { CareersNav, MENTOR_LANGUAGES, useDisplayNames } from './careers-parts';

type Settings = components['schemas']['MentorSettingsDto'];
type Input = components['schemas']['MentorSettingsInputDto'];

const EMPTY: Input = {
  open: true,
  subspecialtyIds: [],
  academicInterests: '',
  careerInterests: '',
  availability: '',
  languages: [],
  capacity: 2,
};

/** A verified specialist's own mentor settings (M28): listed only by their own choice. */
export function MentorSettings() {
  return <RequireSignIn>{() => <SettingsPage />}</RequireSignIn>;
}

function SettingsPage() {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/mentorship/settings'))
      .then((result) => active && setSettings(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  const s = (key: string) => t(`careers.settings.${key}`);
  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{s('title')}</h1>
        <p className="mt-2 text-text-muted">{s('intro')}</p>
      </div>
      <CareersNav />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!settings && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {settings && !settings.eligible && <Alert>{s('notEligible')}</Alert>}
      {settings?.eligible && <SettingsForm initial={settings} />}
    </PageFrame>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const t = useTranslations();
  const name = useLocalName();
  const names = useDisplayNames();
  const reference = useReference();
  const { api, call } = useAuth();
  const [form, setForm] = useState<Input>(initial.settings ?? EMPTY);
  const [active, setActive] = useState(initial.active);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (patch: Partial<Input>) => {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  };
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await call(() => api.PUT('/api/v1/mentorship/settings', { body: form }));
      if (result.settings) setForm(result.settings);
      setActive(result.active);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const s = (key: string) => t(`careers.settings.${key}`);
  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-6">
      <p className="text-text-muted">{t('careers.settings.active', { count: active })}</p>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="size-4"
            checked={form.open}
            onChange={(event) => set({ open: event.target.checked })}
          />
          {s('open')}
        </label>
        <p className="text-sm text-text-muted">{s('openHint')}</p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{s('subspecialties')}</legend>
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
      <TextareaField
        label={s('academic')}
        value={form.academicInterests}
        maxLength={1000}
        rows={3}
        onChange={(event) => set({ academicInterests: event.target.value })}
      />
      <TextareaField
        label={s('career')}
        hint={s('careerHint')}
        value={form.careerInterests}
        maxLength={1000}
        rows={3}
        onChange={(event) => set({ careerInterests: event.target.value })}
      />
      <TextField
        label={s('availability')}
        hint={s('availabilityHint')}
        value={form.availability}
        maxLength={300}
        onChange={(event) => set({ availability: event.target.value })}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{s('languages')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MENTOR_LANGUAGES.map((code) => (
            <label key={code} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={form.languages.includes(code)}
                onChange={() => set({ languages: toggle(form.languages, code) })}
              />
              {names.language.of(code)}
            </label>
          ))}
        </div>
      </fieldset>
      <SelectField
        className="max-w-xs"
        label={s('capacity')}
        hint={s('capacityHint')}
        value={String(form.capacity)}
        onChange={(event) => set({ capacity: Number(event.target.value) })}
        options={Array.from({ length: 10 }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {saved && <Alert tone="success">{s('saved')}</Alert>}
      <div>
        <Button type="submit" pending={pending}>
          {s('save')}
        </Button>
      </div>
    </form>
  );
}
