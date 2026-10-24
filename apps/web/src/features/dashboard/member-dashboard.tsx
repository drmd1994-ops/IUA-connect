'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { useLocalName } from '@/features/membership/reference';
import { useNoticeText } from '@/features/notifications/notifications-page';
import { sectionHref } from '@/features/organisations/organisations';
import { Link } from '@/i18n/navigation';
import { FirstSteps } from '@/features/verification/first-steps';

type Schemas = components['schemas'];
type Membership = Schemas['MyMembershipDto']['membership'];
type Notices = Schemas['NotificationListDto'];
type Events = Schemas['PublicEventListDto']['items'];
type News = Schemas['PublicNewsListDto']['items'];
type Education = Schemas['PublicEducationListDto']['items'];

const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';
const card = 'flex flex-col gap-3 rounded-lg border border-border bg-surface p-6 shadow-card';

/** Loads one part of the dashboard. A part that fails stays empty; the others still show. */
function useLoaded<T>(load: () => Promise<T>, deps: unknown[]): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    load()
      .then((result) => active && setValue(result))
      .catch(() => active && setValue(null));
    return () => {
      active = false;
    };
    // The caller lists what the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Later features, shown so they are known to be planned, and never mistaken for working. */
const LATER = ['createCase'] as const;

/**
 * The home page of a signed-in person (M8 plan §2.6): their membership, new notices, upcoming
 * events, the newest news and education they may read, and quick actions.
 */
