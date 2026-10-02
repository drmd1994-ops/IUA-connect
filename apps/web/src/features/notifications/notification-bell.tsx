'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { Link } from '@/i18n/navigation';

const REFRESH_MS = 60_000;
/** Sent on the window when notices were read, so the number on the bell follows at once. */
export const NOTICES_CHANGED = 'iua:notices-changed';

/**
 * The bell in the header: a link to the notifications page with the number of new notices.
 * The number is refreshed about once a minute while the page is visible.
 */
export function NotificationBell() {
  const t = useTranslations('notifications.bell');
  const { status, api, call } = useAuth();
  const [unread, setUnread] = useState(0);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      call(() => api.GET('/api/v1/notifications/unread-count'))
        .then((result) => active && setUnread(result.unread))
        // The bell is not worth an error message; the next round tries again.
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    window.addEventListener(NOTICES_CHANGED, load);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener(NOTICES_CHANGED, load);
    };
  }, [api, call, signedIn]);

  if (!signedIn) return null;
  return (
    <Link
      href="/account/notifications"
      aria-label={t('unread', { count: unread })}
      data-testid="notification-bell"
      className="relative rounded-md px-2 py-1.5 text-text hover:bg-surface-muted"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          data-testid="notification-count"
          className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger-700 px-1 text-xs font-semibold leading-5 text-neutral-0"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
