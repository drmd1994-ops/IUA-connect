'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { type Me, useAuth } from '@/features/auth/auth-context';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { ConfirmDialog, MessageSearchDialog, ReportDialog } from './chat-dialogs';
import { ForwardDialog, GroupMark, NewestLink, forwardItem, useAt, useJumpTo } from './chat-extras';
import {
  type Group,
  type Message,
  type Reaction,
  dayKey,
  mergeMessages,
  personName,
} from './chat-model';
import { Avatar, type Subscribe, chatLink } from './chat-parts';
import { InvitePanel } from './invite-panel';
import {
  ActivityMark,
  Composer,
  type MenuItem,
  MessageMenu,
  MessageText,
  ReactionChips,
  type Suggestion,
  useActivity,
} from './message-parts';
import { Modal } from './modal';

type Members = components['schemas']['GroupMembersDto']['items'];
type Member = Members[number];

type Dialog =
  | { kind: 'deleteAll' | 'deleteMine' | 'report' | 'forward'; message: Message }
  | { kind: 'details' | 'search' | 'leave' }
  | { kind: 'remove' | 'makeAdmin' | 'reportPerson'; person: Member };

const TYPING_SHOWN_MS = 4000;
/** Close enough to the end to follow new messages down. */
const NEAR_END_PX = 80;

/**
 * One group: its messages, live, with reactions, mentions and files, and what its admin can do
 * with it. Only the people in a group ever see this screen; for anyone else it is "not found".
 */
