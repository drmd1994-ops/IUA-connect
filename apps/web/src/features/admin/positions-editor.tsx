'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { COUNTRIES, useDisplayNames } from '@/features/careers/careers-parts';
import { useDepartments, useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { MarkdownEditor } from './markdown-editor';

type Schemas = components['schemas'];
type Item = Schemas['AdminPositionDto'];
type Scope = Schemas['PositionScopeDto'];
type History = Schemas['PositionHistoryDto']['items'];
type Kind = Item['kind'];
type Audience = Item['audience'];
type Action = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'TAKE_BACK' | 'ARCHIVE';
type Lang = 'he' | 'en';

const KINDS: Kind[] = ['JOB', 'FELLOWSHIP', 'RESEARCH'];
const AUDIENCES: Audience[] = ['ANYONE', 'SPECIALISTS', 'RESIDENTS', 'STUDENTS'];
const LANGS: Lang[] = ['he', 'en'];
const PLATFORM = 'platform';
const DEPARTMENT = 'department:';
const link = 'font-semibold text-primary underline underline-offset-4';

interface Draft {
  kind: Kind;
  placeKind: 'hospital' | 'other';
  hospitalId: string;
  departmentId: string;
  institutionName: string;
  city: string;
  country: string;
  audience: Audience;
  subspecialtyIds: string[];
  applyUrl: string;
  applyEmail: string;
  closesOn: string;
  text: Record<Lang, { title: string; body: string }>;
}

/** Thirty days from today, "YYYY-MM-DD". */
const inAMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

function toDraft(item: Item | null): Draft {
  const text = (lang: Lang) => item?.translations[lang] ?? { title: '', body: '' };
  return {
    kind: item?.kind ?? 'JOB',
    placeKind: item && !item.place.hospital ? 'other' : 'hospital',
    hospitalId: item?.place.hospital?.id ?? '',
    departmentId: item?.place.department?.id ?? '',
    institutionName: item?.place.institutionName ?? '',
    city: item?.place.city ?? '',
    country: item?.place.country ?? 'IL',
    audience: item?.audience ?? 'ANYONE',
    subspecialtyIds: item?.subspecialties.map((s) => s.id) ?? [],
    applyUrl: item?.applyUrl ?? '',
    applyEmail: item?.applyEmail ?? '',
    closesOn: item?.closesOn ?? inAMonth(),
    text: { he: text('he'), en: text('en') },
  };
}

function toBody(draft: Draft) {
  const translation = (lang: Lang) => {
    const t = draft.text[lang];
    return t.title.trim() ? { title: t.title, body: t.body } : undefined;
  };
  const hospital = draft.placeKind === 'hospital';
  return {
    kind: draft.kind,
    hospitalId: hospital ? draft.hospitalId || null : null,
    departmentId: hospital ? draft.departmentId || null : null,
    institutionName: hospital ? null : draft.institutionName.trim() || null,
    city: hospital ? null : draft.city.trim() || null,
    country: hospital ? 'IL' : draft.country,
    audience: draft.audience,
    subspecialtyIds: draft.subspecialtyIds,
    applyUrl: draft.applyUrl.trim() || null,
    applyEmail: draft.applyEmail.trim() || null,
    closesOn: draft.closesOn,
    translations: { he: translation('he'), en: translation('en') },
  };
}

/** Loads a position (or starts a new one) and shows the editor (M28). */
export function PositionsEditor({ id }: { id: string | null }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/admin/positions/scope')),
      id
        ? call(() => api.GET('/api/v1/admin/positions/{id}', { params: { path: { id } } }))
        : Promise.resolve(null),
    ])
      .then(([loadedScope, loadedItem]) => {
        if (!active) return;
        setScope(loadedScope);
        setItem(loadedItem);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  if (error !== null) return <Alert tone="error">{errorMessage(error, t)}</Alert>;
  if (!scope || (id && !item)) return <p role="status">{t('membership.common.loading')}</p>;
  return <EditorForm key={item?.id ?? 'new'} initial={item} scope={scope} />;
}

function EditorForm({ initial, scope }: { initial: Item | null; scope: Scope }) {
  const t = useTranslations();
  const name = useLocalName();
  const names = useDisplayNames();
  const router = useRouter();
  const reference = useReference();
  const { api, call } = useAuth();
  const [item, setItem] = useState(initial);
  // A new position by a director starts at their (first) department.
  const [draft, setDraft] = useState(() => {
    const start = toDraft(initial);
    const first = scope.departments[0];
    return !initial && !scope.platform && !scope.organisations.length && first
      ? { ...start, hospitalId: first.hospital.id, departmentId: first.id }
      : start;
  });
  const [lang, setLang] = useState<Lang>('he');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const tabsId = useId();
  const departments = useDepartments(draft.hospitalId);

  // Who posts it: the platform, an organisation, or a department the reader directs.
  const owners = [
    ...(scope.platform ? [{ value: PLATFORM, label: t('careers.admin.ownerPlatform') }] : []),
    ...scope.organisations.map((o) => ({ value: o.id, label: name(o) })),
    ...scope.departments.map((d) => ({
      value: `${DEPARTMENT}${d.id}`,
      label: t('careers.admin.ownerDepartment', {
        department: name(d),
        hospital: name(d.hospital),
      }),
    })),
  ];
  const [owner, setOwner] = useState(() => owners[0]?.value ?? PLATFORM);
  const directed = owner.startsWith(DEPARTMENT)
    ? scope.departments.find((d) => `${DEPARTMENT}${d.id}` === owner)
    : undefined;
  const editable = (!item || item.status === 'DRAFT') && (!item || item.canWrite);

  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setText = (patch: Partial<Draft['text'][Lang]>) =>
    set({ text: { ...draft.text, [lang]: { ...draft.text[lang], ...patch } } });
  const chooseOwner = (value: string) => {
    setOwner(value);
    const department = scope.departments.find((d) => `${DEPARTMENT}${d.id}` === value);
    if (department) {
      set({
        placeKind: 'hospital',
        hospitalId: department.hospital.id,
        departmentId: department.id,
      });
    }
  };
  async function save(): Promise<Item> {
    const body = toBody(draft);
    if (!item) {
      const organisationId = owner === PLATFORM || owner.startsWith(DEPARTMENT) ? null : owner;
      return call(() => api.POST('/api/v1/admin/positions', { body: { ...body, organisationId } }));
    }
    return call(() =>
      api.PUT('/api/v1/admin/positions/{id}', {
        params: { path: { id: item.id }, header: { 'If-Match': `"${item.version}"` } },
        body,
      }),
    );
  }

  async function attempt(work: () => Promise<Item | null>) {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await work();
      if (!result) {
        router.push('/admin/positions');
        return;
      }
      if (result.id !== item?.id) {
        router.replace(`/admin/positions/${result.id}`);
        return;
      }
      setItem(result);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const transition = (action: Action, comment?: string) =>
    attempt(async () => {
      // Submitting sends what is on the screen: save first.
      const current = action === 'SUBMIT' ? await save() : item!;
      return call(() =>
        api.POST('/api/v1/admin/positions/{id}/transitions', {
          params: { path: { id: current.id } },
          body: { action, ...(comment ? { comment } : {}) },
        }),
      );
    });

  const e = (key: string) => t(`careers.admin.${key}`);
  const text = draft.text[lang];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/positions" className={link}>
          {e('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">
          {item ? e('editTitle') : e('newTitle')}
        </h1>
        {item && (
          <p className="mt-2 text-text-muted" data-testid="position-status">
            {t(`careers.admin.statuses.${item.status}`)}
          </p>
        )}
      </div>
      {item && !editable && item.status !== 'ARCHIVED' && <Alert>{e('readOnly')}</Alert>}

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void attempt(save);
        }}
      >
        <fieldset disabled={!editable || pending} className="flex flex-col gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {item ? (
              <p>
                <span className="font-semibold">{e('owner')}: </span>
                {item.organisation ? name(item.organisation) : e('ownerPlatform')}
              </p>
            ) : (
              <SelectField
                label={e('owner')}
                value={owner}
                onChange={(event) => chooseOwner(event.target.value)}
                options={owners}
              />
            )}
            <SelectField
              label={t('careers.positions.kind')}
              value={draft.kind}
              onChange={(event) => set({ kind: event.target.value as Kind })}
              options={KINDS.map((kind) => ({ value: kind, label: t(`careers.kinds.${kind}`) }))}
            />
          </div>

          <div role="tablist" aria-label={e('language')} className="flex gap-1">
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                id={`${tabsId}-${code}`}
                aria-selected={lang === code}
                aria-controls={`${tabsId}-panel`}
                onClick={() => setLang(code)}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${
                  lang === code
                    ? 'bg-primary text-on-primary'
                    : 'border border-border text-text hover:bg-surface-muted'
                }`}
              >
                {e(code === 'he' ? 'hebrew' : 'english')}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-${lang}`}
            className="flex flex-col gap-5"
          >
            <TextField
              label={e('titleLabel')}
              value={text.title}
              onChange={(event) => setText({ title: event.target.value })}
              maxLength={300}
              lang={lang}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            />
            <MarkdownEditor
              key={`${lang}:${item?.id ?? 'new'}`}
              label={e('body')}
              initial={text.body}
              onChange={(body) => setText({ body })}
              lang={lang}
              disabled={!editable || pending}
            />
          </div>

          <fieldset className="flex flex-col gap-3" disabled={!!directed}>
            <legend className="mb-1 font-semibold">{e('place')}</legend>
            <div className="flex flex-wrap gap-4">
              {(['hospital', 'other'] as const).map((value) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="place-kind"
                    className="size-4"
                    checked={draft.placeKind === value}
                    onChange={() => set({ placeKind: value })}
                  />
                  {e(value === 'hospital' ? 'placeHospital' : 'placeOther')}
                </label>
              ))}
            </div>
            {draft.placeKind === 'hospital' ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField
                  label={e('hospital')}
                  placeholder={e('chooseHospital')}
                  value={draft.hospitalId}
                  onChange={(event) => set({ hospitalId: event.target.value, departmentId: '' })}
                  options={(reference?.hospitals ?? []).map((h) => ({
                    value: h.id,
                    label: name(h),
                  }))}
                />
                <SelectField
                  label={e('department')}
                  placeholder={e('noDepartment')}
                  value={draft.departmentId}
                  onChange={(event) => set({ departmentId: event.target.value })}
                  options={departments.map((d) => ({ value: d.id, label: name(d) }))}
                />
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-3">
                <TextField
                  label={e('institution')}
                  value={draft.institutionName}
                  maxLength={200}
                  onChange={(event) => set({ institutionName: event.target.value })}
                />
                <TextField
                  label={e('city')}
                  value={draft.city}
                  maxLength={100}
                  onChange={(event) => set({ city: event.target.value })}
                />
                <SelectField
                  label={e('country')}
                  value={draft.country}
                  onChange={(event) => set({ country: event.target.value })}
                  options={COUNTRIES.map((code) => ({
                    value: code,
                    label: names.country.of(code) ?? code,
                  }))}
                />
              </div>
            )}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label={e('audience')}
              value={draft.audience}
              onChange={(event) => set({ audience: event.target.value as Audience })}
              options={AUDIENCES.map((value) => ({
                value,
                label: t(`careers.audiences.${value}`),
              }))}
            />
            <TextField
              type="date"
              label={e('closesOn')}
              value={draft.closesOn}
              onChange={(event) => set({ closesOn: event.target.value })}
              dir="ltr"
            />
            <TextField
              type="url"
              label={e('applyUrl')}
              hint={e('applyHint')}
              value={draft.applyUrl}
              maxLength={500}
              dir="ltr"
              onChange={(event) => set({ applyUrl: event.target.value })}
            />
            <TextField
              type="email"
              label={e('applyEmail')}
              hint={e('applyHint')}
              value={draft.applyEmail}
              maxLength={254}
              dir="ltr"
              onChange={(event) => set({ applyEmail: event.target.value })}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">{e('subspecialties')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(reference?.subspecialties ?? []).map((subspecialty) => (
                <label key={subspecialty.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={draft.subspecialtyIds.includes(subspecialty.id)}
                    onChange={() =>
                      set({
                        subspecialtyIds: draft.subspecialtyIds.includes(subspecialty.id)
                          ? draft.subspecialtyIds.filter((x) => x !== subspecialty.id)
                          : [...draft.subspecialtyIds, subspecialty.id],
                      })
                    }
                  />
                  {name(subspecialty)}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {saved && <Alert tone="success">{e('saved')}</Alert>}
        {editable && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={pending}>
              {e('save')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => void transition('SUBMIT')}
            >
              {e('actions.SUBMIT')}
            </Button>
          </div>
        )}
      </form>
      {item && (
        <ReviewPanel
          item={item}
          pending={pending}
          onTransition={(action, comment) => void transition(action, comment)}
          onDelete={() =>
            void attempt(async () => {
              await call(() =>
                api.DELETE('/api/v1/admin/positions/{id}', { params: { path: { id: item.id } } }),
              );
              return null;
            })
          }
        />
      )}
      {item && <HistoryList id={item.id} version={item.version} />}
    </div>
  );
}

