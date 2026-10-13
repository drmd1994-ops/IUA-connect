'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import {
  GUIDELINE_STATUSES,
  type GuidelineStatus,
  StatusBadge,
} from '@/features/content/guidelines-list';
import { Pager } from '@/features/content/pager';
import { useDateFormat } from '@/features/membership/membership-page';
import { useLocalName, useReference } from '@/features/membership/reference';
import { errorMessage } from '@/lib/api-errors';
import { type Tier, TierFields, platformTier } from './tier-fields';

type Schemas = components['schemas'];
type List = Schemas['AdminGuidelineListDto'];
type Guideline = Schemas['AdminGuidelineDto'];

const PAGE_SIZE = 25;

interface VersionDraft {
  version: string;
  publishedOn: string;
  url: string;
  licenseNote: string;
}
const EMPTY_VERSION: VersionDraft = { version: '', publishedOn: '', url: '', licenseNote: '' };

const versionBody = (draft: VersionDraft) => ({
  version: draft.version.trim(),
  publishedOn: draft.publishedOn,
  // Entries added by hand carry a full date; only imported ones are "year only".
  yearOnly: false,
  ...(draft.url.trim() ? { url: draft.url.trim() } : {}),
  ...(draft.licenseNote.trim() ? { licenseNote: draft.licenseNote.trim() } : {}),
});

