'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { type Me, useAuth } from '@/features/auth/auth-context';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { ConfirmDialog, MessageSearchDialog, ReportDialog } from './chat-dialogs';
import { ForwardDialog, NewestLink, forwardItem, useAt, useJumpTo } from './chat-extras';
import {
  type ConversationDetail,
  type Message,
  type MessageStatus,
  type Reaction,
  dayKey,
  mergeMessages,
  messageStatus,
} from './chat-model';
import { Avatar, type Subscribe, chatLink, usePersonLabel } from './chat-parts';
import {
  ActivityMark,
  Composer,
  type MenuItem,
  MessageMenu,
  MessageText,
  ReactionChips,
  useActivity,
} from './message-parts';
import { Modal } from './modal';
import { PersonMark } from '@/features/verification/person-mark';

type Dialog =
  | { kind: 'deleteAll' | 'deleteMine' | 'report' | 'forward'; message: Message }
  | { kind: 'details' | 'search' | 'block' | 'reportPerson' };

const TYPING_SHOWN_MS = 4000;
/** Close enough to the end to follow new messages down. */
const NEAR_END_PX = 80;

/** One conversation: its messages, live, and the composer. */
export function ConversationView({
  id,
  me,
  subscribe,
}: {
  id: string;
  me: Me;
  subscribe: Subscribe;
}) {
  const all = useTranslations();
  const t = useTranslations('chat');
  const r = useTranslations('rooms.room');
  const format = useFormatter();
  const label = usePersonLabel();
  const g = useTranslations('groups');
  const { api, call } = useAuth();
  /** Opened at an earlier message: the messages around it are shown, and new ones not followed. */
  const at = useAt();
  const detached = useRef(false);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  /** The view follows new messages while the reader is at the end. */
  const atEnd = useRef(true);
  /** The height before earlier messages were added, so the view stays where it was. */
  const heightBefore = useRef<number | null>(null);
  const loadingEarlier = useRef(false);
  const lastSeq = useRef(0);

  useEffect(() => {
    lastSeq.current = messages.at(-1)?.seq ?? 0;
  }, [messages]);

  const loadConversation = useCallback(async () => {
    try {
      setConversation(
        await call(() => api.GET('/api/v1/chat/conversations/{id}', { params: { path: { id } } })),
      );
    } catch (caught) {
      setError(caught);
    }
  }, [api, call, id]);

  /** Reads everything, when the reader is actually looking. */
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible' || detached.current) return;
    call(() =>
      api.POST('/api/v1/chat/conversations/{id}/read', { params: { path: { id } }, body: {} }),
    ).catch(() => undefined);
  }, [api, call, id]);

  /** Fetches what came after the newest message the page has. */
  const catchUp = useCallback(async () => {
    if (detached.current) return;
    try {
      for (;;) {
        const page = await call(() =>
          api.GET('/api/v1/chat/conversations/{id}/messages', {
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

  /** One message changed: fetch it again; if it is gone for the reader, drop it. */
  const reloadOne = useCallback(
    async (seq: number) => {
      try {
        const page = await call(() =>
          api.GET('/api/v1/chat/conversations/{id}/messages', {
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

  // Opening the conversation: its details and its newest messages, and it counts as read.
  useEffect(() => {
    let active = true;
    detached.current = at !== null;
    atEnd.current = at === null;
    Promise.all([
      call(() => api.GET('/api/v1/chat/conversations/{id}', { params: { path: { id } } })),
      call(() =>
        api.GET('/api/v1/chat/conversations/{id}/messages', {
          params: { path: { id }, query: at === null ? {} : { around: at } },
        }),
      ),
    ])
      .then(([detail, page]) => {
        if (!active) return;
        setConversation(detail);
        setMessages(page.items);
        setHasMore(page.hasMore);
        markRead();
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id, markRead, at]);

  useJumpTo(at, messages.length > 0, scroller);
  const activity = useActivity(conversation?.other.id ? [conversation.other.id] : [], subscribe);

  // Live events.
  useEffect(() => {
    let timer: number | undefined;
    const stop = subscribe((event) => {
      if (event.type === 'refresh') {
        void catchUp();
        void loadConversation();
        return;
      }
      if (event.conversationId !== id) return;
      switch (event.type) {
        case 'message.new':
          setTyping(false);
          void catchUp().then(() => {
            markRead();
            void loadConversation();
          });
          break;
        case 'message.edited':
        case 'message.deleted':
          if (event.seq !== undefined) void reloadOne(event.seq);
          break;
        case 'markers':
          void loadConversation();
          break;
        case 'typing':
          if (event.userId === me.id) break;
          setTyping(true);
          window.clearTimeout(timer);
          timer = window.setTimeout(() => setTyping(false), TYPING_SHOWN_MS);
          break;
        default:
      }
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [subscribe, id, me.id, catchUp, loadConversation, markRead, reloadOne]);

  // Coming back to the tab reads what arrived meanwhile.
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      markRead();
      void loadConversation();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [markRead, loadConversation]);

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
  }, [messages, typing]);

  async function loadEarlier() {
    const first = messages[0];
    if (!first || !hasMore || loadingEarlier.current) return;
    loadingEarlier.current = true;
    try {
      const page = await call(() =>
        api.GET('/api/v1/chat/conversations/{id}/messages', {
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

  async function send(text: string, _mentions: string[], attachmentIds: string[]) {
    if (editing) {
      const edited = await call(() =>
        api.PATCH('/api/v1/chat/messages/{id}', {
          params: { path: { id: editing.id } },
          body: { body: text },
        }),
      );
      setMessages((current) => mergeMessages(current, [edited]));
      setEditing(null);
      return;
    }
    const sent = await call(() =>
      api.POST('/api/v1/chat/conversations/{id}/messages', {
        params: { path: { id }, header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: {
          body: text,
          ...(reply ? { replyToId: reply.id } : {}),
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        },
      }),
    );
    atEnd.current = true;
    lastSeq.current = Math.max(lastSeq.current, sent.seq);
    setMessages((current) => mergeMessages(current, [sent]));
    setReply(null);
    void loadConversation();
  }

  /** Adds or takes back a reaction; the answer is the message as it is now. */
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

  const signalTyping = useCallback(() => {
    call(() =>
      api.POST('/api/v1/chat/conversations/{id}/typing', { params: { path: { id } } }),
    ).catch(() => undefined);
  }, [api, call, id]);

  /** An action from a menu or the details; its error is shown above the composer. */
  async function act(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await loadConversation();
    } catch (caught) {
      setActionError(caught);
    }
  }

  if (error !== null && !conversation) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Link href="/chat" className={chatLink}>
          {t('conversation.back')}
        </Link>
        <Alert tone="error">{errorMessage(error, all)}</Alert>
      </div>
    );
  }
  if (!conversation) {
    return (
      <p role="status" className="p-6">
        {all('membership.common.loading')}
      </p>
    );
  }

  const other = conversation.other;
  const name = label(other);
  const canReply = conversation.sendState === 'none';
  /** What the reader may do with a message; nothing else is listed. */
  const menuItems = (message: Message): MenuItem[] => {
    const items: MenuItem[] = [];
    if (!message.deleted && canReply) {
      items.push({
        key: 'reply',
        text: t('menu.reply'),
        run: () => {
          setEditing(null);
          setReply(message);
        },
      });
    }
    items.push(
      ...forwardItem(message, g('forward.menu'), () => setDialog({ kind: 'forward', message })),
    );
    if (!message.deleted && message.body) {
      items.push({
        key: 'copy',
        text: t('menu.copy'),
        run: () => {
          void navigator.clipboard.writeText(message.body).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        },
      });
    }
    if (message.canEdit) {
      items.push({
        key: 'edit',
        text: t('menu.edit'),
        run: () => {
          setReply(null);
          setEditing(message);
        },
      });
    }
    if (message.mine && !message.deleted) {
      items.push({
        key: 'deleteAll',
        text: t('menu.deleteAll'),
        run: () => setDialog({ kind: 'deleteAll', message }),
      });
    }
    items.push({
      key: 'deleteMine',
      text: t('menu.deleteMine'),
      run: () => setDialog({ kind: 'deleteMine', message }),
    });
    if (!message.mine && message.senderId && !message.deleted) {
      items.push({
        key: 'report',
        text: t('menu.report'),
        run: () => setDialog({ kind: 'report', message }),
      });
    }
    return items;
  };
  const sender = (message: Pick<Message, 'senderId'>) =>
    message.senderId === me.id ? t('conversation.you') : name;
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short' });
  const lines: { message: Message; day: string | null }[] = messages.map((message, index) => ({
    message,
    day:
      index === 0 || dayKey(messages[index - 1]!.createdAt) !== dayKey(message.createdAt)
        ? format.dateTime(new Date(message.createdAt), { dateStyle: 'full' })
        : null,
  }));

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border p-3">
        <Link href="/chat" className={`${chatLink} text-sm md:hidden`}>
          {t('conversation.back')}
        </Link>
        <Avatar person={other} size="size-9" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold" data-testid="chat-with">
            {name}
          </h2>
          <PersonMark mark={other.mark} />
          {other.id && <ActivityMark activity={activity.get(other.id)} />}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="text-sm"
          onClick={() => setDialog({ kind: 'details' })}
        >
          {t('conversation.details')}
        </Button>
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-label={t('conversation.log', { name })}
        tabIndex={0}
        data-testid="message-log"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
      >
        {hasMore && (
          <div className="text-center">
            <Button type="button" variant="link" onClick={() => void loadEarlier()}>
              {t('conversation.earlier')}
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="m-auto text-text-muted">{t('conversation.empty')}</p>
        )}
        {lines.map(({ message, day }) => (
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
              className={`flex items-start gap-1 ${message.mine ? 'flex-row-reverse' : ''} ${
                message.seq === at
                  ? 'rounded-lg outline outline-2 outline-offset-2 outline-primary'
                  : ''
              }`}
            >
              <div
                className={`max-w-[80%] min-w-0 rounded-lg border px-3 py-2 ${
                  message.mine ? 'border-brand-200 bg-brand-50' : 'border-border bg-surface-muted'
                }`}
              >
                <span className="sr-only">{sender(message)}</span>
                {message.replyTo && (
                  <p className="mb-1 border-s-2 border-primary ps-2 text-sm text-text-muted">
                    <span className="block font-semibold">
                      {t('conversation.replyTo', { name: sender(message.replyTo) })}
                    </span>
                    <span dir="auto" className="block truncate">
                      {message.replyTo.deleted ? t('conversation.deleted') : message.replyTo.body}
                    </span>
                  </p>
                )}
                {message.deleted ? (
                  <p className="italic text-text-muted">
                    {message.removedByModerator ? r('removed') : t('conversation.deleted')}
                  </p>
                ) : (
                  <MessageText message={message} />
                )}
                <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-text-muted">
                  {message.editedAt && !message.deleted && <span>{t('conversation.edited')}</span>}
                  <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
                  {message.mine && !message.deleted && (
                    <StatusMark status={messageStatus(message.seq, conversation)} />
                  )}
                </p>
                <ReactionChips
                  reactions={message.reactions}
                  onToggle={
                    message.deleted ? null : (reaction, on) => void react(message, reaction, on)
                  }
                />
              </div>
              <MessageMenu
                mine={message.mine}
                items={menuItems(message)}
                onReact={
                  message.deleted
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
        ))}
      </div>

      <p aria-live="polite" className="min-h-6 px-4 text-sm text-text-muted">
        {typing ? t('conversation.typing', { name }) : copied ? t('menu.copied') : ''}
      </p>

      {at !== null && <NewestLink href={`/chat/${id}`} />}
      <div className="flex flex-col gap-2 border-t border-border p-3">
        {actionError !== null && <Alert tone="error">{errorMessage(actionError, all)}</Alert>}
        {conversation.sendState === 'none' ? (
          <Composer
            key={editing?.id ?? 'new'}
            initial={editing?.body ?? ''}
            banner={
              editing
                ? t('composer.editing')
                : reply
                  ? t('composer.replying', { name: sender(reply) })
                  : null
            }
            saving={editing !== null}
            onCancel={() => {
              setEditing(null);
              setReply(null);
            }}
            onSend={send}
            onTyping={editing ? null : signalTyping}
            attach={!editing}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <Alert tone="warning">{t(`conversation.cannot.${conversation.sendState}`)}</Alert>
            {conversation.blockedByMe && other.id && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void act(() =>
                      call(() =>
                        api.DELETE('/api/v1/chat/blocks/{userId}', {
                          params: { path: { userId: other.id! } },
                        }),
                      ),
                    )
                  }
                >
                  {t('details.unblock')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {dialog?.kind === 'deleteAll' && (
        <ConfirmDialog
          title={t('confirm.deleteAllTitle')}
          confirmLabel={t('confirm.delete')}
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
          {t('confirm.deleteAllText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'deleteMine' && (
        <ConfirmDialog
          title={t('confirm.deleteMineTitle')}
          confirmLabel={t('confirm.delete')}
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
          {t('confirm.deleteMineText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'report' && (
        <ReportDialog
          target={{ messageId: dialog.message.id }}
          name={name}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'forward' && (
        <ForwardDialog message={dialog.message} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'reportPerson' && other.id && (
        <ReportDialog target={{ userId: other.id }} name={name} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'search' && (
        <MessageSearchDialog conversationId={id} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'block' && other.id && (
        <ConfirmDialog
          title={t('confirm.blockTitle', { name })}
          confirmLabel={t('confirm.block')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await call(() => api.POST('/api/v1/chat/blocks', { body: { userId: other.id! } }));
            await loadConversation();
          }}
        >
          {t('confirm.blockText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'details' && (
        <Details
          conversation={conversation}
          name={name}
          onClose={() => setDialog(null)}
          onOpen={(kind) => setDialog({ kind })}
          onChanged={loadConversation}
        />
      )}
    </>
  );
}

/** One tick: sent. Two: delivered. Two in the brand colour: read. */
function StatusMark({ status }: { status: MessageStatus }) {
  const t = useTranslations('chat.conversation.status');
  return (
    <span
      data-testid="message-status"
      data-status={status}
      className={`inline-flex items-center ${status === 'read' ? 'text-primary' : ''}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 16"
        className="h-3 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 9l4 4 8-10" />
        {status !== 'sent' && <path d="M11 12l1 1 8-10" />}
      </svg>
      <span className="sr-only">{t(status)}</span>
    </span>
  );
}

/** What the reader can do with the conversation as a whole. */
function Details({
  conversation,
  name,
  onClose,
  onOpen,
  onChanged,
}: {
  conversation: ConversationDetail;
  name: string;
  onClose: () => void;
  onOpen: (kind: 'search' | 'block' | 'reportPerson') => void;
  onChanged: () => Promise<void>;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.details');
  const g = useTranslations('groups.details');
  const format = useFormatter();
  const router = useRouter();
  const { api, call } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const other = conversation.other;
  const id = conversation.id;

  async function change(body: {
    mute?: 'off' | '8h' | 'week' | 'forever';
    archived?: boolean;
    markedUnread?: true;
    pinned?: boolean;
  }) {
    setError(null);
    try {
      await call(() =>
        api.PATCH('/api/v1/chat/conversations/{id}/me', { params: { path: { id } }, body }),
      );
      await onChanged();
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    }
  }

  const row = 'block w-full rounded px-3 py-2 text-start hover:bg-surface-muted';
  return (
    <Modal title={t('title')} closeLabel={t('close')} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar person={other} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          {other.listed && other.id ? (
            <Link href={`/members/${other.id}`} className={`${chatLink} text-sm`}>
              {t('profile')}
            </Link>
          ) : (
            other.id && <p className="text-sm text-text-muted">{t('notListed')}</p>
          )}
        </div>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="chat-mute" className="font-semibold">
          {t('muteLabel')}
        </label>
        <select
          id="chat-mute"
          value={conversation.muted ? (conversation.mutedUntil ? 'timed' : 'forever') : 'off'}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'off' || value === '8h' || value === 'week' || value === 'forever') {
              void change({ mute: value });
            }
          }}
          className="rounded-md border border-neutral-400 bg-surface px-3 py-2.5 text-base text-text"
        >
          <option value="off">{t('muteOff')}</option>
          {conversation.muted && conversation.mutedUntil && (
            <option value="timed">
              {t('mutedUntil', {
                when: format.dateTime(new Date(conversation.mutedUntil), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </option>
          )}
          <option value="8h">{t('mute8h')}</option>
          <option value="week">{t('muteWeek')}</option>
          <option value="forever">{t('muteForever')}</option>
        </select>
      </div>
      <ul className="flex flex-col border-t border-border pt-2">
        <li>
          <button type="button" className={row} onClick={() => onOpen('search')}>
            {t('search')}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={row}
            onClick={() => void change({ pinned: !conversation.pinned })}
          >
            {conversation.pinned ? g('unpin') : g('pin')}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={row}
            onClick={() =>
              void change({ markedUnread: true }).then((done) => {
                // Leaving the conversation, or opening it would read it again at once.
                if (done) router.push('/chat');
              })
            }
          >
            {t('markUnread')}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={row}
            onClick={() =>
              void change({ archived: !conversation.archived }).then((done) => done && onClose())
            }
          >
            {conversation.archived ? t('unarchive') : t('archive')}
          </button>
        </li>
        {other.id && (
          <>
            <li>
              {conversation.blockedByMe ? (
                <button
                  type="button"
                  className={row}
                  onClick={() => {
                    setError(null);
                    call(() =>
                      api.DELETE('/api/v1/chat/blocks/{userId}', {
                        params: { path: { userId: other.id! } },
                      }),
                    )
                      .then(onChanged)
                      .catch((caught: unknown) => setError(caught));
                  }}
                >
                  {t('unblock')}
                </button>
              ) : (
                <button
                  type="button"
                  className={`${row} text-danger-700`}
                  onClick={() => onOpen('block')}
                >
                  {t('block')}
                </button>
              )}
            </li>
            <li>
              <button
                type="button"
                className={`${row} text-danger-700`}
                onClick={() => onOpen('reportPerson')}
              >
                {t('report')}
              </button>
            </li>
          </>
        )}
      </ul>
    </Modal>
  );
}
