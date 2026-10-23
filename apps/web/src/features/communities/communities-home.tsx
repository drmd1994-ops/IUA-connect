'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { Link } from '@/i18n/navigation';
import { errorMessage, hasErrorDetail } from '@/lib/api-errors';
import { CommunitiesNav, PostCard, link, useCommunityName } from './community-parts';

type CommunityList = components['schemas']['CommunityListDto'];
type PostList = components['schemas']['PostListDto'];

/** Communities are for verified people (and staff); anyone else is told how to get there. */
export function CommunitiesFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('communities.list');
  return (
    <RequireSignIn>
      {(me) =>
        me.verified ||
        me.permissions.includes('communities.manage') ||
        me.permissions.includes('chat.moderate') ? (
          children
        ) : (
          <PageFrame>
            <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
            <Alert>{t('verifiedOnly')}</Alert>
            <Link href="/account/verification" className={link}>
              {t('verifyLink')}
            </Link>
          </PageFrame>
        )
      }
    </RequireSignIn>
  );
}

/** Every community, with how many posts and whether the reader follows it. */
export function CommunitiesHome() {
  return (
    <CommunitiesFrame>
      <Home />
    </CommunitiesFrame>
  );
}

function Home() {
  const t = useTranslations();
  const locale = useLocale();
  const name = useCommunityName();
  const { api, call } = useAuth();
  const [list, setList] = useState<CommunityList | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/communities'))
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  const l = (key: string) => t(`communities.list.${key}`);
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{l('title')}</h1>
        <p className="mt-2 text-text-muted">{l('intro')}</p>
        <p className="mt-1 text-sm text-text-muted">{l('staffNote')}</p>
      </div>
      <CommunitiesNav />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="communities-list">
          {list.items.map((community) => {
            const description = locale === 'he' ? community.descriptionHe : community.descriptionEn;
            return (
              <li key={community.id}>
                <article className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-5">
                  <h2 className="text-lg font-semibold">
                    <Link href={`/communities/${community.slug}`} className={link}>
                      {name(community)}
                    </Link>
                  </h2>
                  {description && <p className="text-text-muted">{description}</p>}
                  <p className="mt-auto flex flex-wrap gap-2 text-sm text-text-muted">
                    <span>{t('communities.list.posts', { count: community.postCount })}</span>
                    {community.following && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-900">
                        {l('following')}
                      </span>
                    )}
                    {community.moderating && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold">
                        {l('moderating')}
                      </span>
                    )}
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </PageFrame>
  );
}

/** New posts from the communities the reader follows, or the posts they saved. */
export function PostFeed({ which }: { which: 'following' | 'saved' }) {
  return (
    <CommunitiesFrame>
      <Feed which={which} />
    </CommunitiesFrame>
  );
}

function Feed({ which }: { which: 'following' | 'saved' }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [page, setPage] = useState(1);
  const [list, setList] = useState<PostList | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    const params = { params: { query: { page } } };
    call(() =>
      which === 'following'
        ? api.GET('/api/v1/communities/feed', params)
        : api.GET('/api/v1/communities/bookmarks', params),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, which, page]);

  const l = (key: string) => t(`communities.list.${key}`);
  const notVerified = hasErrorDetail(error, 'membersOnly');
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">
          {which === 'following' ? l('feed') : l('bookmarks')}
        </h1>
      </div>
      <CommunitiesNav />
      {error !== null && !notVerified && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && (
        <p className="text-text-muted">
          {which === 'following' ? l('feedEmpty') : l('bookmarksEmpty')}
        </p>
      )}
      {list && list.items.length > 0 && (
        <ul className="flex flex-col gap-4" data-testid="feed">
          {list.items.map((post) => (
            <li key={post.id}>
              <PostCard post={post} showCommunity />
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}
