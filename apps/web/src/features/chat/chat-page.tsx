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
import { GroupMark } from './chat-extras';
import { type Conversation, dayKey } from './chat-model';
import { Avatar, type Subscribe, usePersonLabel } from './chat-parts';
import { ConversationView } from './conversation-view';
import { GroupView } from './group-view';
import { Invitations, NewGroupDialog, useInvitationCount } from './invitations';
import { ActivityMark, useActivity } from './message-parts';
import { RoomView } from './room-view';

/**
 * The Chat section (M11): the reader's conversations on one side and the open conversation
 * beside it. On a phone each is a screen of its own.
 */
export function ChatPage({ conversationId }: { conversationId?: string }) {
  return (
    <RequireSignIn>
      {(me) => <Chat me={me} open={{ kind: 'private', id: conversationId ?? null }} />}
    </RequireSignIn>
  );
}

/**
 * One chat room (M12). Rooms closed in M25 (communities replace them): every room is archived,
 * and this page is left for staff, who can still read one.
 */
export function RoomsPage({ roomId }: { roomId: string }) {
  return (
    <RequireSignIn>{(me) => <Chat me={me} open={{ kind: 'room', id: roomId }} />}</RequireSignIn>
  );
}

/** A group a member made (M13). It lives on the Private side of the Chat section. */
export function GroupPage({ groupId }: { groupId: string }) {
  return (
    <RequireSignIn>{(me) => <Chat me={me} open={{ kind: 'group', id: groupId }} />}</RequireSignIn>
  );
}

/** The reader's invitations to groups and to rooms by invitation (M13). */
export function InvitationsPage() {
  return <RequireSignIn>{(me) => <Chat me={me} open={{ kind: 'invitations' }} />}</RequireSignIn>;
}

type Open = { kind: 'private' | 'room' | 'group'; id: string | null } | { kind: 'invitations' };

function Chat({ me, open }: { me: Me; open: Open }) {
  const t = useTranslations('chat');
  const r = useTranslations('rooms');
  const rooms = open.kind === 'room';
  const openId = 'id' in open ? open.id : null;
  /** On a phone the list and what is open are a screen each. */
  const showsMain = !('id' in open) || openId !== null;
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
          aria-label={rooms ? r('list.title') : t('list.title')}
          className={`${showsMain ? 'hidden md:flex' : 'flex'} h-[75dvh] min-h-[28rem] min-w-0 flex-col rounded-lg border border-border bg-surface`}
        >
          <ConversationList current={openId} subscribe={subscribe} />
        </aside>
        <section
          aria-label={rooms ? r('tabs.rooms') : t('conversation.details')}
          className={`${showsMain ? 'flex' : 'hidden md:flex'} h-[75dvh] min-h-[28rem] min-w-0 flex-col rounded-lg border border-border bg-surface`}
        >
          {open.kind === 'invitations' ? (
            <Invitations subscribe={subscribe} />
          ) : open.kind === 'group' && open.id ? (
            <GroupView key={open.id} id={open.id} me={me} subscribe={subscribe} />
          ) : open.kind === 'room' && open.id ? (
            <RoomView key={open.id} id={open.id} me={me} subscribe={subscribe} />
          ) : open.kind === 'private' && open.id ? (
            <ConversationView key={open.id} id={open.id} me={me} subscribe={subscribe} />
          ) : (
            <p className="m-auto max-w-sm p-6 text-center text-text-muted">
              {rooms ? r('list.choose') : t('list.choose')}
            </p>
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
  const g = useTranslations('groups.list');
  const format = useFormatter();
  const label = usePersonLabel();
  const { api, call } = useAuth();
  const invitations = useInvitationCount(subscribe);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<'new' | 'group' | 'search' | null>(null);
  const activity = useActivity(
    (items ?? []).flatMap((item) => (item.other.id ? [item.other.id] : [])),
    subscribe,
  );

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
      if (event.type === 'typing' || event.type === 'activity') return;
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
            onClick={() => setDialog('group')}
          >
            {g('newGroup')}
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
        {invitations > 0 && (
          <Link
            href="/chat/invitations"
            data-testid="invitations-link"
            className="rounded-md bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900 underline"
          >
            {g('invitations', { count: invitations })}
          </Link>
        )}
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
              const name = item.group ? item.group.name : label(item.other);
              const last = item.lastMessage;
              // A message that is only files says how many it carries.
              const said = last
                ? last.body || (last.files > 0 ? g('files', { count: last.files }) : '')
                : '';
              const text = !last
                ? item.group
                  ? g('people', { count: item.group.memberCount })
                  : ''
                : last.deleted
                  ? t('deleted')
                  : item.group || last.senderId === item.other.id
                    ? said
                    : t('you', { text: said });
              const href = item.group ? `/chat/groups/${item.id}` : `/chat/${item.id}`;
              const seen = item.other.id ? activity.get(item.other.id) : undefined;
              const unread = item.unreadCount > 0 || item.markedUnread;
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    data-kind={item.kind}
                    aria-current={item.id === current ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-muted ${
                      item.id === current ? 'bg-brand-50' : ''
                    }`}
                  >
                    {item.group ? <GroupMark name={name} /> : <Avatar person={item.other} />}
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
                          {seen === 'online' && <ActivityMark activity={seen} />}
                          {item.pinned && (
                            <span className="text-xs text-text-muted">{g('pinned')}</span>
                          )}
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
      {dialog === 'group' && <NewGroupDialog onClose={() => setDialog(null)} />}
      {dialog === 'search' && <MessageSearchDialog onClose={() => setDialog(null)} />}
    </>
  );
}
