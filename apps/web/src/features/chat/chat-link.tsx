'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { Link } from '@/i18n/navigation';
import { CHAT_CHANGED } from './chat-events';

const REFRESH_MS = 60_000;

/**
 * "Chat" in the header, for people who have chat, with the number of conversations that hold
 * unread messages. Refreshed about once a minute, and at once when a chat page changes it.
 */
export function ChatLink() {
  const t = useTranslations('chat');
  const { status, api, call } = useAuth();
  const [state, setState] = useState<{ enabled: boolean; unread: number }>({
    enabled: false,
    unread: 0,
  });
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      call(() => api.GET('/api/v1/chat/unread-count'))
        .then(
          (result) => active && setState({ enabled: result.enabled, unread: result.conversations }),
        )
        // Not worth an error message; the next round tries again.
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    window.addEventListener(CHAT_CHANGED, load);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener(CHAT_CHANGED, load);
    };
  }, [api, call, signedIn]);

  if (!signedIn || !state.enabled) return null;
  return (
    <Link
      href="/chat"
      aria-label={t('link.unread', { count: state.unread })}
      data-testid="chat-link"
      className="relative rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
    >
      {t('nav')}
      {state.unread > 0 && (
        <span
          aria-hidden="true"
          data-testid="chat-count"
          className="absolute -end-2 -top-1 grid min-w-5 place-items-center rounded-full bg-danger-700 px-1 text-xs font-semibold leading-5 text-neutral-0"
        >
          {state.unread > 99 ? '99+' : state.unread}
        </span>
      )}
    </Link>
  );
}