export function MemberDashboard() {
  const t = useTranslations();
  const h = (key: string, values?: Record<string, string | number>) =>
    t(`portal.home.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const format = useFormatter();
  const name = useLocalName();
  const noticeText = useNoticeText();
  const { api, call, me } = useAuth();

  const membership = useLoaded<Membership>(
    // One panel: a person in several organisations sees the first here, and all in their sections.
    async () => (await call(() => api.GET('/api/v1/me/memberships'))).items[0] ?? null,
    [api, call],
  );
  const notices = useLoaded<Notices>(
    () => call(() => api.GET('/api/v1/notifications', { params: { query: { pageSize: 20 } } })),
    [api, call],
  );
  const events = useLoaded<Events>(
    async () =>
      (
        await call(() =>
          api.GET('/api/v1/events', {
            params: { query: { locale, when: 'upcoming', pageSize: 4 } },
          }),
        )
      ).items,
    [api, call, locale],
  );
  const registered = useLoaded<string[]>(
    async () =>
      (
        await call(() => api.GET('/api/v1/me/schedule', { params: { query: { locale } } }))
      ).items.map((item) => item.slug),
    [api, call, locale],
  );
  const news = useLoaded<News>(
    async () =>
      (await call(() => api.GET('/api/v1/news', { params: { query: { locale, pageSize: 3 } } })))
        .items,
    [api, call, locale],
  );
  const education = useLoaded<Education>(
    async () =>
      (
        await call(() =>
          api.GET('/api/v1/education', { params: { query: { locale, pageSize: 3 } } }),
        )
      ).items,
    [api, call, locale],
  );

  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'long' });
  const unread = notices?.items.filter((notice) => notice.readAt === null).slice(0, 5) ?? [];
  const loading = <p role="status">{t('membership.common.loading')}</p>;

  return (
    <div
      className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12"
      data-testid="member-dashboard"
    >
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{h('greeting')}</h1>
        {me && (
          <p className="mt-2 text-text-muted" dir="ltr">
            {me.email}
          </p>
        )}
      </div>

      <FirstSteps />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="home-membership" title={h('membership.title')}>
          {membership === undefined ? (
            loading
          ) : membership ? (
            <>
              <p data-testid="home-membership-state">
                {h(
                  membership.status === 'ACTIVE'
                    ? 'membership.active'
                    : `membership.${membership.status}`,
                  {
                    type: name(membership.type),
                    date: date(membership.endDate),
                  },
                )}
              </p>
              <p className="flex flex-wrap gap-4">
                <Link
                  href={sectionHref(membership.organisation.slug, 'membership')}
                  className={link}
                >
                  {h('membership.open')}
                </Link>
                {membership.status === 'ACTIVE' && (
                  <Link
                    href={sectionHref(membership.organisation.slug, 'membership/card')}
                    className={link}
                  >
                    {h('membership.card')}
                  </Link>
                )}
              </p>
            </>
          ) : (
            <>
              <p>{h('membership.none')}</p>
              <p>
                <Link href="/organisations" className={link}>
                  {h('membership.apply')}
                </Link>
              </p>
            </>
          )}
        </Section>

        <Section id="home-notifications" title={h('notifications.title')}>
          {notices === undefined ? (
            loading
          ) : unread.length === 0 ? (
            <p className="text-text-muted">{h('notifications.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {unread.map((notice) => (
                <li key={notice.id}>
                  {notice.link ? (
                    <Link href={notice.link} className={link}>
                      {noticeText(notice)}
                    </Link>
                  ) : (
                    noticeText(notice)
                  )}
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href="/account/notifications" className={link}>
              {h('notifications.all')}
            </Link>
          </p>
        </Section>

        <Section id="home-events" title={h('events.title')}>
          {events === undefined ? (
            loading
          ) : !events || events.length === 0 ? (
            <p className="text-text-muted">{h('events.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {[...events]
                // The events the person registered for come first.
                .sort(
                  (a, b) =>
                    Number(registered?.includes(b.slug) ?? false) -
                    Number(registered?.includes(a.slug) ?? false),
                )
                .map((event) => (
                  <li key={event.slug}>
                    <Link
                      href={`/events/${encodeURIComponent(event.slug)}`}
                      className={link}
                      lang={event.locale}
                    >
                      {event.title}
                    </Link>
                    <span className="block text-sm text-text-muted">
                      {event.startAt &&
                        format.dateTime(new Date(event.startAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: event.timezone,
                        })}
                      {registered?.includes(event.slug) && (
                        <span className={`${badge} ms-2 bg-success-100 text-success-700`}>
                          {h('events.registered')}
                        </span>
                      )}
                      {event.cancelled && (
                        <span className={`${badge} ms-2 bg-danger-100 text-danger-700`}>
                          {h('events.cancelled')}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <p>
            <Link href="/events" className={link}>
              {h('events.all')}
            </Link>
          </p>
        </Section>

        <Section id="home-news" title={h('news.title')}>
          {news === undefined ? (
            loading
          ) : !news || news.length === 0 ? (
            <p className="text-text-muted">{h('news.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {news.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/news/${encodeURIComponent(item.slug)}`}
                    className={link}
                    lang={item.locale}
                  >
                    {item.title}
                  </Link>
                  <span className="block text-sm text-text-muted">{date(item.date)}</span>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href="/news" className={link}>
              {h('news.all')}
            </Link>
          </p>
        </Section>

        <Section id="home-education" title={h('education.title')}>
          {education === undefined ? (
            loading
          ) : !education || education.length === 0 ? (
            <p className="text-text-muted">{h('education.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {education.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/education/${encodeURIComponent(item.slug)}`}
                    className={link}
                    lang={item.locale}
                  >
                    {item.title}
                  </Link>
                  <span className="block text-sm text-text-muted">
                    {t(`education.types.${item.type}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href="/education" className={link}>
              {h('education.all')}
            </Link>
          </p>
        </Section>

        <Section id="home-actions" title={h('actions.title')}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['findColleague', '/members'],
                ['guidelines', '/guidelines'],
                ['exam', '/education/exam'],
                ['search', '/search'],
                ['openCalculator', '/calculators'],
                // M25: communities.
                ['askCommunity', '/communities'],
                // M27: research projects.
                ['postResearch', '/research'],
              ] as const
            ).map(([key, href]) => (
              <li key={key}>
                <Link
                  href={href}
                  className="block rounded-md border border-border px-4 py-3 font-semibold text-primary hover:bg-surface-muted"
                >
                  {h(`actions.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-2 text-sm font-semibold text-text-muted">{h('actions.laterTitle')}</h3>
          {/* Deliberately not links or buttons: these features are not built (spec §60). */}
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="coming-soon-actions">
            {LATER.map((key) => (
              <li
                key={key}
                aria-disabled="true"
                className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border px-4 py-3 text-text-muted"
              >
                <span>{h(`actions.${key}`)}</span>
                <span className={`${badge} bg-surface-muted`}>{h('actions.comingSoon')}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The home page: the personal dashboard when signed in, the public page otherwise. */
export function HomeSwitch({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  return status === 'signedIn' ? <MemberDashboard /> : <>{children}</>;
}
