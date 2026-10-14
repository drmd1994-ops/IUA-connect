'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { NOTICES_CHANGED } from './notification-bell';

type List = components['schemas']['NotificationListDto'];
type Notice = List['items'][number];

const PAGE_SIZE = 20;
const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** The signed-in person's notices, newest first. */
export function NotificationsPage() {
  return <RequireSignIn>{() => <NoticeList />}</RequireSignIn>;
}

/**
 * The words of a notice in the reader's language. Notices about content and broadcasts carry
 * the title in Hebrew and in English; the reader's language is used when there is one.
 */
export function useNoticeText() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  return (notice: Notice): string => {
    const params = notice.params as Record<string, string | number>;
    const title =
      (locale === 'he' ? (params.titleHe ?? params.titleEn) : (params.titleEn ?? params.titleHe)) ??
      params.title;
    const key = `items.${notice.type}`;
    if (!t.has(key)) return t('items.unknown');
    try {
      return t(key, { ...params, title: title ?? '' });
    } catch {
      // A notice stored without a value its sentence needs.
      return t('items.unknown');
    }
  };
}

function NoticeList() {
  const t = useTranslations();
  const n = (key: string, values?: Record<string, string | number>) =>
    t(`notifications.list.${key}`, values);
  const format = useFormatter();
  const text = useNoticeText();
  const { api, call } = useAuth();
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  /** Increases to load the list again after something was marked as read. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/notifications', { params: { query: { page, pageSize: PAGE_SIZE } } }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, version]);

  const changed = useCallback(() => {
    setVersion((value) => value + 1);
    window.dispatchEvent(new Event(NOTICES_CHANGED));
  }, []);

  async function act(work: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await work();
      changed();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  const read = (id: string) =>
    call(() => api.POST('/api/v1/notifications/{id}/read', { params: { path: { id } } }));

  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{n('title')}</h1>
        <p className="mt-2 text-text-muted">{n('intro')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/account/notifications/preferences" className={link}>
          {n('preferences')}
        </Link>
        {list && list.unread > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void act(() => call(() => api.POST('/api/v1/notifications/read-all')))}
          >
            {n('markAll')}
          </Button>
        )}
      </div>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite" data-testid="notice-summary">
            {n('summary', { unread: list.unread, total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{n('empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="notice-list">
              {list.items.map((notice) => {
                const unread = notice.readAt === null;
                return (
                  <li
                    key={notice.id}
                    className={`rounded-md border p-4 ${
                      unread ? 'border-primary bg-brand-50' : 'border-border'
                    }`}
                  >
                    <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                      <span>{t(`notifications.kinds.${notice.kind}`)}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={notice.createdAt}>
                        {format.dateTime(new Date(notice.createdAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                      {unread && (
                        <span className={`${badge} bg-primary text-on-primary`}>{n('new')}</span>
                      )}
                    </p>
                    <p className="mt-1 font-semibold">
                      {notice.link ? (
                        <Link
                          href={notice.link}
                          className={link}
                          onClick={() => {
                            // Opening a notice reads it. The page is left either way.
                            if (unread) void read(notice.id).then(changed, () => undefined);
                          }}
                        >
                          {text(notice)}
                        </Link>
                      ) : (
                        text(notice)
                      )}
                    </p>
                    {unread && (
                      <p className="mt-2">
                        <Button
                          type="button"
                          variant="link"
                          disabled={pending}
                          onClick={() => void act(() => read(notice.id))}
                        >
                          {n('markRead')}
                        </Button>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
        </>
      )}
    </PageFrame>
  );
}
