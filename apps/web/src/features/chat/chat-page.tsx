'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { type Me, useAuth } from '@/features/auth/auth-context';
import { RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { MessageSearchDialog, NewConversationDialog } from './chat-dialogs';
import { CHAT_CHANGED, type ChatEvent, useChatEvents } from './chat-events';
import { type Conversation, dayKey } from './chat-model';
import { Avatar, type Subscribe, usePersonLabel } from './chat-parts';
import { ConversationView } from './conversation-view';

/**
 * The Chat section (M11): the reader's conversations on one side and the open conversation
 * beside it. On a phone each is a screen of its own.
 */
export function ChatPage({ conversationId }: { conversationId?: string }) {
  return (
    <RequireSignIn>
      {(me) => <Chat me={me} conversationId={conversationId ?? null} />}
    </RequireSignIn>
  );
}

function Chat({ me, conversationId }: { me: Me; conversationId: string | null }) {
  const t = useTranslations('chat');
  // One stream for the page; the list and the open conversation both listen to it.
  const listeners = useRef(new Set<(event: ChatEvent) => void>());
  const subscribe = useCallback<Subscribe>((listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  useChatEvents(
    useCallback((event: ChatEvent) => {
      for (const listener of listeners.current) listener(event);
    }, []),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid gap-4 md:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          aria-label={t('list.title')}
          className={`${conversationId ? 'hidden md:flex' : 'flex'} h-[75dvh] min-h-[28rem] min-w-0 flex-col rounded-lg border border-border bg-surface`}
        >
          <ConversationList current={conversationId} subscribe={subscribe} />
        </aside>
        <section
          aria-label={t('conversation.details')}
          className={`${conversationId ? 'flex' : 'hidden md:flex'} h-[75dvh] min-h-[28rem] min-w-0 flex-col rounded-lg border border-border bg-surface`}
        >
          {conversationId ? (
            <ConversationView
              key={conversationId}
              id={conversationId}
              me={me}
              subscribe={subscribe}
            />
          ) : (
            <p className="m-auto max-w-sm p-6 text-center text-text-muted">{t('list.choose')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationList({
  current,
  subscribe,
}: {
  current: string | null;
  subscribe: Subscribe;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.list');
  const format = useFormatter();
  const label = usePersonLabel();
  const { api, call } = useAuth();
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<'new' | 'search' | null>(null);

  // The first page, again whenever something changed.
  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/chat/conversations', {
        params: { query: { archived: archived ? 'true' : 'false', ...(q ? { q } : {}) } },
      }),
    )
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setError(null);
        window.dispatchEvent(new Event(CHAT_CHANGED));
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, archived, q, version]);

  // Anything but "is typing" may change the list; several events close together load it once.
  useEffect(() => {
    let timer: number | undefined;
    const stop = subscribe((event) => {
      if (event.type === 'typing') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVersion((value) => value + 1), 300);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [subscribe]);

  // Typing filters after a short pause.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setQ(search.trim().length >= 2 ? search.trim() : ''),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  async function more() {
    if (!nextCursor) return;
    try {
      const result = await call(() =>
        api.GET('/api/v1/chat/conversations', {
          params: {
            query: {
              archived: archived ? 'true' : 'false',
              cursor: nextCursor,
              ...(q ? { q } : {}),
            },
          },
        }),
      );
      setItems((existing) => {
        const known = new Set((existing ?? []).map((item) => item.id));
        return [...(existing ?? []), ...result.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(result.nextCursor);
    } catch (caught) {
      setError(caught);
    }
  }

  const today = dayKey(new Date().toISOString());
  const when = (iso: string) =>
    format.dateTime(
      new Date(iso),
      dayKey(iso) === today ? { timeStyle: 'short' } : { dateStyle: 'short' },
    );
  const tab = (value: boolean, text: string) => (
    <button
      type="button"
      aria-pressed={archived === value}
      onClick={() => setArchived(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
        archived === value ? 'bg-brand-50 text-brand-900' : 'text-text-muted hover:text-text'
      }`}
    >
      {text}
    </button>
  );

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-brand-900">{t('title')}</h1>
          <Link href="/account/chat" className="text-sm font-semibold text-primary underline">
            {t('settings')}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="text-sm" onClick={() => setDialog('new')}>
            {t('new')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="text-sm"
            onClick={() => setDialog('search')}
          >
            {t('searchMessages')}
          </Button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          aria-label={t('search')}
          placeholder={t('search')}
          className="min-w-0 rounded-md border border-neutral-400 bg-surface px-3 py-2 text-sm text-text"
        />
        <div role="group" aria-label={t('tabsLabel')} className="flex gap-1">
          {tab(false, t('active'))}
          {tab(true, t('archived'))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error !== null && (
          <div className="p-4">
            <Alert tone="error">{errorMessage(error, all)}</Alert>
          </div>
        )}
        {!items && error === null && (
          <p role="status" className="p-4">
            {all('membership.common.loading')}
          </p>
        )}
        {items?.length === 0 && (
          <p className="p-4 text-text-muted">
            {q ? t('emptySearch') : archived ? t('emptyArchived') : t('empty')}
          </p>
        )}
        {items && items.length > 0 && (
          <ul data-testid="conversation-list" className="divide-y divide-border">
            {items.map((item) => {
              const name = label(item.other);
              const last = item.lastMessage;
              const text = !last
                ? ''
                : last.deleted
                  ? t('deleted')
                  : last.senderId === item.other.id
                    ? last.body
                    : t('you', { text: last.body });
              const unread = item.unreadCount > 0 || item.markedUnread;
              return (
                <li key={item.id}>
                  <Link
                    href={`/chat/${item.id}`}
                    aria-current={item.id === current ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-muted ${
                      item.id === current ? 'bg-brand-50' : ''
                    }`}
                  >
                    <Avatar person={item.other} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate ${unread ? 'font-semibold' : ''}`}>{name}</span>
                        {item.lastMessageAt && (
                          <span className="shrink-0 text-xs text-text-muted">
                            {when(item.lastMessageAt)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span
                          dir="auto"
                          className={`truncate text-sm ${unread ? 'text-text' : 'text-text-muted'}`}
                        >
                          {text}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {item.muted && (
                            <span className="text-xs text-text-muted">{t('muted')}</span>
                          )}
                          {item.unreadCount > 0 ? (
                            <span
                              data-testid="unread-count"
                              className="grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold leading-5 text-on-primary"
                            >
                              <span aria-hidden="true">
                                {item.unreadCount > 99 ? '99+' : item.unreadCount}
                              </span>
                              <span className="sr-only">
                                {t('unread', { count: item.unreadCount })}
                              </span>
                            </span>
                          ) : (
                            item.markedUnread && (
                              <span className="size-2.5 rounded-full bg-primary">
                                <span className="sr-only">{t('markedUnread')}</span>
                              </span>
                            )
                          )}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {nextCursor && (
          <div className="p-4">
            <Button type="button" variant="link" onClick={() => void more()}>
              {t('more')}
            </Button>
          </div>
        )}
      </div>

      {dialog === 'new' && <NewConversationDialog onClose={() => setDialog(null)} />}
      {dialog === 'search' && <MessageSearchDialog onClose={() => setDialog(null)} />}
    </>
  );
}
