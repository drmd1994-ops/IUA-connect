'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useLocalName } from '@/features/membership/reference';
import { BackToSection } from '@/features/organisations/organisation-page';
import type { Organisation } from '@/features/organisations/organisations';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { StoredImage } from './files';
import { Pager } from './pager';

type List = components['schemas']['PublicNewsListDto'];
type Category = components['schemas']['NewsCategoryListDto']['items'][number];

const PAGE_SIZE = 12;

/**
 * Public news list: the platform's and every organisation's, or one organisation's when named.
 * Signed-in people also see what their account and memberships open (the API decides).
 */
export function NewsList({ organisation }: { organisation?: Organisation }) {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const format = useFormatter();
  const name = useLocalName();
  const { api, call, status } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/news/categories'))
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);

  useEffect(() => {
    // Wait for the session to be restored, so members get their items on the first request.
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/news', {
        params: {
          query: {
            locale,
            page,
            pageSize: PAGE_SIZE,
            ...(category ? { category } : {}),
            ...(organisation ? { organisation: organisation.id } : {}),
          },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, locale, page, category, organisation]);

  return (
    <PageFrame wide>
      {organisation && <BackToSection organisation={organisation} />}
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">
          {organisation
            ? t('organisations.lists.newsTitle', { name: name(organisation) })
            : t('content.news.title')}
        </h1>
        {!organisation && <p className="mt-2 text-text-muted">{t('content.news.intro')}</p>}
      </div>
      {/* Always there, also before the categories arrive, so the list below doesn't jump. */}
      <SelectField
        className="max-w-xs"
        label={t('content.news.category')}
        placeholder={t('content.news.allCategories')}
        value={category}
        onChange={(event) => {
          setCategory(event.target.value);
          setPage(1);
        }}
        options={categories.map((c) => ({ value: c.key, label: name(c) }))}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && (
        <p className="text-text-muted">{t('content.news.empty')}</p>
      )}
      {list && list.items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="news-list">
          {list.items.map((item) => (
            <li key={item.slug}>
              <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
                {item.featuredImageFileId && (
                  <StoredImage
                    fileId={item.featuredImageFileId}
                    variant="thumb"
                    alt=""
                    className="aspect-video w-full object-cover"
                    placeholder
                  />
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="text-sm text-text-muted">
                    <time dateTime={item.date}>
                      {format.dateTime(new Date(item.date), { dateStyle: 'long' })}
                    </time>
                    {item.category && ` · ${name(item.category)}`}
                  </p>
                  <h2 className="text-lg font-semibold" lang={item.locale}>
                    <Link
                      href={`/news/${encodeURIComponent(item.slug)}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {item.title}
                    </Link>
                  </h2>
                  {item.summary && (
                    <p className="text-text-muted" lang={item.locale}>
                      {item.summary}
                    </p>
                  )}
                  {!organisation && (
                    <p className="text-sm text-text-muted" data-testid="item-owner">
                      {t('organisations.owner.from', {
                        name: item.organisation ? name(item.organisation) : t('common.app.name'),
                      })}
                    </p>
                  )}
                  {item.sourceUrl && (
                    <p className="text-sm text-text-muted">{t('content.news.sourceLabel')}</p>
                  )}
                  {item.accessTier !== 'PUBLIC' && (
                    <p className="mt-auto">
                      <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                        {t(
                          `content.common.tiers.${item.accessTier === 'VERIFIED' ? 'VERIFIED' : 'MEMBERS'}`,
                        )}
                      </span>
                    </p>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}
