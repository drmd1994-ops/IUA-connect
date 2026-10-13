'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { formatSize, useUpload } from '@/features/content/files';
import { useEventTime } from '@/features/events/shared';
import { errorMessage } from '@/lib/api-errors';
import { fromIsraelLocal, toIsraelLocal } from '@/lib/israel-time';

type Schemas = components['schemas'];
type Event = Schemas['AdminEventDto'];
type Session = Schemas['AdminSessionDto'];
type Speaker = Schemas['AdminSpeakerDto'];
type Material = Session['materials'][number];

interface Draft {
  startAt: string;
  endAt: string;
  room: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  speakerIds: string[];
  materials: Material[];
}

const ZONE = 'Asia/Jerusalem';

function toDraft(session: Session | null, event: Event): Draft {
  return {
    // A new session starts at the event's start, so the fields are never far off.
    startAt: toIsraelLocal(new Date(session?.startAt ?? event.startAt!)),
    endAt: session ? toIsraelLocal(new Date(session.endAt)) : '',
    room: session?.room ?? '',
    titleHe: session?.translations.he?.title ?? '',
    titleEn: session?.translations.en?.title ?? '',
    descriptionHe: session?.translations.he?.description ?? '',
    descriptionEn: session?.translations.en?.description ?? '',
    speakerIds: session?.speakerIds ?? [],
    materials: session?.materials ?? [],
  };
}

/** The speaker's name in the page's language, with their title. */
export function speakerName(speaker: Speaker, locale: string): string {
  const text =
    (locale === 'he' ? speaker.translations.he : speaker.translations.en) ??
    speaker.translations.he ??
    speaker.translations.en;
  return [text?.title, text?.name].filter(Boolean).join(' ');
}

