'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage, useUpload } from '@/features/content/files';
import { useLocalName } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { fromIsraelLocal, toIsraelLocal } from '@/lib/israel-time';
import { EventAttendance, EventRegistrations } from './event-people';
import { EventSessions } from './event-sessions';
import { MarkdownEditor } from './markdown-editor';
import { type Tier, TierFields } from './tier-fields';

type Schemas = components['schemas'];
type Item = Schemas['AdminEventDto'];
type Category = Schemas['EventCategoryListDto']['items'][number];
type Mode = Item['registrationMode'];
type Lang = 'he' | 'en';

interface Text {
  title: string;
  summary: string;
  description: string;
}
interface Draft {
  startAt: string;
  endAt: string;
  locationName: string;
  address: string;
  lat: string;
  lng: string;
  organizer: string;
  categoryId: string;
  image: { id: string; originalName: string } | null;
  mode: Mode;
  registrationUrl: string;
  capacity: string;
  cme: boolean;
  tier: Tier;
  typeIds: string[];
  text: Record<Lang, Text>;
}

const LANGS: Lang[] = ['he', 'en'];
const MODES: Mode[] = ['NONE', 'INTERNAL', 'EXTERNAL'];
const EMPTY_TEXT: Text = { title: '', summary: '', description: '' };
const link = 'font-semibold text-primary underline underline-offset-4';
const local = (iso: string | null | undefined) => (iso ? toIsraelLocal(new Date(iso)) : '');

function toDraft(item: Item | null): Draft {
  const text = (lang: Lang): Text => {
    const t = item?.translations[lang];
    return t
      ? { title: t.title, summary: t.summary ?? '', description: t.description }
      : EMPTY_TEXT;
  };
  return {
    startAt: local(item?.startAt),
    endAt: local(item?.endAt),
    locationName: item?.locationName ?? '',
    address: item?.address ?? '',
    lat: item?.lat === null || item?.lat === undefined ? '' : String(item.lat),
    lng: item?.lng === null || item?.lng === undefined ? '' : String(item.lng),
    organizer: item?.organizer ?? '',
    categoryId: item?.categoryId ?? '',
    image: item?.image ?? null,
    mode: item?.registrationMode ?? 'NONE',
    registrationUrl: item?.registrationUrl ?? '',
    capacity: item?.capacity ? String(item.capacity) : '',
    cme: item?.cmeAvailable ?? false,
    tier: item?.accessTier ?? 'PUBLIC',
    typeIds: item?.typeIds ?? [],
    text: { he: text('he'), en: text('en') },
  };
}

function toBody(draft: Draft) {
  const translation = (lang: Lang) => {
    const t = draft.text[lang];
    if (!t.title.trim()) return undefined;
    return {
      title: t.title,
      description: t.description,
      ...(t.summary.trim() ? { summary: t.summary } : {}),
    };
  };
  const number = (value: string) => (value.trim() === '' ? null : Number(value));
  const optional = (key: string, value: string) => (value.trim() ? { [key]: value.trim() } : {});
  return {
    startAt: fromIsraelLocal(draft.startAt)?.toISOString() ?? null,
    endAt: fromIsraelLocal(draft.endAt)?.toISOString() ?? null,
    ...optional('locationName', draft.locationName),
    ...optional('address', draft.address),
    ...optional('organizer', draft.organizer),
    lat: number(draft.lat),
    lng: number(draft.lng),
    categoryId: draft.categoryId || null,
    imageFileId: draft.image?.id ?? null,
    registrationMode: draft.mode,
    registrationUrl:
      draft.mode === 'EXTERNAL' && draft.registrationUrl.trim()
        ? draft.registrationUrl.trim()
        : null,
    capacity: draft.mode === 'INTERNAL' ? number(draft.capacity) : null,
    cmeAvailable: draft.cme,
    accessTier: draft.tier,
    typeIds: draft.tier === 'TYPES' ? draft.typeIds : [],
    translations: { he: translation('he'), en: translation('en') },
  };
}

/** Loads an event (or starts a new one) and shows the editor. */
export function EventEditor({ id }: { id: string | null }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    call(() => api.GET('/api/v1/admin/events/{id}', { params: { path: { id } } }))
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  if (error !== null) return <Alert tone="error">{errorMessage(error, t)}</Alert>;
  if (id && !item) return <p role="status">{t('membership.common.loading')}</p>;
  return <EditorForm key={item?.id ?? 'new'} initial={item} />;
}