function ReviewPanel({
  item,
  pending,
  onTransition,
  onDelete,
}: {
  item: Item;
  pending: boolean;
  onTransition: (action: Action, comment?: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('careers.admin.actions');
  const errors = useTranslations('errors.details');
  const { me } = useAuth();
  const [comment, setComment] = useState('');
  // Someone other than the person who submitted it publishes it (four eyes).
  const ownSubmission = item.submittedBy !== null && item.submittedBy === me?.id;
  const review = item.status === 'IN_REVIEW' && item.canReview;
  const published = item.status === 'PUBLISHED' && (item.canWrite || item.canReview);
  const deletable = item.status === 'DRAFT' && item.canWrite && !item.publishedAt;
  if (!review && !published && !deletable) return null;
  return (
    <section
      aria-labelledby="position-review"
      className="flex flex-col gap-4 rounded-md border border-border p-5"
    >
      <h2 id="position-review" className="text-xl font-semibold">
        {t('title')}
      </h2>
      {review && (
        <>
          <TextareaField
            label={t('comment')}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            rows={2}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !comment.trim()}
              onClick={() => onTransition('SEND_BACK', comment.trim())}
            >
              {t('SEND_BACK')}
            </Button>
            {!ownSubmission && (
              <Button type="button" disabled={pending} onClick={() => onTransition('PUBLISH')}>
                {t('PUBLISH')}
              </Button>
            )}
          </div>
          {ownSubmission && <p className="text-sm text-text-muted">{errors('ownSubmission')}</p>}
        </>
      )}
      {published && (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onTransition('TAKE_BACK')}
          >
            {t('TAKE_BACK')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onTransition('ARCHIVE')}
          >
            {t('ARCHIVE')}
          </Button>
        </div>
      )}
      {deletable && (
        <div>
          <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>
            {t('delete')}
          </Button>
        </div>
      )}
    </section>
  );
}

function HistoryList({ id, version }: { id: string; version: number }) {
  const t = useTranslations('careers.admin');
  const format = useFormatter();
  const { api, call } = useAuth();
  const [items, setItems] = useState<History>([]);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/positions/{id}/history', { params: { path: { id } } }))
      .then((result) => active && setItems(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call, id, version]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="position-history" className="flex flex-col gap-3">
      <h2 id="position-history" className="text-xl font-semibold">
        {t('history')}
      </h2>
      <ol className="flex flex-col gap-2">
        {items.map((entry, index) => (
          <li key={index} className="text-sm">
            <time dateTime={entry.at} className="text-text-muted">
              {format.dateTime(new Date(entry.at), { dateStyle: 'medium', timeStyle: 'short' })}
            </time>{' '}
            ·{' '}
            {t.has(`historyActions.${entry.action}`)
              ? t(`historyActions.${entry.action}`)
              : entry.action}
            {entry.comment && ` · ${entry.comment}`}
          </li>
        ))}
      </ol>
    </section>
  );
}
