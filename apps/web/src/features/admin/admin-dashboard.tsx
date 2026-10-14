'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { PLATFORM } from './owners';

type Dashboard = components['schemas']['AdminDashboardDto'];

const link = 'font-semibold text-primary underline underline-offset-4';

/**
 * The first page of the admin area: what is waiting, with a link from each number to the list
 * it counts. A person sees only the parts they may act on.
 */
export function AdminDashboard() {
  const t = useTranslations();
  const d = (key: string, values?: Record<string, string | number>) =>
    t(`portal.admin.dashboard.${key}`, values);
  const locale = useLocale();
  const format = useFormatter();
  const name = useLocalName();
  const { api, call, me } = useAuth();
  // Whose numbers (M16): everything the person works on, one organisation's, or the platform's.
  const [owner, setOwner] = useState('');
  const places = [
    ...(me?.organisations ?? []).map((held) => ({
      value: held.organisation.id,
      label: name(held.organisation),
    })),
    ...(me?.platformPermissions.length
      ? [{ value: PLATFORM, label: t('content.common.owner.platform') }]
      : []),
  ];
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/dashboard', {
        params: { query: owner ? { owner } : {} },
      }),
    )
      .then((result) => active && setData(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, owner]);

  const empty =
    data !== null &&
    !data.applications &&
    !data.members &&
    !data.review &&
    !data.broadcasts &&
    !data.events &&
    !data.accounts &&
    !data.chat;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{d('title')}</h1>
        <p className="mt-2 text-text-muted">{d('intro')}</p>
      </div>
      {places.length > 1 && (
        <SelectField
          label={d('view.label')}
          className="max-w-sm"
          placeholder={d('view.all')}
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          options={places}
        />
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!data && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {empty && <Alert>{d('nothing')}</Alert>}
      {data && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="admin-dashboard">
          {data.applications && (
            <Tile id="applications" title={d('applications.title')}>
              <p className="text-2xl font-semibold" data-testid="tile-applications">
                {d('applications.waitingAssociation', {
                  count: data.applications.waitingAssociation,
                })}
              </p>
              <p className="text-text-muted">
                {d('applications.waitingDirector', { count: data.applications.waitingDirector })}
              </p>
              <Link href="/admin/applications" className={link}>
                {d('applications.link')}
              </Link>
            </Tile>
          )}
          {data.review && (
            <Tile id="review" title={d('review.title')}>
              <ul className="flex flex-col gap-1">
                {data.review.news !== null && (
                  <li>
                    <Link href="/admin/news" className={link}>
                      {d('review.news', { count: data.review.news })}
                    </Link>
                  </li>
                )}
                {data.review.education !== null && (
                  <li>
                    <Link href="/admin/education" className={link}>
                      {d('review.education', { count: data.review.education })}
                    </Link>
                  </li>
                )}
                {data.review.examQuestions !== null && (
                  <li>
                    <Link href="/admin/education/questions" className={link}>
                      {d('review.examQuestions', { count: data.review.examQuestions })}
                    </Link>
                  </li>
                )}
              </ul>
            </Tile>
          )}
          {data.broadcasts && (
            <Tile id="broadcasts" title={d('broadcasts.title')}>
              <p className="text-2xl font-semibold">
                {d('broadcasts.waiting', { count: data.broadcasts.waitingApproval })}
              </p>
              <Link href="/admin/broadcasts" className={link}>
                {d('broadcasts.link')}
              </Link>
            </Tile>
          )}
          {data.chat && (
            <Tile id="chat" title={d('chat.title')}>
              <p className="text-2xl font-semibold" data-testid="tile-chat">
                {d('chat.open', { count: data.chat.openReports })}
              </p>
              <Link href="/admin/chat/reports" className={link}>
                {d('chat.link')}
              </Link>
            </Tile>
          )}
          {data.members && (
            <Tile id="members" title={d('members.title')}>
              <p className="text-2xl font-semibold">
                {d('members.active', { count: data.members.active })}
              </p>
              <p className="text-text-muted">
                {d('members.suspended', { count: data.members.suspended })}
                {' · '}
                {d('members.expired', { count: data.members.expired })}
              </p>
              <h3 className="text-sm font-semibold">{d('members.byType')}</h3>
              <ul className="text-sm">
                {data.members.byType.map((type) => (
                  <li key={type.key} className="flex justify-between gap-3">
                    <span>{name(type)}</span>
                    <span>{type.active}</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin/members" className={link}>
                {d('members.link')}
              </Link>
            </Tile>
          )}
          {data.events && (
            <Tile id="events" title={d('events.title')}>
              {data.events.upcoming.length === 0 ? (
                <p className="text-text-muted">{d('events.none')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.events.upcoming.map((event) => (
                    <li key={event.id}>
                      <Link href={`/admin/events/${event.id}`} className={link}>
                        {(locale === 'he'
                          ? (event.titleHe ?? event.titleEn)
                          : (event.titleEn ?? event.titleHe)) ?? event.id}
                      </Link>
                      <span className="block text-sm text-text-muted">
                        {format.dateTime(new Date(event.startAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {' · '}
                        {d('events.registered', { count: event.registered })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {data.events.upcomingTotal > data.events.upcoming.length && (
                <p className="text-sm text-text-muted">
                  {d('events.more', {
                    count: data.events.upcomingTotal - data.events.upcoming.length,
                  })}
                </p>
              )}
              <Link href="/admin/events" className={link}>
                {d('events.link')}
              </Link>
            </Tile>
          )}
          {data.accounts && (
            <Tile id="accounts" title={d('accounts.title')}>
              <p>
                {d('accounts.locked', { count: data.accounts.locked })}
                {' · '}
                {d('accounts.disabled', { count: data.accounts.disabled })}
              </p>
              <Link href="/admin/users" className={link}>
                {d('accounts.link')}
              </Link>
            </Tile>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`tile-${id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-card"
    >
      <h2 id={`tile-${id}`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
