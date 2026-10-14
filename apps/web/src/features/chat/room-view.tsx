'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { type Me, useAuth } from '@/features/auth/auth-context';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { ConfirmDialog, MessageSearchDialog, ReportDialog } from './chat-dialogs';
import { ForwardDialog, NewestLink, forwardItem, useAt, useJumpTo } from './chat-extras';
import { InvitePanel } from './invite-panel';
import {
  type Message,
  type Reaction,
  type RoomDetail,
  dayKey,
  mergeMessages,
  personName,
} from './chat-model';
import { Avatar, type Subscribe, chatLink } from './chat-parts';
import {
  Composer,
  type MenuItem,
  MessageMenu,
  MessageText,
  ReactionChips,
  type Suggestion,
} from './message-parts';
import { Modal } from './modal';
import { RoomPicture, useRoomText } from './rooms-list';

type Pins = components['schemas']['RoomPinsDto']['items'];
type Members = components['schemas']['RoomMembersDto'];
type Bans = components['schemas']['RoomBanListDto']['items'];

type Dialog =
  | {
      kind:
        | 'deleteAll'
        | 'deleteMine'
        | 'report'
        | 'forward'
        | 'modRemove'
        | 'modRemovePerson'
        | 'modBan';
      message: Message;
    }
  | { kind: 'details' | 'search' | 'leave' | 'reportRoom' | 'join' };

const TYPING_SHOWN_MS = 4000;
/** Close enough to the end to follow new messages down. */
const NEAR_END_PX = 80;