/** Guideline management: details and links only, never the documents themselves. */
export function GuidelinesAdminPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { dateOrYear } = useDateFormat();
  const { api, call } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  /** The guideline being edited, "new" for the empty form, or null for none. */
  const [open, setOpen] = useState<string | null>(null);
  const g = (key: string) => t(`content.adminGuidelines.${key}`);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/guidelines', {
        params: { query: { page, pageSize: PAGE_SIZE, ...(q ? { q } : {}) } },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, q, version]);

  const changed = () => setVersion((v) => v + 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{g('title')}</h1>
        <p className="mt-2 text-text-muted">{g('intro')}</p>
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
          label={g('search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {g('searchButton')}
        </Button>
        <Button type="button" onClick={() => setOpen('new')}>
          {g('add')}
        </Button>
      </form>

      {open === 'new' && (
        <GuidelineForm
          guideline={null}
          onClose={() => setOpen(null)}
          onChanged={changed}
          onCreated={(id) => setOpen(id)}
        />
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && <p className="text-text-muted">{g('empty')}</p>}
      {list && list.items.length > 0 && (
        <ul className="flex flex-col gap-3" data-testid="admin-guidelines">
          {list.items.map((item) => {
            const title =
              (locale === 'he' ? (item.titleHe ?? item.titleEn) : (item.titleEn ?? item.titleHe)) ??
              item.sourceOrg;
            return (
              <li key={item.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm text-text-muted">
                      {[
                        item.sourceOrg,
                        item.version,
                        item.publishedOn && dateOrYear(item.publishedOn, item.yearOnly),
                        t(`content.common.tiers.${item.accessTier}`),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={item.status} />
                    <Button
                      type="button"
                      variant="secondary"
                      aria-expanded={open === item.id}
                      aria-label={`${g('edit')}: ${title}`}
                      onClick={() => setOpen(open === item.id ? null : item.id)}
                    >
                      {g('edit')}
                    </Button>
                  </div>
                </div>
                {open === item.id && (
                  <LoadedForm id={item.id} onClose={() => setOpen(null)} onChanged={changed} />
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

function LoadedForm({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [guideline, setGuideline] = useState<Guideline | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/guidelines/{id}', { params: { path: { id } } }))
      .then((result) => active && setGuideline(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  if (error !== null) return <Alert tone="error">{errorMessage(error, t)}</Alert>;
  if (!guideline) return <p role="status">{t('membership.common.loading')}</p>;
  return <GuidelineForm guideline={guideline} onClose={onClose} onChanged={onChanged} />;
}

function GuidelineForm({
  guideline,
  onClose,
  onChanged,
  onCreated,
}: {
  guideline: Guideline | null;
  onClose: () => void;
  onChanged: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations();
  const name = useLocalName();
  const { dateOrYear } = useDateFormat();
  const reference = useReference();
  const { api, call } = useAuth();
  const [current, setCurrent] = useState(guideline);
  const [sourceOrg, setSourceOrg] = useState(guideline?.sourceOrg ?? '');
  const [officialUrl, setOfficialUrl] = useState(guideline?.officialUrl ?? '');
  const [evidenceLevel, setEvidenceLevel] = useState(guideline?.evidenceLevel ?? '');
  const [status, setStatus] = useState<GuidelineStatus>(guideline?.status ?? 'CURRENT');
  const [subspecialtyId, setSubspecialtyId] = useState(guideline?.subspecialtyId ?? '');
  const [tier, setTier] = useState<Tier>(guideline?.accessTier ?? 'PUBLIC');
  const [typeIds, setTypeIds] = useState(guideline?.typeIds ?? []);
  const [titleHe, setTitleHe] = useState(guideline?.translations.he?.title ?? '');
  const [titleEn, setTitleEn] = useState(guideline?.translations.en?.title ?? '');
  const [summaryHe, setSummaryHe] = useState(guideline?.translations.he?.summary ?? '');
  const [summaryEn, setSummaryEn] = useState(guideline?.translations.en?.summary ?? '');
  const [versionDraft, setVersionDraft] = useState(EMPTY_VERSION);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const g = (key: string) => t(`content.adminGuidelines.${key}`);
  const hasTitle = !!titleHe.trim() || !!titleEn.trim();
  const versionReady = !!versionDraft.version.trim() && !!versionDraft.publishedOn;

  const metadata = () => {
    const text = (title: string, summary: string) =>
      title.trim()
        ? { title: title.trim(), ...(summary.trim() ? { summary: summary.trim() } : {}) }
        : undefined;
    return {
      sourceOrg: sourceOrg.trim(),
      officialUrl: officialUrl.trim(),
      ...(evidenceLevel.trim() ? { evidenceLevel: evidenceLevel.trim() } : {}),
      status,
      subspecialtyId: subspecialtyId || null,
      accessTier: platformTier(tier),
      typeIds: tier === 'TYPES' ? typeIds : [],
      translations: { he: text(titleHe, summaryHe), en: text(titleEn, summaryEn) },
    };
  };

  async function attempt(request: () => Promise<Guideline | null>) {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await request();
      onChanged();
      if (!result) {
        onClose();
        return;
      }
      setCurrent(result);
      setSaved(true);
      if (!current) onCreated?.(result.id);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void attempt(() =>
      current
        ? call(() =>
            api.PUT('/api/v1/admin/guidelines/{id}', {
              params: { path: { id: current.id } },
              body: metadata(),
            }),
          )
        : call(() =>
            api.POST('/api/v1/admin/guidelines', {
              body: { ...metadata(), version: versionBody(versionDraft) },
            }),
          ),
    );
  }

  const versionFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={g('version')}
        hint={g('versionHint')}
        value={versionDraft.version}
        onChange={(e) => setVersionDraft({ ...versionDraft, version: e.target.value })}
        maxLength={60}
      />
      <TextField
        type="date"
        label={g('publishedOn')}
        value={versionDraft.publishedOn}
        onChange={(e) => setVersionDraft({ ...versionDraft, publishedOn: e.target.value })}
        dir="ltr"
      />
      <TextField
        type="url"
        label={g('versionUrl')}
        hint={g('versionUrlHint')}
        value={versionDraft.url}
        onChange={(e) => setVersionDraft({ ...versionDraft, url: e.target.value })}
        dir="ltr"
        maxLength={500}
      />
      <TextField
        label={g('licenseNote')}
        value={versionDraft.licenseNote}
        onChange={(e) => setVersionDraft({ ...versionDraft, licenseNote: e.target.value })}
        maxLength={500}
      />
    </div>
  );

  return (
    <div className="mt-4 flex flex-col gap-6 rounded-md border border-border p-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={g('sourceOrg')}
            value={sourceOrg}
            onChange={(e) => setSourceOrg(e.target.value)}
            maxLength={200}
          />
          <TextField
            type="url"
            label={g('officialUrl')}
            value={officialUrl}
            onChange={(e) => setOfficialUrl(e.target.value)}
            dir="ltr"
            maxLength={500}
          />
          <TextField
            label={g('titleHe')}
            value={titleHe}
            onChange={(e) => setTitleHe(e.target.value)}
            dir="rtl"
            lang="he"
            maxLength={300}
          />
          <TextField
            label={g('titleEn')}
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            dir="ltr"
            lang="en"
            maxLength={300}
          />
          <TextareaField
            label={g('summaryHe')}
            hint={g('summaryHint')}
            value={summaryHe}
            onChange={(e) => setSummaryHe(e.target.value)}
            dir="rtl"
            lang="he"
            maxLength={4000}
          />
          <TextareaField
            label={g('summaryEn')}
            hint={g('summaryHint')}
            value={summaryEn}
            onChange={(e) => setSummaryEn(e.target.value)}
            dir="ltr"
            lang="en"
            maxLength={4000}
          />
          <SelectField
            label={g('status')}
            value={status}
            onChange={(e) => setStatus(e.target.value as GuidelineStatus)}
            options={GUIDELINE_STATUSES.map((s) => ({
              value: s,
              label: t(`content.guidelines.statuses.${s}`),
            }))}
          />
          <TextField
            label={g('evidenceLevel')}
            hint={g('evidenceHint')}
            value={evidenceLevel}
            onChange={(e) => setEvidenceLevel(e.target.value)}
            maxLength={100}
          />
          <SelectField
            label={g('subspecialty')}
            placeholder={g('noSubspecialty')}
            value={subspecialtyId}
            onChange={(e) => setSubspecialtyId(e.target.value)}
            options={(reference?.subspecialties ?? []).map((s) => ({
              value: s.id,
              label: name(s),
            }))}
          />
          <TierFields
            label={g('tier')}
            typesLabel={g('types')}
            tier={tier}
            typeIds={typeIds}
            owner={null}
            onChange={(nextTier, nextTypes) => {
              setTier(nextTier);
              setTypeIds(nextTypes);
            }}
          />
        </div>
        {!current && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-lg font-semibold">{g('firstVersion')}</legend>
            {versionFields}
          </fieldset>
        )}
        {!hasTitle && <p className="text-sm text-text-muted">{g('titleRequired')}</p>}
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {saved && <Alert tone="success">{g('saved')}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            pending={pending}
            disabled={
              !sourceOrg.trim() || !officialUrl.trim() || !hasTitle || (!current && !versionReady)
            }
          >
            {g('save')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {g('cancel')}
          </Button>
          {current && (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() =>
                void attempt(async () => {
                  await call(() =>
                    api.DELETE('/api/v1/admin/guidelines/{id}', {
                      params: { path: { id: current.id } },
                    }),
                  );
                  return null;
                })
              }
            >
              {g('delete')}
            </Button>
          )}
        </div>
      </form>

      {current && (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">{g('versions')}</h3>
          <ul className="flex flex-col gap-2">
            {current.versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="font-semibold">{version.version}</span>
                  {' · '}
                  {dateOrYear(version.publishedOn, version.yearOnly)}
                </span>
                {current.versions.length > 1 && (
                  <Button
                    type="button"
                    variant="link"
                    disabled={pending}
                    onClick={() =>
                      void attempt(() =>
                        call(() =>
                          api.DELETE('/api/v1/admin/guidelines/{id}/versions/{versionId}', {
                            params: { path: { id: current.id, versionId: version.id } },
                          }),
                        ),
                      )
                    }
                  >
                    {t('content.adminGuidelines.removeVersion', { version: version.version })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void attempt(async () => {
                const result = await call(() =>
                  api.POST('/api/v1/admin/guidelines/{id}/versions', {
                    params: { path: { id: current.id } },
                    body: versionBody(versionDraft),
                  }),
                );
                setVersionDraft(EMPTY_VERSION);
                return result;
              });
            }}
          >
            {versionFields}
            <div>
              <Button type="submit" variant="secondary" disabled={pending || !versionReady}>
                {g('addVersion')}
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
