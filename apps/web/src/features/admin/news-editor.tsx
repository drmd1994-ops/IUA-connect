'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage, type UploadedFile, formatSize, useUpload } from '@/features/content/files';
import { Markdown } from '@/features/content/markdown';
import { useLocalName } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { fromIsraelLocal, toIsraelLocal } from '@/lib/israel-time';
import { MarkdownEditor } from './markdown-editor';
import { OwnerField, OwnerLine, PLATFORM, canOn, firstOwner, ownerInput } from './owners';
import { type Tier, TierFields } from './tier-fields';

type Schemas = components['schemas'];
type Item = Schemas['AdminNewsDto'];
type Category = Schemas['NewsCategoryListDto']['items'][number];
type History = Schemas['NewsHistoryDto']['items'];
type Action = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'SCHEDULE' | 'UNSCHEDULE' | 'ARCHIVE';
type Lang = 'he' | 'en';

interface Text {
  title: string;
  summary: string;
  body: string;
  author: string;
}
interface Draft {
  slug: string;
  categoryId: string;
  tier: Tier;
  typeIds: string[];
  image: UploadedFile | null;
  attachments: UploadedFile[];
  tags: string;
  references: { title: string; url: string }[];
  text: Record<Lang, Text>;
}

const LANGS: Lang[] = ['he', 'en'];
const EMPTY_TEXT: Text = { title: '', summary: '', body: '', author: '' };
const link = 'font-semibold text-primary underline underline-offset-4';

function toDraft(item: Item | null): Draft {
  const text = (lang: Lang): Text => {
    const t = item?.translations[lang];
    return t
      ? { title: t.title, summary: t.summary ?? '', body: t.body, author: t.author ?? '' }
      : EMPTY_TEXT;
  };
  return {
    slug: item?.slug ?? '',
    categoryId: item?.categoryId ?? '',
    tier: item?.accessTier ?? 'PUBLIC',
    typeIds: item?.typeIds ?? [],
    image: item?.featuredImage ?? null,
    attachments: item?.attachments ?? [],
    tags: item?.tags.join(', ') ?? '',
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
      body: t.body,
      ...(t.summary.trim() ? { summary: t.summary } : {}),
      ...(t.author.trim() ? { author: t.author } : {}),
    };
  };
  return {
    ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
    categoryId: draft.categoryId || null,
    accessTier: draft.tier,
    typeIds: draft.tier === 'TYPES' ? draft.typeIds : [],
    featuredImageFileId: draft.image?.id ?? null,
    attachmentFileIds: draft.attachments.map((file) => file.id),
    tags: draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    references: draft.references.filter((r) => r.title.trim() && r.url.trim()),
    translations: { he: translation('he'), en: translation('en') },
  };
}

/** Loads an item (or starts a new one) and shows the editor. */
export function NewsEditor({ id }: { id: string | null }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    call(() => api.GET('/api/v1/admin/news/{id}', { params: { path: { id } } }))
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  if (error !== null) return <Alert tone="error">{errorMessage(error, t)}</Alert>;
  if (id && !item) return <p role="status">{t('membership.common.loading')}</p>;
  // A different item (after saving a new one, or opening a revision) starts a fresh form.
  return <EditorForm key={item?.id ?? 'new'} initial={item} />;
}

