'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage, useUpload } from '@/features/content/files';
import { Pager } from '@/features/content/pager';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { speakerName } from './event-sessions';

type Schemas = components['schemas'];
type List = Schemas['AdminSpeakerListDto'];
type Speaker = Schemas['AdminSpeakerDto'];

const PAGE_SIZE = 50;

/** Speakers, shared between events. Records, not accounts; fictional names in the demo. */
export function SpeakersPage() {
  const t = useTranslations();
  const s = (key: string) => t(`events.admin.speakers.${key}`);
  const locale = useLocale();
  const { api, call } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  /** The speaker being edited, "new" for the empty form, or null for none. */
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/speakers', {
        params: { query: { page, pageSize: PAGE_SIZE, ...(q ? { q } : {}) } },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, q, version]);

  const changed = () => {
    setOpen(null);
    setVersion((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/events"
          className="font-semibold text-primary underline underline-offset-4"
        >
          {t('events.admin.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{s('title')}</h1>
        <p className="mt-2 text-text-muted">{s('intro')}</p>
      </div>
      <form
        role="search"
        className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <TextField
          label={s('search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {s('searchButton')}
        </Button>
        <Button type="button" onClick={() => setOpen('new')}>
          {s('add')}
        </Button>
      </form>
      {open === 'new' && (
        <SpeakerForm speaker={null} onSaved={changed} onCancel={() => setOpen(null)} />
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && <p className="text-text-muted">{s('empty')}</p>}
      {list && list.items.length > 0 && (
        <ul className="flex flex-col gap-3" data-testid="speakers">
          {list.items.map((speaker) => {
            const name = speakerName(speaker, locale);
            return (
              <li key={speaker.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {speaker.photoFileId && (
                      <StoredImage
                        fileId={speaker.photoFileId}
                        variant="thumb"
                        alt=""
                        className="size-12 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <p className="font-semibold">{name}</p>
                      <p className="text-sm text-text-muted">
                        {t('events.admin.speakers.inSessions', { count: speaker.sessionCount })}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-expanded={open === speaker.id}
                    aria-label={`${s('edit')}: ${name}`}
                    onClick={() => setOpen(open === speaker.id ? null : speaker.id)}
                  >
                    {s('edit')}
                  </Button>
                </div>
                {open === speaker.id && (
                  <SpeakerForm speaker={speaker} onSaved={changed} onCancel={() => setOpen(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </div>
  );
}

function SpeakerForm({
  speaker,
  onSaved,
  onCancel,
}: {
  speaker: Speaker | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const s = (key: string) => t(`events.admin.speakers.${key}`);
  const upload = useUpload();
  const { api, call } = useAuth();
  const photoId = useId();
  const text = (lang: 'he' | 'en') => speaker?.translations[lang];
  const [draft, setDraft] = useState({
    nameHe: text('he')?.name ?? '',
    nameEn: text('en')?.name ?? '',
    titleHe: text('he')?.title ?? '',
    titleEn: text('en')?.title ?? '',
    affiliationHe: text('he')?.affiliation ?? '',
    affiliationEn: text('en')?.affiliation ?? '',
    bioHe: text('he')?.bio ?? '',
    bioEn: text('en')?.bio ?? '',
    photoFileId: speaker?.photoFileId ?? null,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const hasName = !!draft.nameHe.trim() || !!draft.nameEn.trim();

  async function attempt(request: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await request();
      onSaved();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const one = (name: string, title: string, affiliation: string, bio: string) =>
      name.trim()
        ? {
            name: name.trim(),
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(affiliation.trim() ? { affiliation: affiliation.trim() } : {}),
            ...(bio.trim() ? { bio: bio.trim() } : {}),
          }
        : undefined;
    const body = {
      photoFileId: draft.photoFileId,
      translations: {
        he: one(draft.nameHe, draft.titleHe, draft.affiliationHe, draft.bioHe),
        en: one(draft.nameEn, draft.titleEn, draft.affiliationEn, draft.bioEn),
      },
    };
    void attempt(() =>
      speaker
        ? call(() =>
            api.PUT('/api/v1/admin/speakers/{id}', { params: { path: { id: speaker.id } }, body }),
          )
        : call(() => api.POST('/api/v1/admin/speakers', { body })),
    );
  }

  async function addPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      set({ photoFileId: (await upload(file)).id });
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-4 flex flex-col gap-4 rounded-md border border-border p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={s('nameHe')}
          value={draft.nameHe}
          onChange={(e) => set({ nameHe: e.target.value })}
          dir="rtl"
          lang="he"
          maxLength={200}
        />
        <TextField
          label={s('nameEn')}
          value={draft.nameEn}
          onChange={(e) => set({ nameEn: e.target.value })}
          dir="ltr"
          lang="en"
          maxLength={200}
        />
        <TextField
          label={s('titleHe')}
          hint={s('titleHint')}
          value={draft.titleHe}
          onChange={(e) => set({ titleHe: e.target.value })}
          dir="rtl"
          lang="he"
          maxLength={100}
        />
        <TextField
          label={s('titleEn')}
          hint={s('titleHint')}
          value={draft.titleEn}
          onChange={(e) => set({ titleEn: e.target.value })}
          dir="ltr"
          lang="en"
          maxLength={100}
        />
        <TextField
          label={s('affiliationHe')}
          value={draft.affiliationHe}
          onChange={(e) => set({ affiliationHe: e.target.value })}
          dir="rtl"
          lang="he"
          maxLength={300}
        />
        <TextField
          label={s('affiliationEn')}
          value={draft.affiliationEn}
          onChange={(e) => set({ affiliationEn: e.target.value })}
          dir="ltr"
          lang="en"
          maxLength={300}
        />
        <TextareaField
          label={s('bioHe')}
          value={draft.bioHe}
          onChange={(e) => set({ bioHe: e.target.value })}
          dir="rtl"
          lang="he"
          maxLength={2000}
          rows={3}
        />
        <TextareaField
          label={s('bioEn')}
          value={draft.bioEn}
          onChange={(e) => set({ bioEn: e.target.value })}
          dir="ltr"
          lang="en"
          maxLength={2000}
          rows={3}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {draft.photoFileId && (
          <>
            <StoredImage
              fileId={draft.photoFileId}
              variant="thumb"
              alt={s('photo')}
              className="size-20 rounded-full object-cover"
            />
            <Button type="button" variant="secondary" onClick={() => set({ photoFileId: null })}>
              {s('removePhoto')}
            </Button>
          </>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={photoId} className="font-semibold">
            {s('uploadPhoto')}
          </label>
          <input
            id={photoId}
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => void addPhoto(e)}
            className="max-w-full text-sm"
          />
        </div>
      </div>
      {!hasName && <p className="text-sm text-text-muted">{s('nameRequired')}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending} disabled={!hasName}>
          {s('save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {s('cancel')}
        </Button>
        {speaker && (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() =>
              void attempt(() =>
                call(() =>
                  api.DELETE('/api/v1/admin/speakers/{id}', {
                    params: { path: { id: speaker.id } },
                  }),
                ),
              )
            }
          >
            {s('delete')}
          </Button>
        )}
      </div>
    </form>
  );
}