/** One room: its messages, live, with reactions, mentions, pins and the moderator's tools. */
export function RoomView({ id, me, subscribe }: { id: string; me: Me; subscribe: Subscribe }) {
  const all = useTranslations();
  const c = useTranslations('chat');
  const t = useTranslations('rooms');
  const format = useFormatter();
  const text = useRoomText();
  const router = useRouter();
  const g = useTranslations('groups');
  const { api, call } = useAuth();
  /** Opened at an earlier message: the messages around it are shown, and new ones not followed. */
  const at = useAt();
  const detached = useRef(false);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pins, setPins] = useState<Pins>([]);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [typers, setTypers] = useState<string[]>([]);
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [announcement, setAnnouncement] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const heightBefore = useRef<number | null>(null);
  const loadingEarlier = useRef(false);
  const lastSeq = useRef(0);
  /** Whether the reader may read the messages: in the room, or staff. */
  const reads = useRef(false);

  useEffect(() => {
    lastSeq.current = messages.at(-1)?.seq ?? 0;
  }, [messages]);

  const loadRoom = useCallback(async () => {
    try {
      const detail = await call(() =>
        api.GET('/api/v1/chat/rooms/{id}', { params: { path: { id } } }),
      );
      reads.current = detail.role !== 'NONE' || detail.canModerate;
      setRoom(detail);
      return detail;
    } catch (caught) {
      setError(caught);
      return null;
    }
  }, [api, call, id]);

  const loadPins = useCallback(async () => {
    if (!reads.current) return;
    try {
      const result = await call(() =>
        api.GET('/api/v1/chat/rooms/{id}/pins', { params: { path: { id } } }),
      );
      setPins(result.items);
    } catch {
      // The next room event tries again.
    }
  }, [api, call, id]);

  /** Reads everything, when the reader is in the room and actually looking. */
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible' || detached.current) return;
    call(() =>
      api.POST('/api/v1/chat/rooms/{id}/read', { params: { path: { id } }, body: {} }),
    ).catch(() => undefined);
  }, [api, call, id]);

  const catchUp = useCallback(async () => {
    if (!reads.current || detached.current) return;
    try {
      for (;;) {
        const page = await call(() =>
          api.GET('/api/v1/chat/rooms/{id}/messages', {
            params: { path: { id }, query: { after: lastSeq.current } },
          }),
        );
        if (page.items.length === 0) return;
        lastSeq.current = page.items.at(-1)!.seq;
        setMessages((current) => mergeMessages(current, page.items));
        if (!page.hasMore) return;
      }
    } catch {
      // The next event or refresh tries again.
    }
  }, [api, call, id]);

  const reloadOne = useCallback(
    async (seq: number) => {
      if (!reads.current) return;
      try {
        const page = await call(() =>
          api.GET('/api/v1/chat/rooms/{id}/messages', {
            params: { path: { id }, query: { after: seq - 1, limit: 1 } },
          }),
        );
        const found = page.items[0];
        setMessages((current) =>
          found?.seq === seq
            ? mergeMessages(current, [found])
            : current.filter((message) => message.seq !== seq),
        );
      } catch {
        // Left as it is; a refresh corrects it.
      }
    },
    [api, call, id],
  );

  // Opening the room: its details; and, for someone who may read it, its newest messages.
  useEffect(() => {
    let active = true;
    detached.current = at !== null;
    atEnd.current = at === null;
    void (async () => {
      const detail = await loadRoom();
      if (!active || !detail || !reads.current) return;
      try {
        const page = await call(() =>
          api.GET('/api/v1/chat/rooms/{id}/messages', {
            params: { path: { id }, query: at === null ? {} : { around: at } },
          }),
        );
        if (!active) return;
        setMessages(page.items);
        setHasMore(page.hasMore);
        if (detail.role !== 'NONE') markRead();
        void loadPins();
      } catch (caught) {
        if (active) setError(caught);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, call, id, loadRoom, loadPins, markRead, at]);

  useJumpTo(at, messages.length > 0, scroller);

  // Live events.
  useEffect(() => {
    const timers = new Map<string, number>();
    const stop = subscribe((event) => {
      if (event.type === 'refresh') {
        void loadRoom().then(() => {
          void catchUp();
          void loadPins();
        });
        return;
      }
      if (event.conversationId !== id) return;
      switch (event.type) {
        case 'message.new':
          void catchUp().then(() => {
            markRead();
            void loadRoom();
          });
          break;
        case 'message.edited':
        case 'message.deleted':
          if (event.seq !== undefined) void reloadOne(event.seq);
          if (event.type === 'message.deleted') void loadPins();
          break;
        case 'markers':
          void loadRoom();
          break;
        case 'room':
          void loadRoom().then(() => loadPins());
          break;
        case 'room.left':
          reads.current = false;
          setLeft(true);
          setMessages([]);
          setPins([]);
          void loadRoom();
          break;
        case 'typing': {
          const userId = event.userId;
          if (!userId || userId === me.id) break;
          setTypers((current) => (current.includes(userId) ? current : [...current, userId]));
          window.clearTimeout(timers.get(userId));
          timers.set(
            userId,
            window.setTimeout(
              () => setTypers((current) => current.filter((x) => x !== userId)),
              TYPING_SHOWN_MS,
            ),
          );
          break;
        }
        default:
      }
    });
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      stop();
    };
  }, [subscribe, id, me.id, catchUp, loadRoom, loadPins, markRead, reloadOne]);

  // Coming back to the tab reads what arrived meanwhile.
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      void loadRoom().then((detail) => {
        if (detail && detail.role !== 'NONE') markRead();
      });
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [markRead, loadRoom]);

  // Keep the place after earlier messages were added; otherwise follow the end.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    if (heightBefore.current !== null) {
      box.scrollTop += box.scrollHeight - heightBefore.current;
      heightBefore.current = null;
    } else if (atEnd.current) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages, typers]);

  async function loadEarlier() {
    const first = messages[0];
    if (!first || !hasMore || loadingEarlier.current) return;
    loadingEarlier.current = true;
    try {
      const page = await call(() =>
        api.GET('/api/v1/chat/rooms/{id}/messages', {
          params: { path: { id }, query: { before: first.seq } },
        }),
      );
      heightBefore.current = scroller.current?.scrollHeight ?? null;
      setMessages((current) => mergeMessages(current, page.items));
      setHasMore(page.hasMore);
    } catch (caught) {
      setActionError(caught);
    } finally {
      loadingEarlier.current = false;
    }
  }

  function onScroll() {
    const box = scroller.current;
    if (!box) return;
    atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_END_PX;
    if (box.scrollTop < 60) void loadEarlier();
  }

  async function send(body: string, mentions: string[], attachmentIds: string[]) {
    if (editing) {
      const edited = await call(() =>
        api.PATCH('/api/v1/chat/messages/{id}', {
          params: { path: { id: editing.id } },
          body: { body },
        }),
      );
      setMessages((current) => mergeMessages(current, [edited]));
      setEditing(null);
      return;
    }
    const sent = await call(() =>
      api.POST('/api/v1/chat/rooms/{id}/messages', {
        params: { path: { id }, header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: {
          body,
          ...(reply ? { replyToId: reply.id } : {}),
          ...(mentions.length > 0 ? { mentions } : {}),
          ...(announcement ? { announcement: true } : {}),
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        },
      }),
    );
    atEnd.current = true;
    lastSeq.current = Math.max(lastSeq.current, sent.seq);
    setMessages((current) => mergeMessages(current, [sent]));
    setReply(null);
    setAnnouncement(false);
    void loadRoom();
  }

  const signalTyping = useCallback(() => {
    call(() => api.POST('/api/v1/chat/rooms/{id}/typing', { params: { path: { id } } })).catch(
      () => undefined,
    );
  }, [api, call, id]);

  const suggest = useCallback(
    async (q: string): Promise<Suggestion[]> => {
      const result = await call(() =>
        api.GET('/api/v1/chat/rooms/{id}/members', { params: { path: { id }, query: { q } } }),
      );
      return result.items.flatMap((person) => {
        const name = personName(person);
        return person.id && person.id !== me.id && name ? [{ id: person.id, name }] : [];
      });
    },
    [api, call, id, me.id],
  );

  async function react(message: Message, reaction: Reaction, on: boolean) {
    setActionError(null);
    try {
      const path = { id: message.id, reaction };
      const updated = on
        ? await call(() =>
            api.PUT('/api/v1/chat/messages/{id}/reactions/{reaction}', { params: { path } }),
          )
        : await call(() =>
            api.DELETE('/api/v1/chat/messages/{id}/reactions/{reaction}', { params: { path } }),
          );
      setMessages((current) => mergeMessages(current, [updated]));
    } catch (caught) {
      setActionError(caught);
    }
  }

  /** A moderator's one-press action; its error is shown above the composer. */
  async function act(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await loadRoom();
      await loadPins();
    } catch (caught) {
      setActionError(caught);
    }
  }

  if (error !== null && !room) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Link href="/chat/rooms" className={chatLink}>
          {t('room.back')}
        </Link>
        <Alert tone="error">{errorMessage(error, all)}</Alert>
      </div>
    );
  }
  if (!room) {
    return (
      <p role="status" className="p-6">
        {all('membership.common.loading')}
      </p>
    );
  }

  const name = text.name(room);
  const inRoom = room.role !== 'NONE';
  const mayRead = inRoom || room.canModerate;
  const pinned = new Set(pins.map((pin) => pin.message.id));
  const personLabel = (person: Message['sender']) =>
    personName(person) ?? (person.id ? t('room.unknownPerson') : t('room.deletedAccount'));
  const senderOf = (message: Pick<Message, 'senderId'>) => {
    if (message.senderId === me.id) return t('room.you');
    const known = messages.find((m) => m.senderId === message.senderId);
    return known ? personLabel(known.sender) : t('room.unknownPerson');
  };
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short' });
  const typingText =
    typers.length === 0
      ? ''
      : typers.length === 1 && messages.some((m) => m.senderId === typers[0])
        ? t('room.typingOne', { name: senderOf({ senderId: typers[0]! }) })
        : t('room.typingMany');

  /** What the reader may do with a message; nothing else is listed. */
  const menuItems = (message: Message): MenuItem[] => {
    const items: MenuItem[] = [];
    const live = !message.deleted;
    if (live && room.sendState === 'none') {
      items.push({
        key: 'reply',
        text: c('menu.reply'),
        run: () => {
          setEditing(null);
          setReply(message);
        },
      });
    }
    if (inRoom) {
      items.push(
        ...forwardItem(message, g('forward.menu'), () => setDialog({ kind: 'forward', message })),
      );
    }
    if (live && message.body) {
      items.push({
        key: 'copy',
        text: c('menu.copy'),
        run: () => {
          void navigator.clipboard.writeText(message.body).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        },
      });
    }
    if (message.canEdit && inRoom) {
      items.push({
        key: 'edit',
        text: c('menu.edit'),
        run: () => {
          setReply(null);
          setEditing(message);
        },
      });
    }
    if (message.mine && live) {
      items.push({
        key: 'deleteAll',
        text: c('menu.deleteAll'),
        run: () => setDialog({ kind: 'deleteAll', message }),
      });
    }
    if (inRoom) {
      items.push({
        key: 'deleteMine',
        text: c('menu.deleteMine'),
        run: () => setDialog({ kind: 'deleteMine', message }),
      });
    }
    if (!message.mine && message.senderId && live && inRoom) {
      items.push({
        key: 'report',
        text: c('menu.report'),
        run: () => setDialog({ kind: 'report', message }),
      });
    }
    if (room.canModerate) {
      if (live) {
        const isPinned = pinned.has(message.id);
        items.push({
          key: isPinned ? 'unpin' : 'pin',
          text: t(isPinned ? 'menu.unpin' : 'menu.pin'),
          run: () =>
            void act(() =>
              isPinned
                ? call(() =>
                    api.DELETE('/api/v1/chat/rooms/{id}/pins/{messageId}', {
                      params: { path: { id, messageId: message.id } },
                    }),
                  )
                : call(() =>
                    api.POST('/api/v1/chat/rooms/{id}/pins/{messageId}', {
                      params: { path: { id, messageId: message.id } },
                    }),
                  ),
            ),
        });
        if (!message.mine) {
          items.push({
            key: 'modRemove',
            text: t('menu.remove'),
            danger: true,
            run: () => setDialog({ kind: 'modRemove', message }),
          });
        }
      }
      if (!message.mine && message.senderId) {
        items.push({
          key: 'modRemovePerson',
          text: t('menu.removePerson'),
          danger: true,
          run: () => setDialog({ kind: 'modRemovePerson', message }),
        });
        items.push({
          key: 'modBan',
          text: t('menu.banPerson'),
          danger: true,
          run: () => setDialog({ kind: 'modBan', message }),
        });
      }
    }
    return items;
  };

  const lines = messages.map((message, index) => ({
    message,
    day:
      index === 0 || dayKey(messages[index - 1]!.createdAt) !== dayKey(message.createdAt)
        ? format.dateTime(new Date(message.createdAt), { dateStyle: 'full' })
        : null,
  }));
  const cannot =
    room.sendState === 'locked' && room.lockedUntil
      ? t('room.cannot.lockedUntil', {
          when: format.dateTime(new Date(room.lockedUntil), {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        })
      : room.sendState === 'none'
        ? ''
        : t(`room.cannot.${room.sendState}`);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border p-3">
        <Link href="/chat/rooms" className={`${chatLink} text-sm md:hidden`}>
          {t('room.back')}
        </Link>
        <RoomPicture room={room} name={name} size="size-9" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold" data-testid="room-name">
            {name}
          </h2>
          <p className="truncate text-xs text-text-muted" data-testid="room-members">
            {t('list.members', { count: room.memberCount })}
            {room.inviteOnly && ` · ${g('room.inviteOnly')}`}
            {room.locked && ` · ${t('list.locked')}`}
            {room.archived && ` · ${t('list.archived')}`}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="text-sm"
          onClick={() => setDialog({ kind: 'details' })}
        >
          {t('room.details')}
        </Button>
      </header>

      {!mayRead ? (
        <div className="flex flex-1 flex-col items-start gap-4 p-6" data-testid="room-join">
          {text.description(room) && <p dir="auto">{text.description(room)}</p>}
          {left && <Alert tone="warning">{t('room.left')}</Alert>}
          {room.banned ? (
            <Alert tone="warning">{t('join.banned')}</Alert>
          ) : room.archived ? (
            <Alert>{t('room.cannot.archived')}</Alert>
          ) : (
            <>
              <p className="text-text-muted">{t('join.notJoined')}</p>
              <Button type="button" onClick={() => setDialog({ kind: 'join' })}>
                {t('browse.join')}
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          {pins.length > 0 && (
            <details className="border-b border-border bg-surface-muted px-4 py-2 text-sm">
              <summary className="cursor-pointer font-semibold" data-testid="pins-summary">
                {t('room.pinned')} ({pins.length})
              </summary>
              <ul data-testid="pins" className="mt-2 flex flex-col gap-2">
                {pins.map(({ message }) => (
                  <li key={message.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-xs text-text-muted">
                        {personLabel(message.sender)}
                        {' · '}
                        {time(message.createdAt)}
                      </span>
                      <span dir="auto" className="block break-words">
                        {message.body}
                      </span>
                    </span>
                    {room.canModerate && (
                      <Button
                        type="button"
                        variant="link"
                        className="shrink-0"
                        onClick={() =>
                          void act(() =>
                            call(() =>
                              api.DELETE('/api/v1/chat/rooms/{id}/pins/{messageId}', {
                                params: { path: { id, messageId: message.id } },
                              }),
                            ),
                          )
                        }
                      >
                        {t('menu.unpin')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div
            ref={scroller}
            onScroll={onScroll}
            role="log"
            aria-label={t('room.log', { name })}
            tabIndex={0}
            data-testid="message-log"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
          >
            {hasMore && (
              <div className="text-center">
                <Button type="button" variant="link" onClick={() => void loadEarlier()}>
                  {t('room.earlier')}
                </Button>
              </div>
            )}
            {messages.length === 0 && <p className="m-auto text-text-muted">{t('room.empty')}</p>}
            {lines.map(({ message, day }) => {
              const folded = message.senderBlocked && !shown.includes(message.id);
              return (
                <div key={message.id} className="flex flex-col gap-2">
                  {day && (
                    <p className="self-center rounded-full bg-surface-muted px-3 py-1 text-xs text-text-muted">
                      {day}
                    </p>
                  )}
                  <div
                    data-testid="message"
                    data-mine={message.mine}
                    data-seq={message.seq}
                    data-announcement={message.announcement}
                    className={`flex items-start gap-2 ${message.mine ? 'flex-row-reverse' : ''} ${
                      message.seq === at
                        ? 'rounded-lg outline outline-2 outline-offset-2 outline-primary'
                        : ''
                    }`}
                  >
                    {!message.mine && <Avatar person={message.sender} size="size-8" />}
                    <div
                      className={`max-w-[80%] min-w-0 rounded-lg border px-3 py-2 ${
                        message.announcement
                          ? 'border-warning-700/40 bg-warning-100'
                          : message.mine
                            ? 'border-brand-200 bg-brand-50'
                            : 'border-border bg-surface-muted'
                      }`}
                    >
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="font-semibold" data-testid="sender">
                          {message.mine ? t('room.you') : personLabel(message.sender)}
                        </span>
                        {message.announcement && (
                          <span className="font-semibold text-warning-700">
                            {t('room.announcement')}
                          </span>
                        )}
                      </p>
                      {message.replyTo && !folded && (
                        <p className="my-1 border-s-2 border-primary ps-2 text-sm text-text-muted">
                          <span className="block font-semibold">
                            {t('room.replyTo', { name: senderOf(message.replyTo) })}
                          </span>
                          <span dir="auto" className="block truncate">
                            {message.replyTo.deleted ? t('room.deleted') : message.replyTo.body}
                          </span>
                        </p>
                      )}
                      {message.deleted ? (
                        <p className="italic text-text-muted">
                          {message.removedByModerator ? t('room.removed') : t('room.deleted')}
                        </p>
                      ) : folded ? (
                        <p className="text-sm text-text-muted">
                          {t('room.blocked')}{' '}
                          <Button
                            type="button"
                            variant="link"
                            onClick={() => setShown((current) => [...current, message.id])}
                          >
                            {t('room.showBlocked')}
                          </Button>
                        </p>
                      ) : (
                        <MessageText message={message} />
                      )}
                      <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-text-muted">
                        {message.editedAt && !message.deleted && <span>{t('room.edited')}</span>}
                        <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
                      </p>
                      {!folded && (
                        <ReactionChips
                          reactions={message.reactions}
                          onToggle={
                            message.deleted || !inRoom
                              ? null
                              : (reaction, on) => void react(message, reaction, on)
                          }
                        />
                      )}
                    </div>
                    <MessageMenu
                      mine={message.mine}
                      items={menuItems(message)}
                      onReact={
                        message.deleted || !inRoom
                          ? undefined
                          : (reaction) =>
                              void react(
                                message,
                                reaction,
                                !message.reactions.some((x) => x.reaction === reaction && x.mine),
                              )
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p aria-live="polite" className="min-h-6 px-4 text-sm text-text-muted">
            {typingText || (copied ? c('menu.copied') : '')}
          </p>

          {at !== null && <NewestLink href={`/chat/rooms/${id}`} />}
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {actionError !== null && <Alert tone="error">{errorMessage(actionError, all)}</Alert>}
            {room.sendState === 'none' ? (
              <Composer
                key={editing?.id ?? 'new'}
                initial={editing?.body ?? ''}
                banner={
                  editing
                    ? c('composer.editing')
                    : reply
                      ? c('composer.replying', { name: senderOf(reply) })
                      : null
                }
                saving={editing !== null}
                onCancel={() => {
                  setEditing(null);
                  setReply(null);
                }}
                onSend={send}
                onTyping={editing ? null : signalTyping}
                suggest={editing ? undefined : suggest}
                attach={!editing}
                extra={
                  room.role === 'MODERATOR' && !editing ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={announcement}
                        onChange={(event) => setAnnouncement(event.target.checked)}
                      />
                      <span>{t('composer.announcement')}</span>
                    </label>
                  ) : null
                }
              />
            ) : room.sendState === 'notJoined' ? (
              // Staff reading a room they are not in.
              <Alert>{t('room.cannot.notJoined')}</Alert>
            ) : (
              <Alert tone="warning">{cannot}</Alert>
            )}
          </div>
        </>
      )}

      {dialog?.kind === 'join' && (
        <ConfirmDialog
          title={t('join.title', { name })}
          confirmLabel={t('join.confirm')}
          tone="primary"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await call(() =>
              api.POST('/api/v1/chat/rooms/{id}/join', { params: { path: { id } } }),
            );
            // The whole room is loaded afresh, now that it may be read.
            window.location.reload();
          }}
        >
          {t('join.text')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'leave' && (
        <ConfirmDialog
          title={t('leave.title', { name })}
          confirmLabel={t('leave.confirm')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await call(() =>
              api.POST('/api/v1/chat/rooms/{id}/leave', { params: { path: { id } } }),
            );
            router.push('/chat/rooms');
          }}
        >
          {t('leave.text')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'deleteAll' && (
        <ConfirmDialog
          title={c('confirm.deleteAllTitle')}
          confirmLabel={c('confirm.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await call(() =>
              api.DELETE('/api/v1/chat/messages/{id}', {
                params: { path: { id: dialog.message.id } },
              }),
            );
            await reloadOne(dialog.message.seq);
          }}
        >
          {c('confirm.deleteAllText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'deleteMine' && (
        <ConfirmDialog
          title={c('confirm.deleteMineTitle')}
          confirmLabel={c('confirm.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await call(() =>
              api.POST('/api/v1/chat/messages/{id}/hide', {
                params: { path: { id: dialog.message.id } },
              }),
            );
            setMessages((current) => current.filter((m) => m.id !== dialog.message.id));
          }}
        >
          {c('confirm.deleteMineText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'modRemove' && (
        <ConfirmDialog
          title={t('moderate.removeMessageTitle')}
          confirmLabel={t('moderate.remove')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await call(() =>
              api.DELETE('/api/v1/chat/rooms/{id}/messages/{messageId}', {
                params: { path: { id, messageId: dialog.message.id } },
              }),
            );
            await reloadOne(dialog.message.seq);
            await loadPins();
          }}
        >
          {t('moderate.removeMessageText')}
        </ConfirmDialog>
      )}
      {(dialog?.kind === 'modRemovePerson' || dialog?.kind === 'modBan') &&
        dialog.message.senderId && (
          <PersonAction
            roomId={id}
            userId={dialog.message.senderId}
            name={personLabel(dialog.message.sender)}
            ban={dialog.kind === 'modBan'}
            onClose={() => setDialog(null)}
            onDone={() => void loadRoom()}
          />
        )}
      {dialog?.kind === 'report' && (
        <ReportDialog
          target={{ messageId: dialog.message.id }}
          name={personLabel(dialog.message.sender)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'forward' && (
        <ForwardDialog message={dialog.message} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'reportRoom' && (
        <ReportDialog target={{ roomId: id }} name={name} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'search' && (
        <MessageSearchDialog conversationId={id} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'details' && (
        <RoomDetails
          room={room}
          name={name}
          onClose={() => setDialog(null)}
          onOpen={(kind) => setDialog({ kind })}
          onChanged={async () => {
            await loadRoom();
          }}
        />
      )}
    </>
  );
}

/** A moderator removes a person from the room, or bans them from it, with a reason. */
function PersonAction({
  roomId,
  userId,
  name,
  ban,
  onClose,
  onDone,
}: {
  roomId: string;
  userId: string;
  name: string;
  ban: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const all = useTranslations();
  const t = useTranslations('rooms.moderate');
  const { api, call } = useAuth();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const daysValid =
    days.trim() === '' || (/^\d{1,3}$/.test(days.trim()) && +days >= 1 && +days <= 365);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (ban) {
        await call(() =>
          api.POST('/api/v1/chat/rooms/{id}/bans', {
            params: { path: { id: roomId } },
            body: { userId, reason: reason.trim(), days: days.trim() ? Number(days) : null },
          }),
        );
      } else {
        await call(() =>
          api.POST('/api/v1/chat/rooms/{id}/members/{userId}/remove', {
            params: { path: { id: roomId, userId } },
            body: { reason: reason.trim() },
          }),
        );
      }
      onDone();
      onClose();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <Modal
      title={ban ? t('banTitle', { name }) : t('removePersonTitle', { name })}
      closeLabel={t('cancel')}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">{ban ? t('banText') : t('removePersonText')}</p>
        {ban && (
          <TextField
            label={t('days')}
            hint={t('daysHint')}
            inputMode="numeric"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            maxLength={3}
            className="max-w-xs"
          />
        )}
        <TextareaField
          label={t('reason')}
          hint={t('reasonHint')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
          rows={2}
        />
        {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            variant="danger"
            pending={pending}
            disabled={reason.trim().length < 3 || !daysValid}
          >
            {ban ? t('ban') : t('remove')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** About the room: who is in it, the reader's own settings, and the moderator's tools. */
function RoomDetails({
  room,
  name,
  onClose,
  onOpen,
  onChanged,
}: {
  room: RoomDetail;
  name: string;
  onClose: () => void;
  onOpen: (kind: 'search' | 'leave' | 'reportRoom') => void;
  onChanged: () => Promise<void>;
}) {
  const all = useTranslations();
  const t = useTranslations('rooms');
  const g = useTranslations('groups');
  const format = useFormatter();
  const text = useRoomText();
  const router = useRouter();
  const { api, call } = useAuth();
  const [members, setMembers] = useState<Members | null>(null);
  const [bans, setBans] = useState<Bans | null>(null);
  const [lockFor, setLockFor] = useState('open');
  const [error, setError] = useState<unknown>(null);
  const id = room.id;
  const inRoom = room.role !== 'NONE';
  const mayRead = inRoom || room.canModerate;

  useEffect(() => {
    if (!mayRead) return;
    let active = true;
    call(() => api.GET('/api/v1/chat/rooms/{id}/members', { params: { path: { id } } }))
      .then((result) => active && setMembers(result))
      .catch((caught: unknown) => active && setError(caught));
    if (room.canModerate) {
      call(() => api.GET('/api/v1/chat/rooms/{id}/bans', { params: { path: { id } } }))
        .then((result) => active && setBans(result.items))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [api, call, id, mayRead, room.canModerate]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    }
  }

  async function moreMembers() {
    if (!members) return;
    const next = await call(() =>
      api.GET('/api/v1/chat/rooms/{id}/members', {
        params: { path: { id }, query: { page: members.page + 1 } },
      }),
    );
    setMembers({ ...next, items: [...members.items, ...next.items] });
  }

  const personLabel = (person: { firstName: string | null; lastName: string | null }) =>
    personName(person) ?? t('room.unknownPerson');
  const row = 'block w-full rounded px-3 py-2 text-start hover:bg-surface-muted';
  const description = text.description(room);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <Modal title={t('details.title')} closeLabel={t('details.close')} onClose={onClose}>
      <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-3">
          <RoomPicture room={room} name={name} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="text-sm text-text-muted">
              {[
                room.category ? text.category(room.category) : null,
                t('list.members', { count: room.memberCount }),
                t('details.created', { when: date(room.createdAt) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        {description && <p dir="auto">{description}</p>}
        {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}

        <section aria-labelledby="room-moderators">
          <h3 id="room-moderators" className="font-semibold">
            {t('details.moderators')}
          </h3>
          {room.moderators.length === 0 ? (
            <p className="text-sm text-text-muted">{t('details.noModerators')}</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-2 text-sm">
              {room.moderators.map((person) => (
                <li key={person.id} className="rounded-full bg-surface-muted px-3 py-1">
                  {personLabel(person)}
                </li>
              ))}
            </ul>
          )}
        </section>

        {members && (
          <section aria-labelledby="room-people">
            <h3 id="room-people" className="font-semibold">
              {t('details.members')} ({members.total})
            </h3>
            <ul data-testid="room-people" className="mt-1 flex flex-col gap-1 text-sm">
              {members.items.map((person) => (
                <li key={person.id} className="flex items-center gap-2">
                  <Avatar person={person} size="size-7" />
                  {person.listed && person.id ? (
                    <Link href={`/members/${person.id}`} className={chatLink}>
                      {personLabel(person)}
                    </Link>
                  ) : (
                    <span>{personLabel(person)}</span>
                  )}
                  {person.role === 'MODERATOR' && (
                    <span className="text-xs text-text-muted">{t('room.moderator')}</span>
                  )}
                </li>
              ))}
            </ul>
            {members.items.length < members.total && (
              <Button type="button" variant="link" onClick={() => void moreMembers()}>
                {t('details.moreMembers')}
              </Button>
            )}
          </section>
        )}

        {inRoom && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-mute" className="font-semibold">
              {t('details.muteLabel')}
            </label>
            <select
              id="room-mute"
              value={room.muted ? (room.mutedUntil ? 'timed' : 'forever') : 'off'}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'off' || value === '8h' || value === 'week' || value === 'forever') {
                  void run(() =>
                    call(() =>
                      api.PATCH('/api/v1/chat/rooms/{id}/me', {
                        params: { path: { id } },
                        body: { mute: value },
                      }),
                    ),
                  );
                }
              }}
              className="rounded-md border border-neutral-400 bg-surface px-3 py-2.5 text-base text-text"
            >
              <option value="off">{t('details.muteOff')}</option>
              {room.muted && room.mutedUntil && (
                <option value="timed">
                  {t('details.mutedUntil', {
                    when: format.dateTime(new Date(room.mutedUntil), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </option>
              )}
              <option value="8h">{t('details.mute8h')}</option>
              <option value="week">{t('details.muteWeek')}</option>
              <option value="forever">{t('details.muteForever')}</option>
            </select>
          </div>
        )}

        <ul className="flex flex-col border-t border-border pt-2">
          {mayRead && (
            <li>
              <button type="button" className={row} onClick={() => onOpen('search')}>
                {t('details.search')}
              </button>
            </li>
          )}
          {inRoom && (
            <li>
              <button
                type="button"
                className={row}
                onClick={() =>
                  void run(() =>
                    call(() =>
                      api.PATCH('/api/v1/chat/rooms/{id}/me', {
                        params: { path: { id } },
                        body: { pinned: !room.pinned },
                      }),
                    ),
                  )
                }
              >
                {room.pinned ? g('details.unpin') : g('details.pin')}
              </button>
            </li>
          )}
          {inRoom && (
            <li>
              <button
                type="button"
                className={row}
                onClick={() =>
                  void run(() =>
                    call(() =>
                      api.PATCH('/api/v1/chat/rooms/{id}/me', {
                        params: { path: { id } },
                        body: { markedUnread: true },
                      }),
                    ),
                  ).then((done) => {
                    // Leaving the room's page, or opening it would read it again at once.
                    if (done) router.push('/chat/rooms');
                  })
                }
              >
                {t('details.markUnread')}
              </button>
            </li>
          )}
          {inRoom && (
            <li>
              <button type="button" className={row} onClick={() => onOpen('leave')}>
                {t('details.leave')}
              </button>
            </li>
          )}
          {!room.archived && (
            <li>
              <button
                type="button"
                className={`${row} text-danger-700`}
                onClick={() => onOpen('reportRoom')}
              >
                {t('details.report')}
              </button>
            </li>
          )}
        </ul>

        {room.canModerate && (
          <section
            aria-labelledby="room-moderation"
            data-testid="room-moderation"
            className="flex flex-col gap-3 border-t border-border pt-3"
          >
            <h3 id="room-moderation" className="font-semibold">
              {t('moderate.title')}
            </h3>
            {room.inviteOnly && !room.archived && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-text-muted">{g('room.inviteNote')}</p>
                <InvitePanel conversationId={id} kind="rooms" title={g('room.invite')} />
              </div>
            )}
            {room.locked ? (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void run(() =>
                      call(() =>
                        api.POST('/api/v1/chat/rooms/{id}/unlock', { params: { path: { id } } }),
                      ),
                    )
                  }
                >
                  {t('moderate.unlock')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="room-lock-for" className="text-sm font-semibold">
                    {t('moderate.lockFor')}
                  </label>
                  <select
                    id="room-lock-for"
                    value={lockFor}
                    onChange={(event) => setLockFor(event.target.value)}
                    className="rounded-md border border-neutral-400 bg-surface px-3 py-2 text-base text-text"
                  >
                    <option value="open">{t('moderate.lockOpen')}</option>
                    <option value="60">{t('moderate.lock1h')}</option>
                    <option value="1440">{t('moderate.lock1d')}</option>
                  </select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void run(() =>
                      call(() =>
                        api.POST('/api/v1/chat/rooms/{id}/lock', {
                          params: { path: { id } },
                          body: { minutes: lockFor === 'open' ? null : Number(lockFor) },
                        }),
                      ),
                    )
                  }
                >
                  {t('moderate.lock')}
                </Button>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold">{t('moderate.bans')}</h4>
              {bans?.filter((ban) => ban.active).length ? (
                <ul data-testid="room-bans" className="mt-1 flex flex-col gap-1 text-sm">
                  {bans
                    .filter((ban) => ban.active)
                    .map((ban) => (
                      <li key={ban.id} className="flex items-center justify-between gap-3">
                        <span>
                          {personLabel(ban.user)}{' '}
                          <span className="text-text-muted">
                            {ban.endsAt
                              ? t('moderate.banUntil', { when: date(ban.endsAt) })
                              : t('moderate.banOpen')}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          aria-label={t('moderate.liftName', { name: personLabel(ban.user) })}
                          onClick={() =>
                            void run(() =>
                              call(() =>
                                api.POST('/api/v1/chat/rooms/{id}/bans/{banId}/lift', {
                                  params: { path: { id, banId: ban.id } },
                                }),
                              ),
                            ).then(
                              (done) =>
                                done &&
                                setBans(
                                  (current) => current?.filter((x) => x.id !== ban.id) ?? null,
                                ),
                            )
                          }
                        >
                          {t('moderate.lift')}
                        </Button>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">{t('moderate.noBans')}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
