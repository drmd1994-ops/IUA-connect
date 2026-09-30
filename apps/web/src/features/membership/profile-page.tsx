'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { errorMessage } from '@/lib/api-errors';
import { useDepartments, useLocalName, useReference } from './reference';

type Profile = components['schemas']['ProfileDto'];
type FieldKey = keyof Profile['visibility'];
type Visibility = Profile['visibility'][FieldKey];

const VISIBILITIES: Visibility[] = ['PRIVATE', 'MEMBERS', 'PUBLIC'];
/** Offered languages (ISO 639-1); names come from the browser in the page's language. */
const LANGUAGES = ['he', 'en', 'ar', 'ru', 'am', 'fr', 'es', 'de', 'ro', 'it', 'pt', 'uk'];

const TEXT_FIELDS = [
  'firstName',
  'lastName',
  'nameHe',
  'nameEn',
  'title',
  'position',
  'bio',
  'researchInterests',
  'orcid',
  'contactEmail',
  'contactPhone',
] as const;
type TextKey = (typeof TEXT_FIELDS)[number];

export function ProfilePage() {
  return <RequireSignIn>{() => <ProfileEditor />}</RequireSignIn>;
}

function ProfileEditor() {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/profile'))
      .then((result) => active && setProfile(result))
      .catch((caught: unknown) => active && setLoadError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('membership.profile.title')}</h1>
        <p className="mt-2 text-text-muted">{t('membership.profile.intro')}</p>
      </div>
      {loadError !== null && <Alert tone="error">{errorMessage(loadError, t)}</Alert>}
      {profile ? (
        <ProfileForm initial={profile} onSaved={setProfile} />
      ) : (
        loadError === null && <p role="status">{t('membership.common.loading')}</p>
      )}
    </PageFrame>
  );
}