function EditorForm({ initial }: { initial: Item | null }) {
  const t = useTranslations();
  const pageLocale = useLocale() as Lang;
  const name = useLocalName();
  const router = useRouter();
  const upload = useUpload();
  const { api, call, me } = useAuth();
  const [item, setItem] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [lang, setLang] = useState<Lang>('he');
  const [preview, setPreview] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const tabsId = useId();
  const editable = !item || item.status === 'DRAFT';
  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setText = (patch: Partial<Text>) =>
    set({ text: { ...draft.text, [lang]: { ...draft.text[lang], ...patch } } });
  // Whose the item is (M16): chosen when it is created, and fixed from then on.
  const [owner, setOwner] = useState(() =>
    initial ? (initial.organisation?.id ?? PLATFORM) : firstOwner(me, 'news.create'),
  );
  const chooseOwner = (value: string) => {
    setOwner(value);
    // The platform has no members, and each owner has its own membership types.
    set({
      tier: value === PLATFORM && draft.tier === 'MEMBERS' ? 'VERIFIED' : draft.tier,
      typeIds: [],
    });
  };

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/news/categories'))
      .then((result) => active && setCategories(result.items.filter((c) => c.active)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);

  /** Creates the item, or saves the draft with the version it was loaded with (If-Match). */
  async function save(): Promise<Item> {
    const body = toBody(draft);
    if (!item) {
      return call(() =>
        api.POST('/api/v1/admin/news', {
          body: { ...body, ...ownerInput(me, 'news.create', owner) },
        }),
      );
    }
    return call(() =>
      api.PUT('/api/v1/admin/news/{id}', {
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
        router.push('/admin/news');
        return;
      }
      if (result.id !== item?.id) {
        // A new item, a new revision, or a revision that was published onto its live item.
        router.replace(`/admin/news/${result.id}`);
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

  const transition = (action: Action, extra: { comment?: string; publishAt?: string } = {}) =>
    attempt(async () => {
      // Submitting sends what is on the screen: save first.
      const current = action === 'SUBMIT' ? await save() : item!;
      return call(() =>
        api.POST('/api/v1/admin/news/{id}/transitions', {
          params: { path: { id: current.id } },
          body: { action, ...extra },
        }),
      );
    });

  async function addFile(event: ChangeEvent<HTMLInputElement>, target: 'image' | 'attachment') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const stored = await upload(file);
      if (target === 'image') set({ image: stored });
      else set({ attachments: [...draft.attachments, stored] });
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(false);
    }
  }

  const text = draft.text[lang];
  const e = (key: string) => t(`content.adminNews.editor.${key}`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/news" className={link}>
          {t('content.adminNews.categories.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">
          {item ? e('editTitle') : e('newTitle')}
        </h1>
        {item && (
          <p className="mt-2 text-text-muted" data-testid="news-status">
            {t(`content.adminNews.statuses.${item.status}`)}
            {item.revisionOfId && ` · ${t('content.adminNews.revisionOf')}`}
          </p>
        )}
      </div>
      {!editable && <Alert>{e('readOnly')}</Alert>}

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void attempt(save);
        }}
      >
        <fieldset disabled={!editable || pending} className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <Button type="button" variant="secondary" onClick={() => setPreview((v) => !v)}>
              {preview ? e('showEditor') : e('showPreview')}
            </Button>
          </div>

          <div
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-${lang}`}
            className="flex flex-col gap-5"
          >
            {preview ? (
              <div
                className="rounded-md border border-border p-5"
                lang={lang}
                dir={lang === 'he' ? 'rtl' : 'ltr'}
                data-testid="news-preview"
              >
                {text.title.trim() ? (
                  <>
                    <h2 className="text-3xl font-semibold text-brand-900">{text.title}</h2>
                    {text.summary && <p className="mt-4 text-lg text-text-muted">{text.summary}</p>}
                    <Markdown>{text.body}</Markdown>
                  </>
                ) : (
                  <p className="text-text-muted">{e('previewEmpty')}</p>
                )}
              </div>
            ) : (
              <>
                <TextField
                  label={e('titleLabel')}
                  value={text.title}
                  onChange={(event) => setText({ title: event.target.value })}
                  maxLength={300}
                  lang={lang}
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                />
                <TextareaField
                  label={e('summary')}
                  hint={e('summaryHint')}
                  value={text.summary}
                  onChange={(event) => setText({ summary: event.target.value })}
                  maxLength={1000}
                  rows={2}
                  lang={lang}
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                />
                {/* One editor per language and per loaded version, so tabs keep their own text. */}
                <MarkdownEditor
                  key={`${lang}:${item?.id ?? 'new'}`}
                  label={e('body')}
                  initial={text.body}
                  onChange={(body) => setText({ body })}
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
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                />
              </>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label={e('category')}
              placeholder={e('noCategory')}
              value={draft.categoryId}
              onChange={(event) => set({ categoryId: event.target.value })}
              options={categories.map((c) => ({ value: c.id, label: name(c) }))}
            />
            <TextField
              label={e('tags')}
              hint={e('tagsHint')}
              value={draft.tags}
              onChange={(event) => set({ tags: event.target.value })}
            />
            <TextField
              label={e('slug')}
              hint={e('slugHint')}
              value={draft.slug}
              onChange={(event) => set({ slug: event.target.value })}
              maxLength={120}
            />
            {item ? (
              <OwnerLine permission="news.create" organisation={item.organisation} />
            ) : (
              <OwnerField permission="news.create" value={owner} onChange={chooseOwner} />
            )}
            <TierFields
              label={e('tier')}
              typesLabel={e('types')}
              tier={draft.tier}
              typeIds={draft.typeIds}
              owner={owner === PLATFORM ? null : owner}
              onChange={(tier, typeIds) => set({ tier, typeIds })}
            />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{e('featuredImage')}</h2>
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
            <FilePicker
              label={e('uploadImage')}
              accept="image/jpeg,image/png"
              onChange={(event) => void addFile(event, 'image')}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{e('attachments')}</h2>
            {draft.attachments.length > 0 && (
              <ul className="flex flex-col gap-2">
                {draft.attachments.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-3">
                    <span>
                      {file.originalName} ({formatSize(file.sizeBytes, pageLocale)})
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      aria-label={t('content.adminNews.editor.removeItem', {
                        name: file.originalName,
                      })}
                      onClick={() =>
                        set({ attachments: draft.attachments.filter((f) => f.id !== file.id) })
                      }
                    >
                      {e('remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <FilePicker
              label={e('addAttachment')}
              hint={e('attachmentHint')}
              accept=".pdf,.docx,.pptx"
              onChange={(event) => void addFile(event, 'attachment')}
            />
          </section>
          {uploading && <p role="status">{e('uploading')}</p>}

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{e('references')}</h2>
            {draft.references.map((reference, index) => {
              const change = (patch: Partial<typeof reference>) =>
                set({
                  references: draft.references.map((r, i) =>
                    i === index ? { ...r, ...patch } : r,
                  ),
                });
              return (
                <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <TextField
                    label={e('refTitle')}
                    value={reference.title}
                    onChange={(event) => change({ title: event.target.value })}
                    maxLength={300}
                  />
                  <TextField
                    label={e('refUrl')}
                    type="url"
                    dir="ltr"
                    value={reference.url}
                    onChange={(event) => change({ url: event.target.value })}
                    maxLength={500}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={t('content.adminNews.editor.removeItem', {
                      name: reference.title || e('refTitle'),
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
            <Button
              type="button"
              variant="secondary"
              disabled={pending || uploading}
              onClick={() => void transition('SUBMIT')}
            >
              {t('content.adminNews.actions.SUBMIT')}
            </Button>
          </div>
        )}
      </form>

      {item && (
        <ReviewPanel
          item={item}
          pending={pending}
          onTransition={(action, extra) => void transition(action, extra)}
          onRevise={() =>
            void attempt(() =>
              call(() =>
                api.POST('/api/v1/admin/news/{id}/revision', {
                  params: { path: { id: item.id } },
                }),
              ),
            )
          }
          onDelete={() =>
            void attempt(async () => {
              await call(() =>
                api.DELETE('/api/v1/admin/news/{id}', { params: { path: { id: item.id } } }),
              );
              return null;
            })
          }
        />
      )}
      {item && <HistoryList id={item.revisionOfId ?? item.id} version={item.version} />}
    </div>
  );
}

function FilePicker({
  label,
  hint,
  accept,
  onChange,
}: {
  label: string;
  hint?: string;
  accept: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        type="file"
        accept={accept}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={onChange}
        className="max-w-full text-sm"
      />
    </div>
  );
}

function ReviewPanel({
  item,
  pending,
  onTransition,
  onRevise,
  onDelete,
}: {
  item: Item;
  pending: boolean;
  onTransition: (action: Action, extra?: { comment?: string; publishAt?: string }) => void;
  onRevise: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('content.adminNews.actions');
  const format = useFormatter();
  const { me } = useAuth();
  const [comment, setComment] = useState('');
  // Default: an hour from now, in Israel time.
  const [publishAt, setPublishAt] = useState(() => toIsraelLocal(new Date(Date.now() + 3_600_000)));
  // What the person may do for this item's owner, not what they may do somewhere else.
  const can = (permission: string) => canOn(me, permission, item.organisation?.id ?? null);
  const reviewer = can('news.review');
  const publisher = reviewer && can('news.publish');
  const isRevision = item.revisionOfId !== null;
  const when = fromIsraelLocal(publishAt);

  const actions = [
    item.status === 'IN_REVIEW' && reviewer,
    item.status === 'SCHEDULED',
    item.status === 'PUBLISHED',
    item.status === 'DRAFT' && !isRevision && !item.publishedAt,
  ];
  if (!actions.some(Boolean)) return null;

  return (
    <section
      aria-labelledby="review-title"
      className="flex flex-col gap-4 rounded-md border border-border p-5"
    >
      <h2 id="review-title" className="text-xl font-semibold">
        {t('title')}
      </h2>

      {item.status === 'IN_REVIEW' && reviewer && (
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
              onClick={() => onTransition('SEND_BACK', { comment: comment.trim() })}
            >
              {t('SEND_BACK')}
            </Button>
            {publisher && (
              <Button type="button" disabled={pending} onClick={() => onTransition('PUBLISH')}>
                {t('PUBLISH')}
              </Button>
            )}
          </div>
          {publisher && !isRevision && (
            <div className="flex flex-wrap items-end gap-3">
              <TextField
                type="datetime-local"
                label={t('publishAt')}
                hint={t('publishAtHint')}
                value={publishAt}
                onChange={(event) => setPublishAt(event.target.value)}
                dir="ltr"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !when}
                onClick={() => when && onTransition('SCHEDULE', { publishAt: when.toISOString() })}
              >
                {t('SCHEDULE')}
              </Button>
            </div>
          )}
        </>
      )}

      {item.status === 'SCHEDULED' && (
        <>
          {item.publishAt && (
            <p data-testid="scheduled-for">
              {t('scheduledFor', {
                when: format.dateTime(new Date(item.publishAt), {
                  dateStyle: 'long',
                  timeStyle: 'short',
                  timeZone: 'Asia/Jerusalem',
                }),
              })}
            </p>
          )}
          {reviewer && (
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onTransition('UNSCHEDULE')}
              >
                {t('UNSCHEDULE')}
              </Button>
            </div>
          )}
        </>
      )}

      {item.status === 'PUBLISHED' && (
        <div className="flex flex-wrap items-center gap-4">
          {item.slug && (
            <Link href={`/news/${encodeURIComponent(item.slug)}`} className={link}>
              {t('viewPublic')}
            </Link>
          )}
          {item.revisionId ? (
            <Link href={`/admin/news/${item.revisionId}`} className={link}>
              {t('openRevision')}
            </Link>
          ) : (
            <Button type="button" variant="secondary" disabled={pending} onClick={onRevise}>
              {t('revise')}
            </Button>
          )}
          {can('news.publish') && (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => onTransition('ARCHIVE')}
            >
              {t('ARCHIVE')}
            </Button>
          )}
        </div>
      )}

      {item.status === 'DRAFT' && !isRevision && !item.publishedAt && (
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
  const t = useTranslations('content.adminNews');
  const format = useFormatter();
  const { api, call } = useAuth();
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/news/{id}/history', { params: { path: { id } } }))
      .then((result) => active && setHistory(result.items))
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
    // Reloaded when the item changes (its version increases on every change).
  }, [api, call, id, version]);

  if (!history) return null;
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="text-xl font-semibold">
        {t('history.title')}
      </h2>
      {history.length === 0 ? (
        <p className="mt-3 text-text-muted">{t('history.empty')}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2 text-sm" data-testid="news-history">
          {history.map((entry) => (
            <li key={`${entry.at}:${entry.action}`}>
              <time dateTime={entry.at} className="text-text-muted">
                {format.dateTime(new Date(entry.at), { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
              {' · '}
              {t(`statuses.${entry.toStatus}`)}
              {entry.comment && ` · ${entry.comment}`}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
