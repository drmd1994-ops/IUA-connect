'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Schemas = components['schemas'];
type List = Schemas['AdminBroadcastListDto'];
type Broadcast = Schemas['AdminBroadcastDto'];
type Status = Broadcast['status'];
type Lang = 'he' | 'en';

const PAGE_SIZE = 25;
const STATUSES: Status[] = ['DRAFT', 'PENDING_APPROVAL', 'SENT', 'REJECTED'];
const LANGS: Lang[] = ['he', 'en'];
const link = 'font-semibold text-primary underline underline-offset-4';

/** Every message to members with its state. "Waiting for approval" is where approvers start. */
export function BroadcastsPage() {
  const t = useTranslations();
  const a = (key: string, values?: Record<string, string | number>) =>
    t(`notifications.admin.${key}`, values);
  const locale = useLocale();
  const format = useFormatter();
  const audience = useAudienceLabel();
  const { api, call } = useAuth();
  const [status, setStatus] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/broadcasts', {
        params: { query: { page, pageSize: PAGE_SIZE, ...(status ? { status } : {}) } },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, status]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-brand-900">{a('title')}</h1>
          <Link
            href="/admin/broadcasts/new"
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
          >
            {a('new')}
          </Link>
        </div>
        <p className="mt-2 text-text-muted">{a('intro')}</p>
      </div>
      <SelectField
        label={a('status')}
        placeholder={a('allStatuses')}
        className="max-w-sm"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value as Status | '');
          setPage(1);
        }}
        options={STATUSES.map((value) => ({ value, label: a(`statuses.${value}`) }))}
      />

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {a('total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{a('empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="broadcasts-table">
                <thead className="bg-surface-muted">
                  <tr>
                    {(
                      ['colTitle', 'colStatus', 'colAudience', 'colAuthor', 'colUpdated'] as const
                    ).map((column) => (
                      <th key={column} scope="col" className="p-3 text-start">
                        {a(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => {
                    const text =
                      locale === 'he'
                        ? (item.translations.he ?? item.translations.en)
                        : (item.translations.en ?? item.translations.he);
                    return (
                      <tr key={item.id}>
                        <td className="p-3">
                          <Link href={`/admin/broadcasts/${item.id}`} className={link}>
                            {text?.title ?? a('untitled')}
                          </Link>
                        </td>
                        <td className="p-3">{a(`statuses.${item.status}`)}</td>
                        <td className="p-3">{audience(item.audience)}</td>
                        <td className="p-3">{item.author.name ?? a('unknownPerson')}</td>
                        <td className="p-3">
                          {format.dateTime(new Date(item.updatedAt), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

/** "All active members", or the names of the chosen membership types. */
function useAudienceLabel() {
  const t = useTranslations('notifications.admin.editor');
  const name = useLocalName();
  const reference = useReference();
  return (audience: Broadcast['audience']) =>
    audience.all
      ? t('audienceAll')
      : audience.typeIds
          .map((id) => name(reference?.types.find((type) => type.id === id)))
          .filter(Boolean)
          .join(', ');
}

interface Draft {
  all: boolean;
  typeIds: string[];
  text: Record<Lang, { title: string; body: string }>;
}

function toDraft(broadcast: Broadcast | null): Draft {
  const text = (lang: Lang) => ({
    title: broadcast?.translations[lang]?.title ?? '',
    body: broadcast?.translations[lang]?.body ?? '',
  });
  return {
    all: broadcast?.audience.all ?? true,
    typeIds: broadcast?.audience.typeIds ?? [],
    text: { he: text('he'), en: text('en') },
  };
}

function toBody(draft: Draft) {
  const text = (lang: Lang) => {
    const value = draft.text[lang];
    return value.title.trim() ? { title: value.title.trim(), body: value.body.trim() } : undefined;
  };
  return {
    audience: { all: draft.all, typeIds: draft.all ? [] : draft.typeIds },
    translations: { he: text('he'), en: text('en') },
  };
}

/** Loads a message (or starts a new one) and shows the editor with its approval panel. */
export function BroadcastEditor({ id }: { id: string | null }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    call(() => api.GET('/api/v1/admin/broadcasts/{id}', { params: { path: { id } } }))
      .then((result) => active && setBroadcast(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  if (error !== null) return <Alert tone="error">{errorMessage(error, t)}</Alert>;
  if (id && !broadcast) return <p role="status">{t('membership.common.loading')}</p>;
  return <BroadcastForm key={broadcast?.id ?? 'new'} initial={broadcast} />;
}

function BroadcastForm({ initial }: { initial: Broadcast | null }) {
  const t = useTranslations();
  const a = (key: string, values?: Record<string, string | number>) =>
    t(`notifications.admin.${key}`, values);
  const e = (key: string) => t(`notifications.admin.editor.${key}`);
  const format = useFormatter();
  const name = useLocalName();
  const reference = useReference();
  const router = useRouter();
  const { api, call, me } = useAuth();
  const [broadcast, setBroadcast] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [lang, setLang] = useState<Lang>('he');
  const [reason, setReason] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // One key per new message: a repeated click or a retried request creates nothing twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const tabsId = useId();

  const status = broadcast?.status ?? null;
  const mine = broadcast ? broadcast.mine : true;
  const editable = mine && (status === null || status === 'DRAFT' || status === 'REJECTED');
  const canApprove = !!me?.permissions.includes('broadcasts.approve');
  const broadcastId = broadcast?.id;
  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const text = draft.text[lang];
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const when = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  // The approver sees how many people the message would reach before deciding.
  useEffect(() => {
    if (!broadcastId || status !== 'PENDING_APPROVAL') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/broadcasts/{id}/audience', { params: { path: { id: broadcastId } } }),
    )
      .then((result) => active && setCount(result.count))
      .catch(() => active && setCount(null));
    return () => {
      active = false;
    };
  }, [api, call, broadcastId, status]);

  async function attempt(work: () => Promise<Broadcast | null>) {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await work();
      if (!result) {
        router.push('/admin/broadcasts');
        return;
      }
      if (result.id !== broadcast?.id) {
        router.replace(`/admin/broadcasts/${result.id}`);
        return;
      }
      setBroadcast(result);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const save = () => {
    const body = toBody(draft);
    if (!broadcast) {
      return call(() =>
        api.POST('/api/v1/admin/broadcasts', {
          params: { header: { 'Idempotency-Key': idempotencyKey } },
          body,
        }),
      );
    }
    return call(() =>
      api.PUT('/api/v1/admin/broadcasts/{id}', { params: { path: { id: broadcast.id } }, body }),
    );
  };
  const step = (action: 'submit' | 'approve') => (id: string) =>
    call(() => api.POST(`/api/v1/admin/broadcasts/{id}/${action}`, { params: { path: { id } } }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/broadcasts" className={link}>
          {a('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">
          {broadcast ? e('editTitle') : e('newTitle')}
        </h1>
        {broadcast && (
          <p className="mt-2 text-text-muted" data-testid="broadcast-status">
            {a(`statuses.${broadcast.status}`)}
          </p>
        )}
      </div>
      {broadcast && !mine && editableStatus(status) && <Alert>{e('notYours')}</Alert>}
      {broadcast && status === 'SENT' && <Alert>{e('readOnly')}</Alert>}
      {broadcast?.status === 'REJECTED' && broadcast.rejectReason && (
        <Alert tone="warning">
          {a('review.rejected', {
            name: broadcast.decidedBy?.name ?? a('unknownPerson'),
            reason: broadcast.rejectReason,
          })}
        </Alert>
      )}

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void attempt(save);
        }}
      >
        <fieldset disabled={!editable || pending} className="flex flex-col gap-6">
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
              onChange={(event) =>
                set({ text: { ...draft.text, [lang]: { ...text, title: event.target.value } } })
              }
              maxLength={200}
              lang={lang}
              dir={dir}
            />
            <TextareaField
              label={e('body')}
              hint={e('bodyHint')}
              value={text.body}
              onChange={(event) =>
                set({ text: { ...draft.text, [lang]: { ...text, body: event.target.value } } })
              }
              maxLength={5000}
              rows={8}
              lang={lang}
              dir={dir}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xl font-semibold">{e('audience')}</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${tabsId}-audience`}
                className="size-4"
                checked={draft.all}
                onChange={() => set({ all: true })}
              />
              {e('audienceAll')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${tabsId}-audience`}
                className="size-4"
                checked={!draft.all}
                onChange={() => set({ all: false })}
              />
              {e('audienceTypes')}
            </label>
            {!draft.all && (
              <fieldset className="ms-6 flex flex-col gap-2">
                <legend className="sr-only">{e('types')}</legend>
                {(reference?.types ?? []).map((type) => (
                  <label key={type.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={draft.typeIds.includes(type.id)}
                      onChange={() =>
                        set({
                          typeIds: draft.typeIds.includes(type.id)
                            ? draft.typeIds.filter((id) => id !== type.id)
                            : [...draft.typeIds, type.id],
                        })
                      }
                    />
                    {name(type)}
                  </label>
                ))}
              </fieldset>
            )}
          </fieldset>
        </fieldset>

        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {saved && <Alert tone="success">{e('saved')}</Alert>}
        {editable && (
          <>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" pending={pending}>
                {e('save')}
              </Button>
              {broadcast && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      // Submitting sends what is on the screen: save first.
                      void attempt(async () => step('submit')((await save()).id))
                    }
                  >
                    {e('submit')}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending}
                    onClick={() =>
                      void attempt(async () => {
                        await call(() =>
                          api.DELETE('/api/v1/admin/broadcasts/{id}', {
                            params: { path: { id: broadcast.id } },
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
            </div>
            <p className="text-sm text-text-muted">{e('submitHint')}</p>
          </>
        )}
      </form>

      {broadcast && status === 'PENDING_APPROVAL' && (
        <section
          aria-labelledby="broadcast-review"
          className="flex flex-col gap-4 rounded-md border border-border p-5"
        >
          <h2 id="broadcast-review" className="text-xl font-semibold">
            {a('review.title')}
          </h2>
          {broadcast.submittedAt && (
            <p className="text-text-muted">
              {a('review.waiting', { when: when(broadcast.submittedAt) })}
            </p>
          )}
          {count !== null && (
            <p data-testid="broadcast-audience">{a('review.audienceCount', { count })}</p>
          )}
          {mine ? (
            <Alert>{a('review.ownHint')}</Alert>
          ) : (
            canApprove && (
              <>
                <TextareaField
                  label={a('review.reason')}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  rows={2}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || !reason.trim()}
                    onClick={() =>
                      void attempt(() =>
                        call(() =>
                          api.POST('/api/v1/admin/broadcasts/{id}/reject', {
                            params: { path: { id: broadcast.id } },
                            body: { reason: reason.trim() },
                          }),
                        ),
                      )
                    }
                  >
                    {a('review.reject')}
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => void attempt(() => step('approve')(broadcast.id))}
                  >
                    {a('review.approve')}
                  </Button>
                </div>
                <p className="text-sm text-text-muted">{a('review.approveHint')}</p>
              </>
            )
          )}
        </section>
      )}

      {broadcast && status === 'SENT' && broadcast.sentAt && (
        <p data-testid="broadcast-sent">
          {a('review.sent', {
            when: when(broadcast.sentAt),
            count: broadcast.recipientCount ?? 0,
            name: broadcast.decidedBy?.name ?? a('unknownPerson'),
          })}
        </p>
      )}
    </div>
  );
}

const editableStatus = (status: Status | null) => status === 'DRAFT' || status === 'REJECTED';