function ProfileForm({ initial, onSaved }: { initial: Profile; onSaved: (p: Profile) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const name = useLocalName();
  const { api, call } = useAuth();
  const reference = useReference();
  const [text, setText] = useState<Record<TextKey, string>>(
    () =>
      Object.fromEntries(TEXT_FIELDS.map((key) => [key, initial[key] ?? ''])) as Record<
        TextKey,
        string
      >,
  );
  const [hospitalId, setHospitalId] = useState(initial.hospitalId ?? '');
  const [departmentId, setDepartmentId] = useState(initial.departmentId ?? '');
  const [subspecialtyIds, setSubspecialtyIds] = useState(new Set(initial.subspecialtyIds));
  const [languages, setLanguages] = useState(new Set(initial.languages));
  const [visibility, setVisibility] = useState(initial.visibility);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const departments = useDepartments(hospitalId);
  const languageName = new Intl.DisplayNames([locale], { type: 'language' });

  const field = (key: TextKey) => ({
    value: text[key],
    onChange: (event: { target: { value: string } }) =>
      setText((current) => ({ ...current, [key]: event.target.value })),
  });
  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    const orNull = (value: string) => (value.trim() === '' ? null : value);
    try {
      const result = await call(() =>
        api.PATCH('/api/v1/me/profile', {
          body: {
            ...text,
            orcid: orNull(text.orcid),
            contactEmail: orNull(text.contactEmail),
            contactPhone: orNull(text.contactPhone),
            hospitalId: hospitalId || null,
            departmentId: hospitalId && departmentId ? departmentId : null,
            subspecialtyIds: [...subspecialtyIds],
            languages: [...languages],
            visibility,
          },
        }),
      );
      onSaved(result);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const see = (key: FieldKey) => (
    <VisibilitySelect
      label={`${t('membership.visibility.label')}: ${t(`membership.profile.visibilityOf.${key}`)}`}
      value={visibility[key]}
      onChange={(value) => setVisibility((current) => ({ ...current, [key]: value }))}
    />
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <Section title={t('membership.profile.sections.names')}>
        <Row visibility={see('NAME')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('membership.profile.fields.firstName')}
              {...field('firstName')}
              maxLength={100}
              autoComplete="given-name"
            />
            <TextField
              label={t('membership.profile.fields.lastName')}
              {...field('lastName')}
              maxLength={100}
              autoComplete="family-name"
            />
          </div>
        </Row>
        <Row visibility={see('NAME_HE')}>
          <TextField
            label={t('membership.profile.fields.nameHe')}
            {...field('nameHe')}
            maxLength={200}
            dir="rtl"
          />
        </Row>
        <Row visibility={see('NAME_EN')}>
          <TextField
            label={t('membership.profile.fields.nameEn')}
            {...field('nameEn')}
            maxLength={200}
            dir="ltr"
          />
        </Row>
      </Section>

      <Section title={t('membership.profile.sections.work')}>
        <Row visibility={see('TITLE')}>
          <TextField
            label={t('membership.profile.fields.title')}
            hint={t('membership.profile.hints.title')}
            {...field('title')}
            maxLength={100}
          />
        </Row>
        <Row visibility={see('POSITION')}>
          <TextField
            label={t('membership.profile.fields.position')}
            {...field('position')}
            maxLength={200}
          />
        </Row>
        <Row visibility={see('INSTITUTION')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('membership.profile.fields.hospital')}
              placeholder={t('membership.profile.noHospital')}
              value={hospitalId}
              onChange={(event) => {
                setHospitalId(event.target.value);
                setDepartmentId('');
              }}
              options={(reference?.hospitals ?? []).map((h) => ({ value: h.id, label: name(h) }))}
            />
            <SelectField
              label={t('membership.profile.fields.department')}
              placeholder={t('membership.profile.chooseDepartment')}
              value={departmentId}
              disabled={!hospitalId}
              onChange={(event) => setDepartmentId(event.target.value)}
              options={departments.map((d) => ({ value: d.id, label: name(d) }))}
            />
          </div>
        </Row>
        <Row visibility={see('SUBSPECIALTIES')}>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">
              {t('membership.profile.fields.subspecialties')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(reference?.subspecialties ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={subspecialtyIds.has(s.id)}
                    onChange={() => setSubspecialtyIds((set) => toggle(set, s.id))}
                    className="size-4"
                  />
                  {name(s)}
                </label>
              ))}
            </div>
          </fieldset>
        </Row>
      </Section>

      <Section title={t('membership.profile.sections.about')}>
        <Row visibility={see('BIO')}>
          <TextareaField
            label={t('membership.profile.fields.bio')}
            {...field('bio')}
            maxLength={4000}
            rows={5}
          />
        </Row>
        <Row visibility={see('RESEARCH_INTERESTS')}>
          <TextareaField
            label={t('membership.profile.fields.researchInterests')}
            {...field('researchInterests')}
            maxLength={2000}
            rows={3}
          />
        </Row>
        <Row visibility={see('ORCID')}>
          <TextField
            label={t('membership.profile.fields.orcid')}
            hint={t('membership.profile.hints.orcid')}
            {...field('orcid')}
            dir="ltr"
            maxLength={19}
          />
        </Row>
        <Row visibility={see('LANGUAGES')}>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">
              {t('membership.profile.fields.languages')}
            </legend>
            <p className="text-sm text-text-muted">{t('membership.profile.hints.languages')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LANGUAGES.map((code) => (
                <label key={code} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={languages.has(code)}
                    onChange={() => setLanguages((set) => toggle(set, code))}
                    className="size-4"
                  />
                  {languageName.of(code)}
                </label>
              ))}
            </div>
          </fieldset>
        </Row>
      </Section>

      <Section title={t('membership.profile.sections.contact')}>
        <Row visibility={see('CONTACT_EMAIL')}>
          <TextField
            type="email"
            label={t('membership.profile.fields.contactEmail')}
            {...field('contactEmail')}
            maxLength={254}
          />
        </Row>
        <Row visibility={see('CONTACT_PHONE')}>
          <TextField
            type="tel"
            label={t('membership.profile.fields.contactPhone')}
            {...field('contactPhone')}
            maxLength={32}
          />
        </Row>
      </Section>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {saved && <Alert tone="success">{t('membership.profile.saved')}</Alert>}
      <div>
        <Button type="submit" pending={pending} pendingLabel={t('auth.pending')}>
          {t('membership.common.save')}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A field with its own "who can see this" choice beside it. */
function Row({ visibility, children }: { visibility: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-end gap-3 border-b border-border pb-5 sm:grid-cols-[1fr_12rem]">
      <div>{children}</div>
      {visibility}
    </div>
  );
}

function VisibilitySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Visibility;
  onChange: (value: Visibility) => void;
}) {
  const t = useTranslations('membership.visibility');
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as Visibility)}
      className="rounded-md border border-neutral-400 bg-surface px-3 py-2.5 text-sm"
    >
      {VISIBILITIES.map((option) => (
        <option key={option} value={option}>
          {t(option)}
        </option>
      ))}
    </select>
  );
}