export function GroupView({ id, me, subscribe }: { id: string; me: Me; subscribe: Subscribe }) {
  const all = useTranslations();
  const c = useTranslations('chat');
  const r = useTranslations('rooms.room');
  const t = useTranslations('groups');
  const format = useFormatter();
  const router = useRouter();
  const { api, call } = useAuth();
  /** Opened at an earlier message: the messages around it are shown, and new ones not followed. */
  const at = useAt();
  const detached = useRef(false);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Members>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [typers, setTypers] = useState<string[]>([]);
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const heightBefore = useRef<number | null>(null);
  const loadingEarlier = useRef(false);
  const lastSeq = useRef(0);

  useEffect(() => {
    lastSeq.current = messages.at(-1)?.seq ?? 0;
  }, [messages]);

  const loadGroup = useCallback(async () => {
    try {
      const [detail, people] = await Promise.all([
        call(() => api.GET('/api/v1/chat/groups/{id}', { params: { path: { id } } })),
        call(() => api.GET('/api/v1/chat/groups/{id}/members', { params: { path: { id } } })),
      ]);
      setGroup(detail);
      setMembers(people.items);
      return detail;
    } catch (caught) {
      setError(caught);
      return null;
    }
  }, [api, call, id]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible' || detached.current) return;
    call(() =>
      api.POST('/api/v1/chat/groups/{id}/read', { params: { path: { id } }, body: {} }),
    ).catch(() => undefined);
  }, [api, call, id]);

  const catchUp = useCallback(async () => {
    if (detached.current) return;
    try {
      for (;;) {
        const page = await call(() =>
          api.GET('/api/v1/chat/groups/{id}/messages', {
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
      try {
        const page = await call(() =>
          api.GET('/api/v1/chat/groups/{id}/messages', {
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

  // Opening the group: its details, its people and its newest messages; it counts as read.
  useEffect(() => {
    let active = true;
    detached.current = at !== null;
    atEnd.current = at === null;
    void (async () => {
      const detail = await loadGroup();
      if (!active || !detail) return;
      try {
        const page = await call(() =>
          api.GET('/api/v1/chat/groups/{id}/messages', {
            params: { path: { id }, query: at === null ? {} : { around: at } },
          }),
        );
        if (!active) return;
        setMessages(page.items);
        setHasMore(page.hasMore);
        markRead();
      } catch (caught) {
        if (active) setError(caught);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, call, id, loadGroup, markRead, at]);

  useJumpTo(at, messages.length > 0, scroller);
  const activity = useActivity(
    members.flatMap((person) => (person.id && person.id !== me.id ? [person.id] : [])),
    subscribe,
  );

  // Live events.
  useEffect(() => {
    const timers = new Map<string, number>();
    const stop = subscribe((event) => {
      if (event.type === 'refresh') {
        void loadGroup().then(() => catchUp());
        return;
      }
      if (event.conversationId !== id) return;
      switch (event.type) {
        case 'message.new':
          void catchUp().then(() => {
            markRead();
            void loadGroup();
          });
          break;
        case 'message.edited':
        case 'message.deleted':
          if (event.seq !== undefined) void reloadOne(event.seq);
          break;
        case 'markers':
        case 'room':
          void loadGroup();
          break;
        case 'room.left':
          setLeft(true);
          setMessages([]);
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
  }, [subscribe, id, me.id, catchUp, loadGroup, markRead, reloadOne]);

  // Coming back to the tab reads what arrived meanwhile.
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      markRead();
      void loadGroup();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [markRead, loadGroup]);

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
        api.GET('/api/v1/chat/groups/{id}/messages', {
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
    atEnd.current =
      !detached.current && box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_END_PX;
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
      api.POST('/api/v1/chat/groups/{id}/messages', {
        params: { path: { id }, header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: {
          body,
          ...(reply ? { replyToId: reply.id } : {}),
          ...(mentions.length > 0 ? { mentions } : {}),
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        },
      }),
    );
    atEnd.current = !detached.current;
    lastSeq.current = Math.max(lastSeq.current, sent.seq);
    setMessages((current) => mergeMessages(current, [sent]));
    setReply(null);
    void loadGroup();
  }

  const signalTyping = useCallback(() => {
    call(() => api.POST('/api/v1/chat/groups/{id}/typing', { params: { path: { id } } })).catch(
      () => undefined,
    );
  }, [api, call, id]);

  const suggest = useCallback(
    async (q: string): Promise<Suggestion[]> => {
      const result = await call(() =>
        api.GET('/api/v1/chat/groups/{id}/members', { params: { path: { id }, query: { q } } }),
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

  if (error !== null && !group) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Link href="/chat" className={chatLink}>
          {t('group.back')}
        </Link>
        <Alert tone="error">{errorMessage(error, all)}</Alert>
      </div>
    );
  }
  if (!group) {
    return (
      <p role="status" className="p-6">
        {all('membership.common.loading')}
      </p>
    );
  }
  if (left) {
    return (
      <div className="flex flex-col gap-4 p-6" data-testid="group-left">
        <Link href="/chat" className={chatLink}>
          {t('group.back')}
        </Link>
        <Alert tone="warning">{t('group.left')}</Alert>
      </div>
    );
  }

  const name = group.name;
  const admin = group.role === 'ADMIN';
  const canWrite = group.sendState === 'none';
  const personLabel = (person: Message['sender']) =>
    personName(person) ?? (person.id ? r('unknownPerson') : r('deletedAccount'));
  const senderOf = (message: Pick<Message, 'senderId'>) => {
    if (message.senderId === me.id) return r('you');
    const known = members.find((person) => person.id === message.senderId);
    return known ? personLabel(known) : r('unknownPerson');
  };
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short' });
  const typingText =
    typers.length === 0
      ? ''
      : typers.length === 1
        ? r('typingOne', { name: senderOf({ senderId: typers[0]! }) })
        : r('typingMany');

  /** What the reader may do with a message; nothing else is listed. */
  const menuItems = (message: Message): MenuItem[] => {
    const items: MenuItem[] = [];
    const live = !message.deleted;
    if (live && canWrite) {
      items.push({
        key: 'reply',
        text: c('menu.reply'),
        run: () => {
          setEditing(null);
          setReply(message);
        },
      });
    }
    items.push(
      ...forwardItem(message, t('forward.menu'), () => setDialog({ kind: 'forward', message })),
    );
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
    if (message.canEdit) {
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
    items.push({
      key: 'deleteMine',
      text: c('menu.deleteMine'),
      run: () => setDialog({ kind: 'deleteMine', message }),
    });
    if (!message.mine && message.senderId && live) {
      items.push({
        key: 'report',
        text: c('menu.report'),
        run: () => setDialog({ kind: 'report', message }),
      });
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

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border p-3">
        <Link href="/chat" className={`${chatLink} text-sm md:hidden`}>
          {t('group.back')}
        </Link>
        <GroupMark name={name} size="size-9" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold" data-testid="group-name">
            {name}
          </h2>
          <p className="truncate text-xs text-text-muted" data-testid="group-people">
            {t('list.people', { count: group.memberCount })}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="text-sm"
          onClick={() => setDialog({ kind: 'details' })}
        >
          {t('group.details')}
        </Button>
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-label={t('group.log', { name })}
        tabIndex={0}
        data-testid="message-log"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
      >
        {hasMore && (
          <div className="text-center">
            <Button type="button" variant="link" onClick={() => void loadEarlier()}>
              {r('earlier')}
            </Button>
          </div>
        )}
        {messages.length === 0 && <p className="m-auto text-text-muted">{t('group.empty')}</p>}
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
                className={`flex items-start gap-2 ${message.mine ? 'flex-row-reverse' : ''} ${
                  message.seq === at
                    ? 'rounded-lg outline outline-2 outline-offset-2 outline-primary'
                    : ''
                }`}
              >
                {!message.mine && <Avatar person={message.sender} size="size-8" />}
                <div
                  className={`max-w-[80%] min-w-0 rounded-lg border px-3 py-2 ${
                    message.mine ? 'border-brand-200 bg-brand-50' : 'border-border bg-surface-muted'
                  }`}
                >
                  <p className="text-xs font-semibold" data-testid="sender">
                    {message.mine ? r('you') : personLabel(message.sender)}
                  </p>
                  {message.replyTo && !folded && (
                    <p className="my-1 border-s-2 border-primary ps-2 text-sm text-text-muted">
                      <span className="block font-semibold">
                        {r('replyTo', { name: senderOf(message.replyTo) })}
                      </span>
                      <span dir="auto" className="block truncate">
                        {message.replyTo.deleted ? r('deleted') : message.replyTo.body}
                      </span>
                    </p>
                  )}
                  {message.deleted ? (
                    <p className="italic text-text-muted">
                      {message.removedByModerator ? r('removed') : r('deleted')}
                    </p>
                  ) : folded ? (
                    <p className="text-sm text-text-muted">
                      {r('blocked')}{' '}
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setShown((current) => [...current, message.id])}
                      >
                        {r('showBlocked')}
                      </Button>
                    </p>
                  ) : (
                    <MessageText message={message} />
                  )}
                  <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-text-muted">
                    {message.editedAt && !message.deleted && <span>{r('edited')}</span>}
                    <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
                  </p>
                  {!folded && (
                    <ReactionChips
                      reactions={message.reactions}
                      onToggle={
                        message.deleted ? null : (reaction, on) => void react(message, reaction, on)
                      }
                    />
                  )}
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
          );
        })}
      </div>

      <p aria-live="polite" className="min-h-6 px-4 text-sm text-text-muted">
        {typingText || (copied ? c('menu.copied') : '')}
      </p>

      {at !== null && <NewestLink href={`/chat/groups/${id}`} />}
      <div className="flex flex-col gap-2 border-t border-border p-3">
        {actionError !== null && <Alert tone="error">{errorMessage(actionError, all)}</Alert>}
        {canWrite ? (
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
          />
        ) : (
          <Alert tone="warning">
            {t(`group.cannot.${group.sendState === 'suspended' ? 'suspended' : 'membersOnly'}`)}
          </Alert>
        )}
      </div>

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
      {dialog?.kind === 'report' && (
        <ReportDialog
          target={{ messageId: dialog.message.id }}
          name={personLabel(dialog.message.sender)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'reportPerson' && dialog.person.id && (
        <ReportDialog
          target={{ userId: dialog.person.id }}
          name={personLabel(dialog.person)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'forward' && (
        <ForwardDialog message={dialog.message} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'search' && (
        <MessageSearchDialog conversationId={id} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'leave' && (
        <ConfirmDialog
          title={t('details.leaveTitle', { name })}
          confirmLabel={t('details.leaveConfirm')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await call(() =>
              api.POST('/api/v1/chat/groups/{id}/leave', { params: { path: { id } } }),
            );
            router.push('/chat');
          }}
        >
          {admin && group.memberCount > 1 ? t('details.leaveAdminText') : t('details.leaveText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'remove' && dialog.person.id && (
        <ConfirmDialog
          title={t('details.removeTitle', { name: personLabel(dialog.person) })}
          confirmLabel={t('details.remove')}
          onClose={() => setDialog({ kind: 'details' })}
          onConfirm={async () => {
            await call(() =>
              api.POST('/api/v1/chat/groups/{id}/members/{userId}/remove', {
                params: { path: { id, userId: dialog.person.id! } },
              }),
            );
            await loadGroup();
          }}
        >
          {t('details.removeText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'makeAdmin' && dialog.person.id && (
        <ConfirmDialog
          title={t('details.makeAdminTitle', { name: personLabel(dialog.person) })}
          confirmLabel={t('details.makeAdminConfirm')}
          tone="primary"
          onClose={() => setDialog({ kind: 'details' })}
          onConfirm={async () => {
            await call(() =>
              api.POST('/api/v1/chat/groups/{id}/admin', {
                params: { path: { id } },
                body: { userId: dialog.person.id! },
              }),
            );
            await loadGroup();
          }}
        >
          {t('details.makeAdminText')}
        </ConfirmDialog>
      )}
      {dialog?.kind === 'details' && (
        <GroupDetails
          group={group}
          members={members}
          me={me}
          activity={activity}
          personLabel={personLabel}
          onClose={() => setDialog(null)}
          onOpen={setDialog}
          onChanged={async () => {
            await loadGroup();
          }}
        />
      )}
    </>
  );
}

/** About the group: its people, the reader's own settings, and what its admin can do. */
function GroupDetails({
  group,
  members,
  me,
  activity,
  personLabel,
  onClose,
  onOpen,
  onChanged,
}: {
  group: Group;
  members: Members;
  me: Me;
  activity: ReturnType<typeof useActivity>;
  personLabel: (person: Message['sender']) => string;
  onClose: () => void;
  onOpen: (dialog: Dialog) => void;
  onChanged: () => Promise<void>;
}) {
  const all = useTranslations();
  const t = useTranslations('groups');
  const d = useTranslations('rooms.details');
  const r = useTranslations('rooms.room');
  const format = useFormatter();
  const router = useRouter();
  const { api, call } = useAuth();
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<unknown>(null);
  const id = group.id;
  const admin = group.role === 'ADMIN';

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
  const change = (body: {
    mute?: 'off' | '8h' | 'week' | 'forever';
    archived?: boolean;
    markedUnread?: true;
    pinned?: boolean;
  }) =>
    run(() =>
      call(() => api.PATCH('/api/v1/chat/groups/{id}/me', { params: { path: { id } }, body })),
    );

  function rename(event: FormEvent) {
    event.preventDefault();
    void run(() =>
      call(() =>
        api.PATCH('/api/v1/chat/groups/{id}', {
          params: { path: { id } },
          body: { name: name.trim() },
        }),
      ),
    );
  }

  const row = 'block w-full rounded px-3 py-2 text-start hover:bg-surface-muted';
  return (
    <Modal title={t('details.title')} closeLabel={t('details.close')} onClose={onClose}>
      <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
        <p className="text-sm text-text-muted">
          {t('details.created', {
            when: format.dateTime(new Date(group.createdAt), { dateStyle: 'medium' }),
          })}
          {' · '}
          {t('list.people', { count: group.memberCount })}
        </p>
        <p className="text-sm text-text-muted">{t('details.staffNote')}</p>
        {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}

        {admin && (
          <form onSubmit={rename} className="flex items-end gap-3">
            <TextField
              label={t('details.rename')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="flex-1"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={name.trim().length < 2 || name.trim() === group.name}
            >
              {t('details.renameSave')}
            </Button>
          </form>
        )}

        <section aria-labelledby="group-people-title">
          <h3 id="group-people-title" className="font-semibold">
            {t('details.members')} ({members.length})
          </h3>
          <ul data-testid="group-members" className="mt-1 flex flex-col gap-2 text-sm">
            {members.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center gap-2">
                <Avatar person={person} size="size-7" />
                <span className="min-w-0 flex-1">
                  {person.listed && person.id ? (
                    <Link href={`/members/${person.id}`} className={chatLink}>
                      {personLabel(person)}
                    </Link>
                  ) : (
                    <span>{person.id === me.id ? r('you') : personLabel(person)}</span>
                  )}
                  {person.role === 'ADMIN' && (
                    <span className="ms-2 text-xs text-text-muted">{t('group.admin')}</span>
                  )}
                  {person.id && (
                    <span className="ms-2">
                      <ActivityMark activity={activity.get(person.id)} />
                    </span>
                  )}
                </span>
                {person.id && person.id !== me.id && (
                  <span className="flex flex-wrap gap-x-3">
                    {admin && (
                      <>
                        <Button
                          type="button"
                          variant="link"
                          aria-label={t('details.makeAdminName', { name: personLabel(person) })}
                          onClick={() => onOpen({ kind: 'makeAdmin', person })}
                        >
                          {t('details.makeAdmin')}
                        </Button>
                        <Button
                          type="button"
                          variant="link"
                          aria-label={t('details.removeName', { name: personLabel(person) })}
                          onClick={() => onOpen({ kind: 'remove', person })}
                        >
                          {t('details.remove')}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="link"
                      aria-label={all('chat.report.titlePerson', { name: personLabel(person) })}
                      onClick={() => onOpen({ kind: 'reportPerson', person })}
                    >
                      {all('chat.menu.report')}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {admin && (
          <section className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-sm text-text-muted">{t('create.note')}</p>
            <InvitePanel conversationId={id} kind="groups" title={t('details.invite')} />
          </section>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="group-mute" className="font-semibold">
            {t('details.muteLabel')}
          </label>
          <select
            id="group-mute"
            value={group.muted ? (group.mutedUntil ? 'timed' : 'forever') : 'off'}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'off' || value === '8h' || value === 'week' || value === 'forever') {
                void change({ mute: value });
              }
            }}
            className="rounded-md border border-neutral-400 bg-surface px-3 py-2.5 text-base text-text"
          >
            <option value="off">{d('muteOff')}</option>
            {group.muted && group.mutedUntil && (
              <option value="timed">
                {d('mutedUntil', {
                  when: format.dateTime(new Date(group.mutedUntil), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </option>
            )}
            <option value="8h">{d('mute8h')}</option>
            <option value="week">{d('muteWeek')}</option>
            <option value="forever">{d('muteForever')}</option>
          </select>
        </div>

        <ul className="flex flex-col border-t border-border pt-2">
          <li>
            <button type="button" className={row} onClick={() => onOpen({ kind: 'search' })}>
              {t('details.search')}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={row}
              onClick={() => void change({ pinned: !group.pinned })}
            >
              {group.pinned ? t('details.unpin') : t('details.pin')}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={row}
              onClick={() =>
                void change({ markedUnread: true }).then((done) => {
                  // Leaving the group's page, or opening it would read it again at once.
                  if (done) router.push('/chat');
                })
              }
            >
              {t('details.markUnread')}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={row}
              onClick={() =>
                void change({ archived: !group.archived }).then((done) => done && onClose())
              }
            >
              {group.archived ? t('details.unarchive') : t('details.archive')}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`${row} text-danger-700`}
              onClick={() => onOpen({ kind: 'leave' })}
            >
              {t('details.leave')}
            </button>
          </li>
        </ul>
      </div>
    </Modal>
  );
}
