'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { CommunitiesFrame } from './communities-home';
import {
  PatientCheck,
  PostCard,
  checkTexts,
  link,
  refusedDetails,
  useCommunityName,
} from './community-parts';

type Schemas = components['schemas'];
type Community = Schemas['CommunityDto'];
type PostList = Schemas['PostListDto'];
type Kind = 'QUESTION' | 'DISCUSSION';
type Sort = 'active' | 'new';
type Uploaded = Schemas['FileDto'];

/** One community: its posts, following it, and writing in it (M25). */
export function CommunityPage({ slug }: { slug: string }) {
  return (
    <CommunitiesFrame>
      <Page slug={slug} />
    </CommunitiesFrame>
  );
}

function Page({ slug }: { slug: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  const name = useCommunityName();
  const { api, call } = useAuth();
  const [community, setCommunity] = useState<Community | null>(null);
  const [sort, setSort] = useState<Sort>('active');
  const [kind, setKind] = useState<Kind | ''>('');
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<PostList | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/communities/{slug}', { params: { path: { slug } } }))
      .then((result) => active && setCommunity(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, slug]);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/communities/{slug}/posts', {
        params: { path: { slug }, query: { sort, page, ...(kind ? { kind } : {}) } },
      }),
    )
      .then((result) => active && setPosts(result))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call, slug, sort, kind, page]);

  async function toggleFollow() {
    if (!community) return;
    setPending(true);
    try {
      const params = { params: { path: { slug } } };
      if (community.following) {
        await call(() => api.DELETE('/api/v1/communities/{slug}/follow', params));
      } else {
        await call(() => api.PUT('/api/v1/communities/{slug}/follow', params));
      }
      setCommunity({ ...community, following: !community.following });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const c = (key: string) => t(`communities.community.${key}`);
  const back = (
    <Link href="/communities" className={link}>
      {c('back')}
    </Link>
  );
  if (error !== null && !community) {
    return (
      <PageFrame>
        {back}
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND')
            ? t('content.common.notFoundTitle')
            : errorMessage(error, t)}
        </Alert>
      </PageFrame>
    );
  }
  if (!community) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }
  const description = locale === 'he' ? community.descriptionHe : community.descriptionEn;
  return (
    <PageFrame wide>
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">{name(community)}</h1>
          {description && <p className="mt-2 text-text-muted">{description}</p>}
          <p className="mt-1 text-sm text-text-muted">
            {c('moderators')}:{' '}
            {community.moderators.length
              ? community.moderators.map((m) => `${m.firstName} ${m.lastName}`).join(', ')
              : c('noModerators')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            variant="secondary"
            pending={pending}
            aria-pressed={community.following}
            onClick={() => void toggleFollow()}
          >
            {community.following ? c('unfollow') : c('follow')}
          </Button>
          <p className="text-xs text-text-muted">{c('followHint')}</p>
        </div>
      </div>
      {community.archived && <Alert tone="warning">{c('archived')}</Alert>}
      {community.banned && (
        <Alert tone="warning">
          {community.banned.until
            ? t('communities.community.bannedUntil', {
                reason: community.banned.reason,
                date: format.dateTime(new Date(community.banned.until), { dateStyle: 'long' }),
              })
            : t('communities.community.banned', { reason: community.banned.reason })}
        </Alert>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {community.canWrite &&
        (writing ? (
          <WriteForm slug={slug} onCancel={() => setWriting(false)} />
        ) : (
          <div>
            <Button type="button" onClick={() => setWriting(true)}>
              {c('write')}
            </Button>
          </div>
        ))}
      <div className="flex flex-wrap gap-4">
        <SelectField
          className="max-w-xs"
          label={c('sort')}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as Sort);
            setPage(1);
          }}
          options={[
            { value: 'active', label: c('sortActive') },
            { value: 'new', label: c('sortNew') },
          ]}
        />
        <SelectField
          className="max-w-xs"
          label={c('kind')}
          placeholder={c('allKinds')}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as Kind | '');
            setPage(1);
          }}
          options={(['QUESTION', 'DISCUSSION'] as const).map((value) => ({
            value,
            label: t(`communities.kinds.${value}`),
          }))}
        />
      </div>
      {posts && posts.items.length === 0 && <p className="text-text-muted">{c('empty')}</p>}
      {posts && posts.items.length > 0 && (
        <ul className="flex flex-col gap-4" data-testid="community-posts">
          {posts.items.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
      {posts && (
        <Pager page={page} pageSize={posts.pageSize} total={posts.total} onPage={setPage} />
      )}
      {community.canModerate && <Bans slug={slug} />}
    </PageFrame>
  );
}

/** A new post: kind, title, text and files, checked for a patient's details before sending. */
function WriteForm({ slug, onCancel }: { slug: string; onCancel: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const { api, call } = useAuth();
  const [kind, setKind] = useState<Kind>('DISCUSSION');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const found = checkTexts(title, body);
  const [refused, setRefused] = useState<ReturnType<typeof refusedDetails>>([]);

  async function addFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || files.length >= 3) return;
    setUploading(file.name);
    setError(null);
    try {
      const stored = await call(() =>
        api.POST('/api/v1/chat/attachments', {
          body: { file: '' },
          bodySerializer: () => {
            const form = new FormData();
            form.append('file', file);
            return form;
          },
        }),
      );
      setFiles((current) => [...current, stored]);
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(null);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (found.length) return;
    setPending(true);
    setError(null);
    setRefused([]);
    try {
      const post = await call(() =>
        api.POST('/api/v1/communities/{slug}/posts', {
          params: { path: { slug } },
          body: {
            kind,
            title: title.trim(),
            body: body.trim(),
            fileIds: files.map((f) => f.id),
            mentions: [],
          },
        }),
      );
      router.push(`/communities/${slug}/${post.id}`);
    } catch (caught) {
      const details = refusedDetails(caught);
      if (details.length) setRefused(details);
      else setError(caught);
    } finally {
      setPending(false);
    }
  }

  const w = (key: string) => t(`communities.write.${key}`);
  return (
    <form
      noValidate
      onSubmit={(event) => void send(event)}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
      aria-labelledby="write-title"
    >
      <h2 id="write-title" className="text-xl font-semibold">
        {w('title')}
      </h2>
      <SelectField
        className="max-w-xs"
        label={w('kind')}
        value={kind}
        onChange={(event) => setKind(event.target.value as Kind)}
        options={(['DISCUSSION', 'QUESTION'] as const).map((value) => ({
          value,
          label: t(`communities.kinds.${value}`),
        }))}
      />
      <TextField
        label={w('titleLabel')}
        value={title}
        maxLength={200}
        dir="auto"
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextareaField
        label={w('body')}
        value={body}
        maxLength={10000}
        rows={6}
        dir="auto"
        onChange={(event) => setBody(event.target.value)}
      />
      <PatientCheck found={found.length ? found : refused} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="post-file" className="font-semibold">
          {w('files')}
        </label>
        <p id="post-file-hint" className="text-sm text-text-muted">
          {w('filesHint')}
        </p>
        <input
          id="post-file"
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          aria-describedby="post-file-hint"
          disabled={files.length >= 3 || uploading !== null}
          onChange={(event) => void addFile(event)}
          className="max-w-full text-sm"
        />
        {uploading && <p role="status">{t('communities.write.uploading', { name: uploading })}</p>}
        {files.length > 0 && (
          <ul className="flex flex-col gap-1">
            {files.map((file) => (
              <li key={file.id} className="flex items-center gap-3">
                <span>{file.originalName}</span>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setFiles((current) => current.filter((f) => f.id !== file.id))}
                >
                  {t('communities.write.removeFile', { name: file.originalName })}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          pending={pending}
          disabled={!title.trim() || !body.trim() || found.length > 0 || uploading !== null}
        >
          {w('send')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('communities.post.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** The people a moderator stopped from writing here, and lifting it. */
function Bans({ slug }: { slug: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const { api, call } = useAuth();
  const [bans, setBans] = useState<Schemas['BanListDto']['items'] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/communities/{slug}/bans', { params: { path: { slug } } }))
      .then((result) => active && setBans(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call, slug, version]);

  if (!bans) return null;
  return (
    <section aria-labelledby="community-bans" className="flex flex-col gap-2">
      <h2 id="community-bans" className="text-xl font-semibold">
        {t('communities.community.bans')}
      </h2>
      {bans.length === 0 && <p className="text-text-muted">{t('communities.community.noBans')}</p>}
      <ul className="flex flex-col gap-2">
        {bans.map((ban) => {
          const who = `${ban.person.firstName} ${ban.person.lastName}`;
          return (
            <li key={ban.person.id} className="flex flex-wrap items-center gap-3">
              <span>
                {who} · {ban.reason}
                {ban.until && ` · ${format.dateTime(new Date(ban.until), { dateStyle: 'medium' })}`}
              </span>
              <Button
                type="button"
                variant="link"
                onClick={() =>
                  void call(() =>
                    api.DELETE('/api/v1/communities/{slug}/bans/{userId}', {
                      params: { path: { slug, userId: ban.person.id } },
                    }),
                  ).then(() => setVersion((v) => v + 1))
                }
              >
                {t('communities.community.liftBan', { name: who })}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
