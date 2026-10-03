'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage, formatSize, useUpload } from '@/features/content/files';
import {
  EDUCATION_LEVELS,
  EDUCATION_TYPES,
  type EducationLevel,
  type EducationType,
} from '@/features/education/education-list';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { type EducationAction, HistoryList, ReviewPanel, useCanEdit } from './education-review';
import { MarkdownEditor } from './markdown-editor';
import { type Tier, TierFields } from './tier-fields';

type Schemas = components['schemas'];
type Item = Schemas['AdminEducationDto'];
type ListItem = Schemas['AdminEducationListDto']['items'][number];
type History = Schemas['EducationHistoryDto']['items'];
type FileView = Item['files'][number];
type Lang = 'he' | 'en';

interface Text {
  title: string;
  description: string;
  author: string;
}
interface Draft {
  type: EducationType;
  level: EducationLevel | '';
  subspecialtyId: string;
  duration: string;
  cme: string;
  link: string;
  pending: boolean;
  tier: Tier;
  typeIds: string[];
  cover: FileView | null;
  files: FileView[];
  references: { title: string; url: string }[];
  text: Record<Lang, Text>;
}

const LANGS: Lang[] = ['he', 'en'];
const LINKED: EducationType[] = ['VIDEO', 'WEBINAR', 'SURGICAL_VIDEO', 'PODCAST'];
const WRITTEN: EducationType[] = ['ARTICLE', 'CASE'];
const PRIVATE: EducationType[] = ['CASE', 'SURGICAL_VIDEO'];
const EMPTY_TEXT: Text = { title: '', description: '', author: '' };
const link = 'font-semibold text-primary underline underline-offset-4';

function toDraft(item: Item | null): Draft {
  const text = (lang: Lang): Text => {
    const t = item?.translations[lang];
    return t ? { title: t.title, description: t.description, author: t.author ?? '' } : EMPTY_TEXT;
  };
  return {
    type: item?.type ?? 'ARTICLE',
    level: item?.level ?? '',
    subspecialtyId: item?.subspecialtyId ?? '',
    duration: item?.durationMinutes ? String(item.durationMinutes) : '',
    cme: item?.cmePoints === null || item?.cmePoints === undefined ? '' : String(item.cmePoints),
    link: item?.externalUrl ?? '',
    pending: item?.videoStatus === 'PENDING_PROVIDER',
    tier: item?.accessTier ?? 'PUBLIC',
    typeIds: item?.typeIds ?? [],
    cover: item?.cover ?? null,
    files: item?.files ?? [],
    references: item?.references ?? [],
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
      ...(t.author.trim() ? { author: t.author.trim() } : {}),
    };
  };
  const linked = LINKED.includes(draft.type);
  return {
    type: draft.type,
    level: draft.level || null,
    subspecialtyId: draft.subspecialtyId || null,
    durationMinutes: draft.duration.trim() ? Number(draft.duration) : null,
    cmePoints: draft.cme.trim() ? Number(draft.cme) : null,
    externalUrl: linked && draft.link.trim() ? draft.link.trim() : null,
    videoPending: linked && !draft.link.trim() && draft.pending,
    accessTier: draft.tier,
    typeIds: draft.tier === 'TYPES' ? draft.typeIds : [],
    coverFileId: draft.cover?.id ?? null,
    fileIds: draft.files.map((file) => file.id),
    references: draft.references.filter((r) => r.title.trim() && r.url.trim()),
    translations: { he: translation('he'), en: translation('en') },
  };
}

