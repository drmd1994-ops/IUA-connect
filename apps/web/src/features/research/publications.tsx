'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api-errors';
import { link } from './research-parts';

type Schemas = components['schemas'];
type Publication = Schemas['PublicationDto'];
type Draft = Schemas['PublicationDraftListDto']['items'][number];
type Input = Schemas['PublicationInputDto'];

/** The editing form's fields, as typed (year and topics as text). */
interface FormState {
  id: string | null;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi: string;
  pmid: string;
  url: string;
  topics: string;
  hidden: boolean;
  source: Input['source'];
}

const EMPTY: FormState = {
  id: null,
  title: '',
  authors: '',
  journal: '',
  year: '',
  doi: '',
  pmid: '',
  url: '',
  topics: '',
  hidden: false,
  source: 'MANUAL',
};

function fromDraft(draft: Omit<Draft, 'saved'>, source: Input['source']): FormState {
  return {
    ...EMPTY,
    title: draft.title,
    authors: draft.authors,
    journal: draft.journal ?? '',
    year: draft.year ? String(draft.year) : '',
    doi: draft.doi ?? '',
    pmid: draft.pmid ?? '',
    url: draft.url ?? '',
    source,
  };
}

function fromPublication(p: Publication): FormState {
  return {
    ...fromDraft(p, p.source),
    id: p.id,
    topics: p.topics.join(', '),
    hidden: p.hidden,
  };
}

function toInput(form: FormState): Input {
  const year = Number.parseInt(form.year, 10);
  return {
    title: form.title.trim(),
    authors: form.authors.trim(),
    journal: form.journal.trim() || null,
    year: Number.isFinite(year) ? year : null,
    doi: form.doi.trim() || null,
    pmid: form.pmid.trim() || null,
    url: form.url.trim() || null,
    topics: form.topics
      .split(',')
      .map((topic) => topic.trim())
      .filter(Boolean),
    source: form.source,
    hidden: form.hidden,
  };
}