/** The programme of one event: its sessions, with speakers and materials. */
export function EventSessions({ event }: { event: Event }) {
  const t = useTranslations();
  const s = (key: string) => t(`events.admin.sessions.${key}`);
  const locale = useLocale();
  const { range } = useEventTime();
  const { api, call } = useAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  /** The session being edited, "new" for the empty form, or null for none. */
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const closed = event.status === 'CANCELLED';
  const path = { path: { eventId: event.id } };

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/admin/events/{eventId}/sessions', { params: path })),
      call(() =>
        api.GET('/api/v1/admin/speakers', {
          params: { query: { pageSize: 100, eventId: event.id } },
        }),
      ),
    ])
      .then(([list, people]) => {
        if (!active) return;
        setSessions(list.items);
        setSpeakers(people.items);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
    // `path` is rebuilt on every render; the event's ID is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, call, event.id, version]);

  const changed = () => {
    setOpen(null);
    setVersion((v) => v + 1);
  };

  async function remove(session: Session) {
    setError(null);
    try {
      await call(() =>
        api.DELETE('/api/v1/admin/events/{eventId}/sessions/{sessionId}', {
          params: { path: { eventId: event.id, sessionId: session.id } },
        }),
      );
      changed();
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section aria-labelledby="sessions-title" className="flex flex-col gap-4">
      <h2 id="sessions-title" className="text-xl font-semibold">
        {s('title')}
      </h2>
      {!event.startAt || !event.endAt ? (
        <p className="text-text-muted">{s('needsDates')}</p>
      ) : (
        <>
          {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
          {sessions && sessions.length === 0 && <p className="text-text-muted">{s('empty')}</p>}
          {sessions && sessions.length > 0 && (
            <ul className="flex flex-col gap-3" data-testid="admin-sessions">
              {sessions.map((session) => {
                const title =
                  (locale === 'he'
                    ? (session.translations.he?.title ?? session.translations.en?.title)
                    : (session.translations.en?.title ?? session.translations.he?.title)) ?? '';
                return (
                  <li key={session.id} className="rounded-md border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{title}</p>
                        <p className="text-sm text-text-muted">
                          {range(session.startAt, session.endAt, ZONE)}
                          {session.room && ` · ${session.room}`}
                        </p>
                      </div>
                      {!closed && (
                        <div className="flex gap-3">
                          <Button
                            type="button"
                            variant="secondary"
                            aria-expanded={open === session.id}
                            aria-label={`${s('edit')}: ${title}`}
                            onClick={() => setOpen(open === session.id ? null : session.id)}
                          >
                            {s('edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="link"
                            aria-label={t('events.admin.sessions.removeItem', { title })}
                            onClick={() => void remove(session)}
                          >
                            {s('remove')}
                          </Button>
                        </div>
                      )}
                    </div>
                    {open === session.id && (
                      <SessionForm
                        event={event}
                        session={session}
                        speakers={speakers}
                        onSaved={changed}
                        onCancel={() => setOpen(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!closed && open !== 'new' && (
            <div>
              <Button type="button" variant="secondary" onClick={() => setOpen('new')}>
                {s('add')}
              </Button>
            </div>
          )}
          {open === 'new' && (
            <SessionForm
              event={event}
              session={null}
              speakers={speakers}
              onSaved={changed}
              onCancel={() => setOpen(null)}
            />
          )}
        </>
      )}
    </section>
  );
}

function SessionForm({
  event,
  session,
  speakers,
  onSaved,
  onCancel,
}: {
  event: Event;
  session: Session | null;
  speakers: Speaker[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const s = (key: string) => t(`events.admin.sessions.${key}`);
  const locale = useLocale();
  const upload = useUpload();
  const { api, call } = useAuth();
  const fileId = useId();
  const [draft, setDraft] = useState(() => toDraft(session, event));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const hasTitle = !!draft.titleHe.trim() || !!draft.titleEn.trim();
  const [startAt, endAt] = [fromIsraelLocal(draft.startAt), fromIsraelLocal(draft.endAt)];

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!startAt || !endAt) return;
    setPending(true);
    setError(null);
    const text = (title: string, description: string) =>
      title.trim()
        ? {
            title: title.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
          }
        : undefined;
    const body = {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      ...(draft.room.trim() ? { room: draft.room.trim() } : {}),
      speakerIds: draft.speakerIds,
      materialFileIds: draft.materials.map((file) => file.id),
      translations: {
        he: text(draft.titleHe, draft.descriptionHe),
        en: text(draft.titleEn, draft.descriptionEn),
      },
    };
    try {
      if (session) {
        await call(() =>
          api.PUT('/api/v1/admin/events/{eventId}/sessions/{sessionId}', {
            params: { path: { eventId: event.id, sessionId: session.id } },
            body,
          }),
        );
      } else {
        await call(() =>
          api.POST('/api/v1/admin/events/{eventId}/sessions', {
            params: { path: { eventId: event.id } },
            body,
          }),
        );
      }
      onSaved();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  async function addMaterial(changeEvent: ChangeEvent<HTMLInputElement>) {
    const file = changeEvent.target.files?.[0];
    changeEvent.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const stored = await upload(file);
      set({ materials: [...draft.materials, stored] });
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
          label={s('titleHe')}
          value={draft.titleHe}
          onChange={(e) => set({ titleHe: e.target.value })}
          dir="rtl"
          lang="he"
          maxLength={300}
        />
        <TextField
          label={s('titleEn')}
          value={draft.titleEn}
          onChange={(e) => set({ titleEn: e.target.value })}
          dir="ltr"
          lang="en"
          maxLength={300}
        />
        <TextareaField
          label={s('descriptionHe')}
          value={draft.descriptionHe}
          onChange={(e) => set({ descriptionHe: e.target.value })}
          dir="rtl"
          lang="he"
          maxLength={4000}
          rows={2}
        />
        <TextareaField
          label={s('descriptionEn')}
          value={draft.descriptionEn}
          onChange={(e) => set({ descriptionEn: e.target.value })}
          dir="ltr"
          lang="en"
          maxLength={4000}
          rows={2}
        />
        <TextField
          type="datetime-local"
          label={s('startAt')}
          hint={t('events.admin.editor.timeHint')}
          value={draft.startAt}
          onChange={(e) => set({ startAt: e.target.value })}
          dir="ltr"
        />
        <TextField
          type="datetime-local"
          label={s('endAt')}
          hint={t('events.admin.editor.timeHint')}
          value={draft.endAt}
          onChange={(e) => set({ endAt: e.target.value })}
          dir="ltr"
        />
        <TextField
          label={s('room')}
          value={draft.room}
          onChange={(e) => set({ room: e.target.value })}
          maxLength={200}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{s('speakers')}</legend>
        {speakers.length === 0 && <p className="text-sm text-text-muted">{s('noSpeakers')}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {speakers.map((speaker) => (
            <label key={speaker.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={draft.speakerIds.includes(speaker.id)}
                onChange={() =>
                  set({
                    speakerIds: draft.speakerIds.includes(speaker.id)
                      ? draft.speakerIds.filter((id) => id !== speaker.id)
                      : [...draft.speakerIds, speaker.id],
                  })
                }
              />
              {speakerName(speaker, locale)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <p className="font-semibold">{s('materials')}</p>
        {draft.materials.length > 0 && (
          <ul className="flex flex-col gap-1">
            {draft.materials.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-3">
                <span>
                  {file.originalName} ({formatSize(file.sizeBytes, locale)})
                </span>
                <Button
                  type="button"
                  variant="link"
                  aria-label={t('events.admin.sessions.removeItem', { title: file.originalName })}
                  onClick={() =>
                    set({ materials: draft.materials.filter((f) => f.id !== file.id) })
                  }
                >
                  {s('remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="font-semibold">
            {s('addMaterial')}
          </label>
          <p id={`${fileId}-hint`} className="text-sm text-text-muted">
            {s('materialHint')}
          </p>
          <input
            id={fileId}
            type="file"
            accept=".pdf,.docx,.pptx"
            aria-describedby={`${fileId}-hint`}
            onChange={(e) => void addMaterial(e)}
            className="max-w-full text-sm"
          />
        </div>
      </div>

      {!hasTitle && <p className="text-sm text-text-muted">{s('titleRequired')}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending} disabled={!hasTitle || !startAt || !endAt}>
          {s('save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {s('cancel')}
        </Button>
      </div>
    </form>
  );
}