/** Loads an item (or starts a new one) and shows the editor. */
export function EducationEditor({ id }: { id: string | null }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    call(() => api.GET('/api/v1/admin/education/{id}', { params: { path: { id } } }))
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
  const e = (key: string) => t(`education.admin.editor.${key}`);
  const locale = useLocale();
  const name = useLocalName();
  const reference = useReference();
  const router = useRouter();
  const upload = useUpload();
  const { api, call } = useAuth();
  const [item, setItem] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [lang, setLang] = useState<Lang>('he');
  const [history, setHistory] = useState<History | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const tabsId = useId();
  const coverId = useId();
  const fileId = useId();
  const editable = useCanEdit(item?.status ?? null);
  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setText = (patch: Partial<Text>) =>
    set({ text: { ...draft.text, [lang]: { ...draft.text[lang], ...patch } } });
  const itemId = item?.id;
  const version = item?.version;

  useEffect(() => {
    if (!itemId) return;
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/education/{id}/history', { params: { path: { id: itemId } } }),
    )
      .then((result) => active && setHistory(result.items))
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
    // Reloaded when the item changes (its version increases on every change).
  }, [api, call, itemId, version]);

  async function attempt(work: () => Promise<Item | null>) {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await work();
      if (!result) {
        router.push('/admin/education');
        return;
      }
      if (result.id !== item?.id) {
        router.replace(`/admin/education/${result.id}`);
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

  /** Creates the item, or saves it with the version it was loaded with (If-Match). */
  const save = () => {
    const body = toBody(draft);
    if (!item) return call(() => api.POST('/api/v1/admin/education', { body }));
    return call(() =>
      api.PUT('/api/v1/admin/education/{id}', {
        params: { path: { id: item.id }, header: { 'If-Match': `"${item.version}"` } },
        body,
      }),
    );
  };

  const transition = (action: EducationAction, comment?: string) =>
    attempt(async () => {
      // Submitting, and a reviewer's publishing, send what is on the screen: save first.
      const saveFirst = action === 'SUBMIT' || (action === 'PUBLISH' && editable);
      const current = saveFirst ? await save() : item!;
      return call(() =>
        api.POST('/api/v1/admin/education/{id}/transitions', {
          params: { path: { id: current.id } },
          body: { action, ...(comment ? { comment } : {}) },
        }),
      );
    });

  async function addFile(event: ChangeEvent<HTMLInputElement>, target: 'cover' | 'file') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const stored = await upload(file);
      if (target === 'cover') set({ cover: stored });
      else set({ files: [...draft.files, stored] });
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(false);
    }
  }

  const text = draft.text[lang];
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const linked = LINKED.includes(draft.type);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/education" className={link}>
          {t('education.admin.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">
          {item ? e('editTitle') : e('newTitle')}
        </h1>
        {item && (
          <p className="mt-2 text-text-muted" data-testid="education-status">
            {t(`education.admin.statuses.${item.status}`)}
          </p>
        )}
      </div>
      {!editable && <Alert>{e('readOnly')}</Alert>}
      {PRIVATE.includes(draft.type) && <Alert tone="warning">{e('privacy')}</Alert>}

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void attempt(save);
        }}
      >
        <fieldset disabled={!editable || pending} className="flex flex-col gap-6">
          <SelectField
            label={t('education.admin.type')}
            hint={item ? e('typeFixed') : undefined}
            className="max-w-sm"
            value={draft.type}
            disabled={item !== null}
            onChange={(event) => set({ type: event.target.value as EducationType })}
            options={EDUCATION_TYPES.map((value) => ({
              value,
              label: t(`education.types.${value}`),
            }))}
          />

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
            <MarkdownEditor
              key={`${lang}:${item?.id ?? 'new'}`}
              label={WRITTEN.includes(draft.type) ? e('text') : e('description')}
              initial={text.description}
              onChange={(description) => setText({ description })}
              lang={lang}
              disabled={!editable || pending}
            />
            <TextField
              label={e('author')}
              hint={e('authorHint')}
              value={text.author}
              onChange={(event) => setText({ author: event.target.value })}
              maxLength={200}
              lang={lang}
              dir={dir}
            />
          </div>

          {linked && (
            <div className="flex flex-col gap-3">
              <TextField
                type="url"
                label={e('link')}
                hint={e('linkHint')}
                value={draft.link}
                onChange={(event) => set({ link: event.target.value })}
                dir="ltr"
                maxLength={500}
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={draft.pending && !draft.link.trim()}
                  disabled={!!draft.link.trim()}
                  onChange={(event) => set({ pending: event.target.checked })}
                />
                {e('pending')}
              </label>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label={e('level')}
              placeholder={t('education.levels.all')}
              value={draft.level}
              onChange={(event) => set({ level: event.target.value as EducationLevel | '' })}
              options={EDUCATION_LEVELS.map((value) => ({
                value,
                label: t(`education.levels.${value}`),
              }))}
            />
            <SelectField
              label={e('subspecialty')}
              placeholder={e('noSubspecialty')}
              value={draft.subspecialtyId}
              onChange={(event) => set({ subspecialtyId: event.target.value })}
              options={(reference?.subspecialties ?? []).map((s) => ({
                value: s.id,
                label: name(s),
              }))}
            />
            <TextField
              label={e('duration')}
              value={draft.duration}
              onChange={(event) => set({ duration: event.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
            />
            <TextField
              label={e('cme')}
              hint={e('cmeHint')}
              value={draft.cme}
              onChange={(event) => set({ cme: event.target.value.replace(/[^\d.]/g, '') })}
              inputMode="decimal"
              dir="ltr"
            />
            <TierFields
              label={e('tier')}
              typesLabel={e('types')}
              tier={draft.tier}
              typeIds={draft.typeIds}
              onChange={(tier, typeIds) => set({ tier, typeIds })}
            />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{e('cover')}</h2>
            {draft.cover ? (
              <div className="flex flex-wrap items-start gap-4">
                <StoredImage
                  fileId={draft.cover.id}
                  variant="thumb"
                  alt={draft.cover.originalName}
                  className="w-48 rounded-md border border-border"
                />
                <Button type="button" variant="secondary" onClick={() => set({ cover: null })}>
                  {e('removeCover')}
                </Button>
              </div>
            ) : (
              <p className="text-text-muted">{e('noCover')}</p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={coverId} className="font-semibold">
                {e('uploadCover')}
              </label>
              <input
                id={coverId}
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => void addFile(event, 'cover')}
                className="max-w-full text-sm"
              />
            </div>
          </section>

          {draft.type !== 'COURSE' && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">{e('files')}</h2>
              {draft.files.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {draft.files.map((file) => (
                    <li key={file.id} className="flex flex-wrap items-center gap-3">
                      <span>
                        {file.originalName} ({formatSize(file.sizeBytes, locale)})
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        aria-label={t('education.admin.editor.removeItem', {
                          name: file.originalName,
                        })}
                        onClick={() => set({ files: draft.files.filter((f) => f.id !== file.id) })}
                      >
                        {e('remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={fileId} className="font-semibold">
                  {e('addFile')}
                </label>
                <p id={`${fileId}-hint`} className="text-sm text-text-muted">
                  {e('filesHint')}
                </p>
                <input
                  id={fileId}
                  type="file"
                  accept=".pdf,.docx,.pptx"
                  aria-describedby={`${fileId}-hint`}
                  onChange={(event) => void addFile(event, 'file')}
                  className="max-w-full text-sm"
                />
              </div>
            </section>
          )}
          {uploading && <p role="status">{e('uploading')}</p>}

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{e('references')}</h2>
            {draft.references.map((ref, index) => {
              const change = (patch: Partial<typeof ref>) =>
                set({
                  references: draft.references.map((r, i) =>
                    i === index ? { ...r, ...patch } : r,
                  ),
                });
              return (
                <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <TextField
                    label={e('refTitle')}
                    value={ref.title}
                    onChange={(event) => change({ title: event.target.value })}
                    maxLength={300}
                  />
                  <TextField
                    label={e('refUrl')}
                    type="url"
                    dir="ltr"
                    value={ref.url}
                    onChange={(event) => change({ url: event.target.value })}
                    maxLength={500}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={t('education.admin.editor.removeItem', {
                      name: ref.title || e('refTitle'),
                    })}
                    onClick={() =>
                      set({ references: draft.references.filter((_, i) => i !== index) })
                    }
                  >
                    {e('remove')}
                  </Button>
                </div>
              );
            })}
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => set({ references: [...draft.references, { title: '', url: '' }] })}
              >
                {e('addReference')}
              </Button>
            </div>
          </section>
        </fieldset>

        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {saved && <Alert tone="success">{e('saved')}</Alert>}
        {editable && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={pending} disabled={uploading}>
              {e('save')}
            </Button>
            {item?.status === 'DRAFT' && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending || uploading}
                onClick={() => void transition('SUBMIT')}
              >
                {t('education.admin.actions.SUBMIT')}
              </Button>
            )}
          </div>
        )}
      </form>

      {item?.type === 'COURSE' && (
        <CourseLessons course={item} editable={editable} onSaved={setItem} />
      )}
      {!item && draft.type === 'COURSE' && (
        <p className="text-text-muted">{t('education.admin.lessons.saveFirst')}</p>
      )}

      {item && (
        <ReviewPanel
          status={item.status}
          everPublished={item.publishedAt !== null}
          publicHref={`/education/${encodeURIComponent(item.slug)}`}
          pending={pending}
          onAction={(action, comment) => void transition(action, comment)}
          onDelete={() =>
            void attempt(async () => {
              await call(() =>
                api.DELETE('/api/v1/admin/education/{id}', { params: { path: { id: item.id } } }),
              );
              return null;
            })
          }
        />
      )}
      <HistoryList history={history} />
    </div>
  );
}

/** The ordered lessons of a course: add, move up or down, remove, then save the order. */
function CourseLessons({
  course,
  editable,
  onSaved,
}: {
  course: Item;
  editable: boolean;
  onSaved: (course: Item) => void;
}) {
  const t = useTranslations();
  const l = (key: string, values?: Record<string, string>) =>
    t(`education.admin.lessons.${key}`, values);
  const locale = useLocale();
  const { api, call } = useAuth();
  const [candidates, setCandidates] = useState<ListItem[]>([]);
  const [lessonIds, setLessonIds] = useState(course.lessonIds);
  const [adding, setAdding] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/education', { params: { query: { pageSize: 100 } } }))
      .then((result) => active && setCandidates(result.items.filter((i) => i.type !== 'COURSE')))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  const titleOf = (id: string) => {
    const item = candidates.find((candidate) => candidate.id === id);
    if (!item) return id;
    const title =
      (locale === 'he' ? (item.titleHe ?? item.titleEn) : (item.titleEn ?? item.titleHe)) ?? '';
    return item.status === 'PUBLISHED' ? title : `${title} (${l('notPublished')})`;
  };
  const change = (next: string[]) => {
    setSaved(false);
    setLessonIds(next);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...lessonIds];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    change(next);
  };

  async function save() {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      onSaved(
        await call(() =>
          api.PUT('/api/v1/admin/education/{id}/lessons', {
            params: { path: { id: course.id } },
            body: { lessonIds },
          }),
        ),
      );
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="lessons-title"
      className="flex flex-col gap-4 rounded-md border border-border p-5"
    >
      <h2 id="lessons-title" className="text-xl font-semibold">
        {l('title')}
      </h2>
      {lessonIds.length === 0 ? (
        <p className="text-text-muted">{l('empty')}</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="admin-lessons">
          {lessonIds.map((id, index) => {
            const title = titleOf(id);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <span>
                  {index + 1}. {title}
                </span>
                {editable && (
                  <span className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={index === 0}
                      aria-label={l('up', { title })}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={index === lessonIds.length - 1}
                      aria-label={l('down', { title })}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={l('remove', { title })}
                      onClick={() => change(lessonIds.filter((lesson) => lesson !== id))}
                    >
                      ×
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {editable && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label={l('add')}
              placeholder={l('choose')}
              className="min-w-64 flex-1"
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
              options={candidates
                .filter((candidate) => !lessonIds.includes(candidate.id))
                .map((candidate) => ({ value: candidate.id, label: titleOf(candidate.id) }))}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!adding}
              onClick={() => {
                change([...lessonIds, adding]);
                setAdding('');
              }}
            >
              {l('addButton')}
            </Button>
          </div>
          <div>
            <Button type="button" pending={pending} onClick={() => void save()}>
              {l('save')}
            </Button>
          </div>
        </>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {saved && <Alert tone="success">{l('saved')}</Alert>}
    </section>
  );
}