/** "Authors. Journal, Year." with the DOI and PubMed links. */
export function PublicationLine({ item }: { item: Publication | Draft }) {
  const t = useTranslations('research.publications');
  const where = [item.journal, item.year].filter(Boolean).join(', ');
  return (
    <>
      {item.authors && <p className="text-sm text-text">{item.authors}</p>}
      {where && <p className="text-sm text-text-muted">{where}</p>}
      <p className="flex flex-wrap gap-x-4 text-sm" dir="ltr">
        {item.doi && (
          <a
            href={`https://doi.org/${item.doi}`}
            className={link}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('doi')} {item.doi}
          </a>
        )}
        {item.pmid && (
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`}
            className={link}
            rel="noopener noreferrer"
            target="_blank"
          >
            PMID {item.pmid}
          </a>
        )}
        {item.url && !item.doi && !item.pmid && (
          <a href={item.url} className={link} rel="noopener noreferrer" target="_blank">
            {t('url')}
          </a>
        )}
      </p>
    </>
  );
}

/**
 * The reader's own publications on their profile page (M27): typed in, filled from PubMed by a
 * PubMed ID or DOI, or chosen from their ORCID record; in their own order, some hidden.
 */
export function PublicationsSection() {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Publication[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [mode, setMode] = useState<'none' | 'pubmed' | 'orcid'>('none');
  const [form, setForm] = useState<FormState | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/publications'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const close = () => {
    setMode('none');
    setForm(null);
    setDrafts(null);
    setLookupId('');
  };

  const lookup = (event: FormEvent) => {
    event.preventDefault();
    const value = lookupId.trim();
    if (!value) return;
    void run(async () => {
      const body = /^\d+$/.test(value) ? { pmid: value } : { doi: value };
      const result = await call(() => api.POST('/api/v1/me/publications/lookup', { body }));
      const first = result.items[0];
      if (first) setForm(fromDraft(first, 'PUBMED'));
    });
  };

  const openOrcid = () => {
    setForm(null);
    setMode('orcid');
    void run(async () => {
      const result = await call(() => api.GET('/api/v1/me/publications/orcid'));
      setDrafts(result.items);
    });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    void run(async () => {
      const body = toInput(form);
      if (form.id) {
        const id = form.id;
        const saved = await call(() =>
          api.PUT('/api/v1/me/publications/{id}', { params: { path: { id } }, body }),
        );
        setItems((current) => current && current.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        const saved = await call(() => api.POST('/api/v1/me/publications', { body }));
        setItems((current) => [...(current ?? []), saved]);
      }
      close();
    });
  };

  const remove = (item: Publication) =>
    void run(async () => {
      await call(() =>
        api.DELETE('/api/v1/me/publications/{id}', { params: { path: { id: item.id } } }),
      );
      setItems((current) => current && current.filter((p) => p.id !== item.id));
    });

  const move = (index: number, by: -1 | 1) => {
    if (!items) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    void run(async () => {
      const result = await call(() =>
        api.PUT('/api/v1/me/publications/order', { body: { ids: next.map((p) => p.id) } }),
      );
      setItems(result.items);
    });
  };

  const p = (key: string, values?: Record<string, string>) =>
    t(`research.publications.${key}`, values);
  const field = (key: Exclude<keyof FormState, 'id' | 'hidden' | 'source'>) => ({
    value: form?.[key] ?? '',
    onChange: (event: { target: { value: string } }) =>
      setForm((current) => current && { ...current, [key]: event.target.value }),
  });

  return (
    <section aria-labelledby="publications" className="flex flex-col gap-4">
      <h2 id="publications" className="text-2xl font-semibold">
        {p('title')}
      </h2>
      <p className="text-text-muted">{p('intro')}</p>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items && items.length === 0 && <p className="text-text-muted">{p('empty')}</p>}
      {items && items.length > 0 && (
        <ol className="flex flex-col gap-3" data-testid="my-publications">
          {items.map((item, index) => (
            <li key={item.id} className="flex flex-col gap-1 rounded-md border border-border p-4">
              <p className="font-semibold">
                {item.title}
                {item.hidden && (
                  <span className="ms-2 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                    {p('hiddenMark')}
                  </span>
                )}
              </p>
              <PublicationLine item={item} />
              <p className="text-xs text-text-muted">{p(`sources.${item.source}`)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || index === 0}
                  aria-label={p('up', { title: item.title })}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || index === items.length - 1}
                  aria-label={p('down', { title: item.title })}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setMode('none');
                    setDrafts(null);
                    setForm(fromPublication(item));
                  }}
                >
                  {p('edit')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => remove(item)}
                >
                  {p('remove')}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!form && mode === 'none' && (
        <div className="flex flex-wrap gap-3" role="group" aria-label={p('add')}>
          <Button type="button" variant="secondary" onClick={() => setForm(EMPTY)}>
            {p('byHand')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('pubmed')}>
            {p('fromPubmed')}
          </Button>
          <Button type="button" variant="secondary" onClick={openOrcid}>
            {p('fromOrcid')}
          </Button>
        </div>
      )}
      {mode === 'pubmed' && !form && (
        <form onSubmit={lookup} className="flex flex-wrap items-end gap-3" noValidate>
          <TextField
            className="min-w-56 flex-1"
            label={p('pubmedLabel')}
            hint={p('pubmedHint')}
            value={lookupId}
            maxLength={300}
            dir="ltr"
            onChange={(event) => setLookupId(event.target.value)}
          />
          <Button type="submit" pending={pending} disabled={!lookupId.trim()}>
            {p('find')}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {p('cancel')}
          </Button>
        </form>
      )}
      {mode === 'orcid' && !form && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">{p('orcidHint')}</p>
          {pending && <p role="status">{t('membership.common.loading')}</p>}
          {drafts && drafts.length === 0 && <p className="text-text-muted">{p('empty')}</p>}
          {drafts && drafts.length > 0 && (
            <ul className="flex flex-col gap-3" data-testid="orcid-works">
              {drafts.map((draft, index) => (
                <li
                  key={`${draft.doi ?? draft.pmid ?? draft.title}-${index}`}
                  className="flex flex-col gap-1 rounded-md border border-border p-4"
                >
                  <p className="font-semibold">{draft.title}</p>
                  <PublicationLine item={draft} />
                  <div className="pt-1">
                    {draft.saved ? (
                      <span className="text-sm text-text-muted">{p('already')}</span>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setForm(fromDraft(draft, 'ORCID'))}
                      >
                        {p('use')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button type="button" variant="secondary" onClick={close}>
              {p('cancel')}
            </Button>
          </div>
        </div>
      )}
      {form && (
        <form
          onSubmit={save}
          className="flex flex-col gap-4 rounded-md border border-border p-5"
          noValidate
          data-testid="publication-form"
        >
          <TextField label={p('titleLabel')} maxLength={500} required {...field('title')} />
          <TextField label={p('authors')} maxLength={2000} {...field('authors')} />
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <TextField label={p('journal')} maxLength={300} {...field('journal')} />
            <TextField label={p('year')} inputMode="numeric" maxLength={4} {...field('year')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={p('doi')} maxLength={200} dir="ltr" {...field('doi')} />
            <TextField
              label={p('pmid')}
              inputMode="numeric"
              maxLength={9}
              dir="ltr"
              {...field('pmid')}
            />
          </div>
          <TextField label={p('url')} type="url" maxLength={500} dir="ltr" {...field('url')} />
          <TextField label={p('topics')} maxLength={700} {...field('topics')} />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={form.hidden}
              onChange={(event) =>
                setForm((current) => current && { ...current, hidden: event.target.checked })
              }
            />
            {p('hidden')}
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={pending} disabled={!form.title.trim()}>
              {p('save')}
            </Button>
            <Button type="button" variant="secondary" onClick={close}>
              {p('cancel')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** A member's publications on their directory page, when they show their research interests. */
export function MemberPublications({ userId }: { userId: string }) {
  const t = useTranslations('research.publications');
  const { api, call } = useAuth();
  const [items, setItems] = useState<Publication[]>([]);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/members/{id}/publications', { params: { path: { id: userId } } }))
      .then((result) => active && setItems(result.items))
      // Not shown to members, or not reachable: the page simply has no publications section.
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [api, call, userId]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="member-publications">
      <h2 id="member-publications" className="text-xl font-semibold">
        {t('title')}
      </h2>
      <ol className="mt-2 flex flex-col gap-3" data-testid="member-publications">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1">
            <p className="font-semibold">{item.title}</p>
            <PublicationLine item={item} />
          </li>
        ))}
      </ol>
    </section>
  );
}
