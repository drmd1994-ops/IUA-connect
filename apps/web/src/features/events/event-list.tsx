'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { StoredImage } from '@/features/content/files';
import { Pager } from '@/features/content/pager';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { useEventTime } from './shared';

type List = components['schemas']['PublicEventListDto'];
type Category = components['schemas']['EventCategoryListDto']['items'][number];
type When = 'upcoming' | 'past';

const PAGE_SIZE = 12;
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** Public event list. Signed-in members also see what their membership opens (the API decides). */
export function EventList() {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const name = useLocalName();
  const { range } = useEventTime();
  const { api, call, status } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [when, setWhen] = useState<When>('upcoming');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/events/categories'))
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);

  useEffect(() => {
    // Wait for the session to be restored, so members get their events on the first request.
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/events', {
        params: {
          query: { locale, when, page, pageSize: PAGE_SIZE, ...(category ? { category } : {}) },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, locale, when, page, category]);

  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('events.list.title')}</h1>
        <p className="mt-2 text-text-muted">{t('events.list.intro')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t('events.list.show')}
          value={when}
          onChange={(event) => {
            setWhen(event.target.value as When);
            setPage(1);
          }}
          options={[
            { value: 'upcoming', label: t('events.list.upcoming') },
            { value: 'past', label: t('events.list.past') },
          ]}
        />
        {/* Always there, also before the categories arrive, so the list below doesn't jump. */}
        <SelectField
          label={t('events.list.category')}
          placeholder={t('events.list.allCategories')}
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          options={categories.map((c) => ({ value: c.key, label: name(c) }))}
        />
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && (
        <p className="text-text-muted">
          {t(when === 'upcoming' ? 'events.list.emptyUpcoming' : 'events.list.emptyPast')}
        </p>
      )}
      {list && list.items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="event-list">
          {list.items.map((item) => (
            <li key={item.slug}>
              <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
                {item.imageFileId && (
                  <StoredImage
                    fileId={item.imageFileId}
                    variant="thumb"
                    alt=""
                    className="aspect-video w-full object-cover"
                    placeholder
                  />
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="text-sm text-text-muted">
                    {range(item.startAt, item.endAt, item.timezone)}
                  </p>
                  <h2 className="text-lg font-semibold" lang={item.locale}>
                    <Link
                      href={`/events/${encodeURIComponent(item.slug)}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {item.title}
                    </Link>
                  </h2>
                  {item.locationName && <p className="text-sm">{item.locationName}</p>}
                  {item.summary && (
                    <p className="text-text-muted" lang={item.locale}>
                      {item.summary}
                    </p>
                  )}
                  <p className="mt-auto flex flex-wrap gap-2">
                    {item.cancelled && (
                      <span className={`${badge} bg-danger-100 text-danger-700`}>
                        {t('events.list.cancelled')}
                      </span>
                    )}
                    {item.category && (
                      <span className={`${badge} bg-surface-muted text-text-muted`}>
                        {name(item.category)}
                      </span>
                    )}
                    {item.cmeAvailable && (
                      <span className={`${badge} bg-success-100 text-success-700`}>
                        {t('events.list.cme')}
                      </span>
                    )}
                    {item.accessTier !== 'PUBLIC' && (
                      <span className={`${badge} bg-surface-muted text-text-muted`}>
                        {t('content.common.tiers.MEMBERS')}
                      </span>
                    )}
                  </p>
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