function EditorForm({ initial }: { initial: Item | null }) {
  const t = useTranslations();
  const e = (key: string) => t(`events.admin.editor.${key}`);
  const name = useLocalName();
  const router = useRouter();
  const upload = useUpload();
  const { api, call } = useAuth();
  const [item, setItem] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [lang, setLang] = useState<Lang>('he');
  const [categories, setCategories] = useState<Category[]>([]);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const tabsId = useId();
  const imageId = useId();
  const closed = item?.status === 'CANCELLED';
  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setText = (patch: Partial<Text>) =>
    set({ text: { ...draft.text, [lang]: { ...draft.text[lang], ...patch } } });

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/events/categories'))
      .then((result) => active && setCategories(result.items.filter((c) => c.active)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);

  async function attempt(work: () => Promise<Item | null>) {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await work();
      if (!result) {
        router.push('/admin/events');
        return;
      }
      if (result.id !== item?.id) {
        router.replace(`/admin/events/${result.id}`);
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

  /** Creates the event, or saves it with the version it was loaded with (If-Match). */
  const save = () => {
    const body = toBody(draft);
    if (!item) return call(() => api.POST('/api/v1/admin/events', { body }));
    return call(() =>
      api.PUT('/api/v1/admin/events/{id}', {
        params: { path: { id: item.id }, header: { 'If-Match': `"${item.version}"` } },
        body,
      }),
    );
  };

  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      set({ image: await upload(file) });
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(false);
    }
  }

  const text = draft.text[lang];
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/events" className={link}>
          {t('events.admin.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">
          {item ? e('editTitle') : e('newTitle')}
        </h1>
        {item && (
          <p className="mt-2 text-text-muted" data-testid="event-status">
            {t(`events.admin.statuses.${item.status}`)}
          </p>
        )}
      </div>
      {closed && <Alert tone="warning">{e('cancelledNotice')}</Alert>}
      {item?.status === 'PUBLISHED' && <Alert>{e('changeNotice')}</Alert>}

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void attempt(save);
        }}
      >
        <fieldset disabled={closed || pending} className="flex flex-col gap-6">
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
              dir={dir}
            />
            <TextareaField
              label={e('summary')}
              hint={e('summaryHint')}
              value={text.summary}
              onChange={(event) => setText({ summary: event.target.value })}
              maxLength={1000}
              rows={2}
              lang={lang}
              dir={dir}
            />
            <MarkdownEditor
              key={`${lang}:${item?.id ?? 'new'}`}
              label={e('description')}
              initial={text.description}
              onChange={(description) => setText({ description })}
              lang={lang}
              disabled={closed || pending}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              type="datetime-local"
              label={e('startAt')}
              hint={e('timeHint')}
              value={draft.startAt}
              onChange={(event) => set({ startAt: event.target.value })}
              dir="ltr"
            />
            <TextField
              type="datetime-local"
              label={e('endAt')}
              hint={e('timeHint')}
              value={draft.endAt}
              onChange={(event) => set({ endAt: event.target.value })}
              dir="ltr"
            />
            <TextField
              label={e('locationName')}
              value={draft.locationName}
              onChange={(event) => set({ locationName: event.target.value })}
              maxLength={300}
            />
            <TextField
              label={e('address')}
              value={draft.address}
              onChange={(event) => set({ address: event.target.value })}
              maxLength={500}
            />
            <TextField
              label={e('lat')}
              hint={e('coordinatesHint')}
              value={draft.lat}
              onChange={(event) => set({ lat: event.target.value })}
              inputMode="decimal"
              dir="ltr"
            />
            <TextField
              label={e('lng')}
              hint={e('coordinatesHint')}
              value={draft.lng}
              onChange={(event) => set({ lng: event.target.value })}
              inputMode="decimal"
              dir="ltr"
            />
            <TextField
              label={e('organizer')}
              value={draft.organizer}
              onChange={(event) => set({ organizer: event.target.value })}
              maxLength={300}
            />
            <SelectField
              label={e('category')}
              placeholder={e('noCategory')}
              value={draft.categoryId}
              onChange={(event) => set({ categoryId: event.target.value })}
              options={categories.map((c) => ({ value: c.id, label: name(c) }))}
            />
            <SelectField
              label={e('registrationMode')}
              value={draft.mode}
              onChange={(event) => set({ mode: event.target.value as Mode })}
              options={MODES.map((mode) => ({
                value: mode,
                label: t(`events.admin.modes.${mode}`),
              }))}
            />
            {draft.mode === 'EXTERNAL' && (
              <TextField
                type="url"
                label={e('registrationUrl')}
                value={draft.registrationUrl}
                onChange={(event) => set({ registrationUrl: event.target.value })}
                dir="ltr"
                maxLength={500}
              />
            )}
            {draft.mode === 'INTERNAL' && (
              <TextField
                label={e('capacity')}
                hint={e('capacityHint')}
                value={draft.capacity}
                onChange={(event) => set({ capacity: event.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
              />
            )}
            <TierFields
              label={e('tier')}
              typesLabel={e('types')}
              tier={draft.tier}
              typeIds={draft.typeIds}
              onChange={(tier, typeIds) => set({ tier, typeIds })}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={draft.cme}
              onChange={(event) => set({ cme: event.target.checked })}
            />
            {e('cme')}
          </label>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{e('image')}</h2>
            {draft.image ? (
              <div className="flex flex-wrap items-start gap-4">
                <StoredImage
                  fileId={draft.image.id}
                  variant="thumb"
                  alt={draft.image.originalName}
                  className="w-48 rounded-md border border-border"
                />
                <Button type="button" variant="secondary" onClick={() => set({ image: null })}>
                  {e('removeImage')}
                </Button>
              </div>
            ) : (
              <p className="text-text-muted">{e('noImage')}</p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={imageId} className="font-semibold">
                {e('uploadImage')}
              </label>
              <input
                id={imageId}
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => void addImage(event)}
                className="text-sm"
              />
            </div>
            {uploading && <p role="status">{e('uploading')}</p>}
          </section>
        </fieldset>

        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {saved && <Alert tone="success">{e('saved')}</Alert>}
        {!closed && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" pending={pending} disabled={uploading}>
              {e('save')}
            </Button>
            {item?.status === 'DRAFT' && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || uploading}
                  onClick={() =>
                    void attempt(async () => {
                      // Publishing sends what is on the screen: save first.
                      const current = await save();
                      return call(() =>
                        api.POST('/api/v1/admin/events/{id}/publish', {
                          params: { path: { id: current.id } },
                        }),
                      );
                    })
                  }
                >
                  {e('publish')}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    void attempt(async () => {
                      await call(() =>
                        api.DELETE('/api/v1/admin/events/{id}', {
                          params: { path: { id: item.id } },
                        }),
                      );
                      return null;
                    })
                  }
                >
                  {e('delete')}
                </Button>
              </>
            )}
            {item && item.status !== 'DRAFT' && (
              <Link href={`/events/${encodeURIComponent(item.slug)}`} className={link}>
                {e('viewPublic')}
              </Link>
            )}
          </div>
        )}
      </form>

      {item?.status === 'PUBLISHED' && (
        <section
          aria-labelledby="cancel-title"
          className="flex flex-col gap-3 rounded-md border border-border p-5"
        >
          <h2 id="cancel-title" className="text-xl font-semibold">
            {e('cancelEvent')}
          </h2>
          <TextareaField
            label={e('cancelReason')}
            hint={e('cancelHint')}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={1000}
            rows={2}
          />
          <div>
            <Button
              type="button"
              variant="danger"
              disabled={pending || !cancelReason.trim()}
              onClick={() =>
                void attempt(() =>
                  call(() =>
                    api.POST('/api/v1/admin/events/{id}/cancel', {
                      params: { path: { id: item.id } },
                      body: { reason: cancelReason.trim() },
                    }),
                  ),
                )
              }
            >
              {e('cancelEvent')}
            </Button>
          </div>
        </section>
      )}

      {item && (
        <>
          <EventSessions event={item} />
          <EventRegistrations eventId={item.id} version={item.version} />
          <EventAttendance event={item} />
        </>
      )}
    </div>
  );
}
