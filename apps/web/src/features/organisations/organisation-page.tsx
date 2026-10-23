'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useEventTime } from '@/features/events/shared';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import {
  type Membership,
  type Organisation,
  sectionHref,
  useDescription,
  useMyMemberships,
  useOrganisation,
} from './organisations';

type Schemas = components['schemas'];
type NewsItem = Schemas['PublicNewsListDto']['items'][number];
type EventItem = Schemas['PublicEventListDto']['items'][number];

const link = 'font-semibold text-primary underline underline-offset-4';
/** How many of each the section's front page shows; the full lists are a link away. */
const FEW = 3;

/**
 * Loads an organisation by its address name and shows the page for it, or says that there is no
 * such organisation. Every page of a section starts here.
 */
export function WithOrganisation({
  slug,
  children,
}: {
  slug: string;
  children: (organisation: Organisation) => ReactNode;
}) {
  const t = useTranslations();
  const { organisation, error } = useOrganisation(slug);
  if (organisation) return <>{children(organisation)}</>;
  return (
    <PageFrame>
      {organisation === undefined && <p role="status">{t('membership.common.loading')}</p>}
      {organisation === null && error !== null && (
        <Alert tone="error">{errorMessage(error, t)}</Alert>
      )}
      {organisation === null && error === null && (
        <>
          <h1 className="text-3xl font-semibold text-brand-900">
            {t('organisations.section.notFound')}
          </h1>
          <Link href="/organisations" className={link}>
            {t('organisations.section.all')}
          </Link>
        </>
      )}
    </PageFrame>
  );
}

/** "Back to <organisation>", at the top of a page inside its section. */
export function BackToSection({ organisation }: { organisation: Organisation }) {
  const t = useTranslations('organisations.section');
  const name = useLocalName();
  return (
    <Link href={sectionHref(organisation.slug)} className={`${link} self-start text-sm`}>
      {t('back', { name: name(organisation) })}
    </Link>
  );
}

/** An organisation's section: who it is, the reader's membership, its news and events. (Its rooms closed in M25.) */
export function OrganisationPage({ slug }: { slug: string }) {
  return (
    <WithOrganisation slug={slug}>
      {(organisation) => <Section organisation={organisation} />}
    </WithOrganisation>
  );
}

function Section({ organisation }: { organisation: Organisation }) {
  const t = useTranslations('organisations.section');
  const name = useLocalName();
  const description = useDescription();
  const memberships = useMyMemberships();
  const membership = memberships?.find((item) => item.organisation.id === organisation.id);
  const about = description(organisation);

  return (
    <PageFrame wide>
      <div className="flex flex-col gap-2">
        <Link href="/organisations" className={`${link} self-start text-sm`}>
          {t('all')}
        </Link>
        <h1 className="text-3xl font-semibold text-brand-900">{name(organisation)}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="organisation-about" title={t('aboutTitle')}>
          {about ? (
            <p className="whitespace-pre-line" dir="auto">
              {about}
            </p>
          ) : (
            <p className="text-text-muted">{t('noDescription')}</p>
          )}
        </Panel>
        <MembershipPanel
          organisation={organisation}
          loading={memberships === undefined}
          membership={membership}
        />
        <NewsPanel organisation={organisation} />
        <EventsPanel organisation={organisation} />
      </div>
    </PageFrame>
  );
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      data-testid={id}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-6 shadow-card"
    >
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MembershipPanel({
  organisation,
  loading,
  membership,
}: {
  organisation: Organisation;
  loading: boolean;
  membership: Membership | undefined;
}) {
  const all = useTranslations();
  const t = useTranslations('organisations.section.membership');
  const name = useLocalName();
  const { status } = useAuth();
  return (
    <Panel id="organisation-membership" title={t('title')}>
      {loading && <p role="status">{all('membership.common.loading')}</p>}
      {status === 'signedOut' && (
        <>
          <p className="text-text-muted">{t('signedOut')}</p>
          <p>
            <Link href="/login" className={link}>
              {all('membership.common.signIn')}
            </Link>
          </p>
        </>
      )}
      {status === 'signedIn' && !loading && !membership && (
        <>
          <p>{t('none')}</p>
          <p>
            <Link href={sectionHref(organisation.slug, 'membership')} className={link}>
              {t('apply')}
            </Link>
          </p>
        </>
      )}
      {membership && (
        <>
          <p data-testid="organisation-membership-state">
            {t('state', {
              type: name(membership.type),
              status: all(`membership.membership.statuses.${membership.status}`),
            })}
          </p>
          <p className="flex flex-wrap gap-4">
            <Link href={sectionHref(organisation.slug, 'membership')} className={link}>
              {t('open')}
            </Link>
            {membership.status === 'ACTIVE' && (
              <Link href={sectionHref(organisation.slug, 'membership/card')} className={link}>
                {t('card')}
              </Link>
            )}
          </p>
        </>
      )}
    </Panel>
  );
}

function NewsPanel({ organisation }: { organisation: Organisation }) {
  const all = useTranslations();
  const t = useTranslations('organisations.section.news');
  const locale = useLocale() as 'he' | 'en';
  const format = useFormatter();
  const name = useLocalName();
  const { api, call, status } = useAuth();
  const [items, setItems] = useState<NewsItem[]>();

  useEffect(() => {
    // Wait for the session to be restored, so members get their items on the first request.
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/news', {
        params: { query: { locale, page: 1, pageSize: FEW, organisation: organisation.id } },
      }),
    )
      .then((result) => active && setItems(result.items))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [api, call, status, locale, organisation.id]);

  return (
    <Panel id="organisation-news" title={t('title')}>
      {!items && <p role="status">{all('membership.common.loading')}</p>}
      {items?.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/news/${encodeURIComponent(item.slug)}`}
                className={link}
                lang={item.locale}
              >
                {item.title}
              </Link>
              <p className="text-sm text-text-muted">
                <time dateTime={item.date}>
                  {format.dateTime(new Date(item.date), { dateStyle: 'long' })}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href={sectionHref(organisation.slug, 'news')} className={link}>
          {t('all', { name: name(organisation) })}
        </Link>
      </p>
    </Panel>
  );
}

function EventsPanel({ organisation }: { organisation: Organisation }) {
  const all = useTranslations();
  const t = useTranslations('organisations.section.events');
  const locale = useLocale() as 'he' | 'en';
  const name = useLocalName();
  const { range } = useEventTime();
  const { api, call, status } = useAuth();
  const [items, setItems] = useState<EventItem[]>();

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/events', {
        params: {
          query: {
            locale,
            when: 'upcoming',
            page: 1,
            pageSize: FEW,
            organisation: organisation.id,
          },
        },
      }),
    )
      .then((result) => active && setItems(result.items))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [api, call, status, locale, organisation.id]);

  return (
    <Panel id="organisation-events" title={t('title')}>
      {!items && <p role="status">{all('membership.common.loading')}</p>}
      {items?.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/events/${encodeURIComponent(item.slug)}`}
                className={link}
                lang={item.locale}
              >
                {item.title}
              </Link>
              <p className="text-sm text-text-muted">
                {range(item.startAt, item.endAt, item.timezone)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href={sectionHref(organisation.slug, 'events')} className={link}>
          {t('all', { name: name(organisation) })}
        </Link>
      </p>
    </Panel>
  );
}
