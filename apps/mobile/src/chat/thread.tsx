import {
  type Activity,
  type Message,
  type Reaction,
  dayKey,
  mergeMessages,
  messageStatus,
} from '@medconnect/api-client/chat';
import { colors, semantic } from '@medconnect/ui-tokens';
import * as Clipboard from 'expo-clipboard';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Field, Notice } from '@/ui/kit';
import { Tag } from '@/ui/parts';
import { ThreadDetails } from './details';
import { ForwardSheet, MessageSearchSheet, ReportSheet } from './dialogs';
import { useChatEvents } from './events';
import { Attachments, Composer, MessageText, ReactionChips, ReactionPicker } from './message';
import {
  type ConversationDetail,
  type GroupDetail,
  type MessageAction,
  type RoomDetail,
  type Thread,
  type ThreadKind,
  banDays,
  canWrite,
  messageActions,
  threadPath,
  threadRoute,
} from './model';
import { Confirm, type Person, Row, Sheet, usePersonLabel, useSend } from './ui';
import { PersonMark } from '@/features/verification';

type Dialog =
  | {
      kind: 'menu' | 'deleteAll' | 'deleteMine' | 'report' | 'forward' | 'remove';
      message: Message;
    }
  | { kind: 'removePerson' | 'banPerson'; message: Message }
  | { kind: 'details' | 'pins' | 'join' | 'search' };

const TYPING_SHOWN_MS = 4000;
/** Close enough to the end to follow new messages down. */
const NEAR_END = 120;

/** One thread: a private conversation, a group or a room. Its messages, live, and the composer. */
export function ThreadScreen({
  kind,
  id,
  at = null,
}: {
  kind: ThreadKind;
  id: string;
  /** Opened at an earlier message: the messages around it are shown, and new ones not followed. */
  at?: number | null;
}) {
  const all = useTranslations();
  const t = useTranslations('chat');
  const r = useTranslations('rooms');
  const g = useTranslations('groups');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const label = usePersonLabel();
  const router = useRouter();
  const { request } = useSession();
  const send = useSend();
  const base = threadPath(kind, id);
  const detached = useRef(at !== null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pins, setPins] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [revealed, setRevealed] = useState<string[]>([]);
  const list = useRef<FlatList<Message>>(null);
  /** The view follows new messages while the reader is at the end. */
  const atEnd = useRef(at === null);
  const loadingEarlier = useRef(false);
  const lastSeq = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    lastSeq.current = messages.at(-1)?.seq ?? 0;
  }, [messages]);

  const loadThread = useCallback(async (): Promise<Thread | null> => {
    try {
      const detail = await request<ConversationDetail | GroupDetail | RoomDetail>(base);
      const next = { kind, detail } as Thread;
      setThread(next);
      return next;
    } catch (caught) {
      setError(caught);
      return null;
    }
  }, [request, base, kind]);

  const loadPins = useCallback(() => {
    if (kind !== 'room') return;
    request<{ items: { message: Message }[] }>(`${base}/pins`)
      .then((result) => setPins(result.items.map((item) => item.message)))
      .catch(() => undefined);
  }, [request, base, kind]);

  /** Reads everything, when the reader is actually looking. */
  const markRead = useCallback(() => {
    if (AppState.currentState !== 'active' || detached.current) return;
    send('POST', `${base}/read`, {}).catch(() => undefined);
  }, [send, base]);

  /** Fetches what came after the newest message the screen has. */
  const catchUp = useCallback(async () => {
    if (detached.current) return;
    try {
      for (;;) {
        const page = await request<{ items: Message[]; hasMore: boolean }>(
          `${base}/messages?after=${lastSeq.current}`,
        );
        const newest = page.items.at(-1);
        if (!newest) return;
        lastSeq.current = newest.seq;
        setMessages((current) => mergeMessages(current, page.items));
        if (!page.hasMore) return;
      }
    } catch {
      // The next event or refresh tries again.
    }
  }, [request, base]);

  /** One message changed: fetch it again; if it is gone for the reader, drop it. */
  const reloadOne = useCallback(
    async (seq: number) => {
      try {
        const page = await request<{ items: Message[] }>(
          `${base}/messages?after=${seq - 1}&limit=1`,
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
    [request, base],
  );

  // Opening the thread: who the reader is, its details and its newest messages.
  useEffect(() => {
    let active = true;
    request<{ id: string }>('/api/v1/me')
      .then((me) => active && setMeId(me.id))
      .catch(() => undefined);
    void loadThread().then(async (opened) => {
      if (!active || !opened) return;
      // A room that was not joined shows only its door.
      if (opened.kind === 'room' && opened.detail.role === 'NONE') return;
      try {
        const page = await request<{ items: Message[]; hasMore: boolean }>(
          at === null ? `${base}/messages` : `${base}/messages?around=${at}`,
        );
        if (!active) return;
        setMessages(page.items);
        setHasMore(page.hasMore);
        markRead();
        loadPins();
      } catch (caught) {
        if (active) setError(caught);
      }
    });
    return () => {
      active = false;
      clearTimeout(typingTimer.current);
    };
  }, [request, base, loadThread, markRead, loadPins, at]);

  useChatEvents((event) => {
    if (event.type === 'refresh') {
      void catchUp();
      void loadThread();
      loadPins();
      return;
    }
    if (event.conversationId !== id) return;
    switch (event.type) {
      case 'message.new':
        setTyping(false);
        void catchUp().then(() => {
          markRead();
          void loadThread();
        });
        break;
      case 'message.edited':
      case 'message.deleted':
        if (event.seq !== undefined) void reloadOne(event.seq);
        loadPins();
        break;
      case 'markers':
      case 'room':
        void loadThread();
        loadPins();
        break;
      case 'room.left':
        if (event.userId === meId) void loadThread();
        break;
      case 'activity':
        loadActivity();
        break;
      case 'typing':
        if (event.userId === meId) break;
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), TYPING_SHOWN_MS);
        break;
      default:
    }
  });

  async function loadEarlier() {
    const first = messages[0];
    if (!first || !hasMore || loadingEarlier.current) return;
    loadingEarlier.current = true;
    try {
      const page = await request<{ items: Message[]; hasMore: boolean }>(
        `${base}/messages?before=${first.seq}`,
      );
      atEnd.current = false;
      setMessages((current) => mergeMessages(current, page.items));
      setHasMore(page.hasMore);
    } catch (caught) {
      setActionError(caught);
    } finally {
      loadingEarlier.current = false;
    }
  }

  async function sendMessage(
    text: string,
    extra: { mentions: string[]; attachmentIds: string[]; announcement: boolean },
  ) {
    if (editing) {
      const edited = await send<Message>(
        'PATCH',
        `/api/v1/chat/messages/${encodeURIComponent(editing.id)}`,
        { body: text },
      );
      setMessages((current) => mergeMessages(current, [edited]));
      setEditing(null);
      return;
    }
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const sent = await request<Message>(`${base}/messages`, {
      method: 'POST',
      // Sending the same request again with the same key sends nothing new.
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({
        body: text,
        ...(reply ? { replyToId: reply.id } : {}),
        ...(extra.attachmentIds.length > 0 ? { attachmentIds: extra.attachmentIds } : {}),
        ...(kind !== 'direct' && extra.mentions.length > 0 ? { mentions: extra.mentions } : {}),
        ...(kind === 'room' && extra.announcement ? { announcement: true } : {}),
      }),
    });
    atEnd.current = true;
    lastSeq.current = Math.max(lastSeq.current, sent.seq);
    setMessages((current) => mergeMessages(current, [sent]));
    setReply(null);
    void loadThread();
  }

  /** Adds or takes back a reaction; the answer is the message as it is now. */
  async function react(message: Message, reaction: Reaction, on: boolean) {
    setActionError(null);
    try {
      const updated = await send<Message>(
        on ? 'PUT' : 'DELETE',
        `/api/v1/chat/messages/${encodeURIComponent(message.id)}/reactions/${reaction}`,
      );
      setMessages((current) => mergeMessages(current, [updated]));
    } catch (caught) {
      setActionError(caught);
    }
  }

  const findPeople = useCallback(
    async (query: string): Promise<Person[]> => {
      const result = await request<{ items: Person[] }>(
        `${base}/members?q=${encodeURIComponent(query)}`,
      );
      return result.items.filter((person) => person.id && person.id !== meId);
    },
    [request, base, meId],
  );

  const otherId = thread?.kind === 'direct' ? thread.detail.other.id : null;
  const loadActivity = useCallback(() => {
    if (!otherId) return;
    request<{ items: { activity: Activity }[] }>(
      `/api/v1/chat/activity?userIds=${encodeURIComponent(otherId)}`,
    )
      .then((result) => setActivity(result.items[0]?.activity ?? null))
      .catch(() => undefined);
  }, [request, otherId]);
  useEffect(loadActivity, [loadActivity]);

  if (error !== null && !thread) {
    return (
      <Frame>
        <View style={styles.pad}>
          <Back />
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        </View>
      </Frame>
    );
  }
  if (!thread) {
    return (
      <Frame>
        <View style={styles.pad}>
          <Back />
          <Body muted>{m('loading')}</Body>
        </View>
      </Frame>
    );
  }

  const title =
    thread.kind === 'direct'
      ? label(thread.detail.other)
      : thread.kind === 'group'
        ? thread.detail.name
        : locale === 'en'
          ? (thread.detail.nameEn ?? thread.detail.nameHe)
          : thread.detail.nameHe;
  const room = thread.kind === 'room' ? thread.detail : null;
  const outside = room?.role === 'NONE';
  const writable = canWrite(thread);
  const senderName = (message: Pick<Message, 'senderId'> & { sender?: Person }) =>
    message.senderId === meId
      ? t('conversation.you')
      : thread.kind === 'direct'
        ? title
        : message.sender
          ? label(message.sender)
          : r('room.unknownPerson');
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short' });
  const pinnedIds = pins.map((message) => message.id);
  const actionsFor = (message: Message) =>
    messageActions(message, {
      kind,
      canWrite: writable,
      canModerate: room?.canModerate ?? false,
      pinned: pinnedIds.includes(message.id),
    });
  const actionLabel: Record<MessageAction, string> = {
    reply: t('menu.reply'),
    forward: g('forward.menu'),
    copy: t('menu.copy'),
    edit: t('menu.edit'),
    deleteAll: t('menu.deleteAll'),
    deleteMine: t('menu.deleteMine'),
    report: t('menu.report'),
    pin: r('menu.pin'),
    unpin: r('menu.unpin'),
    remove: r('menu.remove'),
    removePerson: r('menu.removePerson'),
    banPerson: r('menu.banPerson'),
  };

  function run(action: MessageAction, message: Message) {
    setDialog(null);
    switch (action) {
      case 'reply':
        setEditing(null);
        setReply(message);
        break;
      case 'edit':
        setReply(null);
        setEditing(message);
        break;
      case 'pin':
      case 'unpin':
        setActionError(null);
        send(action === 'pin' ? 'POST' : 'DELETE', `${base}/pins/${encodeURIComponent(message.id)}`)
          .then(loadPins)
          .catch((caught: unknown) => setActionError(caught));
        break;
      case 'copy':
        void Clipboard.setStringAsync(message.body).catch(() => undefined);
        break;
      default:
        setDialog({ kind: action, message });
    }
  }

  const cannot = (): string => {
    const state = thread.detail.sendState;
    if (thread.kind === 'direct') return t(`conversation.cannot.${state}`);
    if (thread.kind === 'group') return g(`group.cannot.${state}`);
    if (state === 'locked' && thread.detail.lockedUntil) {
      return r('room.cannot.lockedUntil', {
        when: format.dateTime(new Date(thread.detail.lockedUntil), {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      });
    }
    return r(`room.cannot.${state}`);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    atEnd.current = contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_END;
  };

  return (
    <Frame>
      <View style={styles.header}>
        <Back />
        <View style={styles.titleBox}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          {thread.kind === 'direct' && <PersonMark mark={thread.detail.other.mark} />}
          {activity && <Text style={styles.activity}>{g(`activity.${activity}`)}</Text>}
        </View>
        <Button
          label={t('conversation.details')}
          variant="secondary"
          onPress={() => setDialog({ kind: 'details' })}
        />
      </View>
      {pins.length > 0 && (
        <Pressable
          style={styles.pins}
          accessibilityRole="button"
          accessibilityLabel={`${r('room.pinned')} (${pins.length})`}
          onPress={() => setDialog({ kind: 'pins' })}
        >
          <Text style={styles.pinsText}>{`${r('room.pinned')} (${pins.length})`}</Text>
        </Pressable>
      )}

      {outside ? (
        <View style={styles.pad}>
          <Notice tone={room?.banned ? 'warning' : 'info'}>
            {room?.banned ? r('join.banned') : r('join.notJoined')}
          </Notice>
          {!room?.banned && !room?.archived && (
            <Button label={r('browse.join')} onPress={() => setDialog({ kind: 'join' })} />
          )}
        </View>
      ) : (
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.log}
          accessibilityLabel={
            thread.kind === 'direct'
              ? t('conversation.log', { name: title })
              : thread.kind === 'group'
                ? g('group.log', { name: title })
                : r('room.log', { name: title })
          }
          onScroll={onScroll}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (atEnd.current) list.current?.scrollToEnd({ animated: false });
          }}
          ListHeaderComponent={
            hasMore ? (
              <Button
                label={t('conversation.earlier')}
                variant="link"
                onPress={() => void loadEarlier()}
              />
            ) : null
          }
          ListEmptyComponent={
            <Body muted>
              {thread.kind === 'direct' ? t('conversation.empty') : r('room.empty')}
            </Body>
          }
          renderItem={({ item: message, index }) => {
            const before = messages[index - 1];
            const newDay = !before || dayKey(before.createdAt) !== dayKey(message.createdAt);
            const hidden = message.senderBlocked && !revealed.includes(message.id);
            return (
              <View style={styles.line}>
                {newDay && (
                  <Text style={styles.day}>
                    {format.dateTime(new Date(message.createdAt), { dateStyle: 'full' })}
                  </Text>
                )}
                <Pressable
                  onLongPress={() => setDialog({ kind: 'menu', message })}
                  accessibilityHint={t('menu.open')}
                  style={[
                    styles.bubble,
                    message.mine ? styles.mine : styles.theirs,
                    message.seq === at && styles.found,
                  ]}
                >
                  {thread.kind !== 'direct' && !message.mine && (
                    <Text style={styles.sender}>{senderName(message)}</Text>
                  )}
                  {(message.announcement || message.forwarded) && (
                    <View style={styles.tags}>
                      {message.announcement && <Tag tone="warning">{r('room.announcement')}</Tag>}
                      {message.forwarded && <Tag>{g('forward.forwarded')}</Tag>}
                    </View>
                  )}
                  {message.replyTo && (
                    <View style={styles.quote}>
                      <Text style={styles.quoteName}>
                        {t('conversation.replyTo', { name: senderName(message.replyTo) })}
                      </Text>
                      <Text style={styles.quoteText} numberOfLines={2}>
                        {message.replyTo.deleted ? t('conversation.deleted') : message.replyTo.body}
                      </Text>
                    </View>
                  )}
                  {message.deleted ? (
                    <Text style={styles.deleted}>
                      {message.removedByModerator ? r('room.removed') : t('conversation.deleted')}
                    </Text>
                  ) : hidden ? (
                    <>
                      <Text style={styles.deleted}>{r('room.blocked')}</Text>
                      <Button
                        label={r('room.showBlocked')}
                        variant="link"
                        onPress={() => setRevealed((current) => [...current, message.id])}
                      />
                    </>
                  ) : (
                    <>
                      {message.body ? <MessageText message={message} /> : null}
                      <Attachments files={message.attachments} />
                    </>
                  )}
                  <View style={styles.foot}>
                    <Text style={styles.meta}>
                      {message.editedAt && !message.deleted ? `${t('conversation.edited')} · ` : ''}
                      {time(message.createdAt)}
                      {thread.kind === 'direct' && message.mine && !message.deleted
                        ? ` · ${t(`conversation.status.${messageStatus(message.seq, thread.detail)}`)}`
                        : ''}
                    </Text>
                    <Pressable
                      onPress={() => setDialog({ kind: 'menu', message })}
                      accessibilityRole="button"
                      accessibilityLabel={t('menu.open')}
                      hitSlop={12}
                      style={styles.more}
                    >
                      <Text style={styles.moreText}>{'⋯'}</Text>
                    </Pressable>
                  </View>
                  <ReactionChips
                    reactions={message.reactions}
                    onToggle={
                      message.deleted ? null : (reaction, on) => void react(message, reaction, on)
                    }
                  />
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <Text style={styles.typing} accessibilityLiveRegion="polite">
        {typing
          ? thread.kind === 'direct'
            ? t('conversation.typing', { name: title })
            : r('room.typingMany')
          : ''}
      </Text>

      {at !== null && (
        <View style={styles.padSmall}>
          <Button
            label={g('search.newest')}
            variant="secondary"
            onPress={() => router.replace(threadRoute(kind, id) as Href)}
          />
        </View>
      )}
      {!outside && (
        <>
          {actionError !== null && (
            <View style={styles.padSmall}>
              <Notice tone="error">{errorMessage(actionError, all)}</Notice>
            </View>
          )}
          {writable ? (
            <Composer
              key={editing?.id ?? 'new'}
              initial={editing?.body ?? ''}
              banner={
                editing
                  ? t('composer.editing')
                  : reply
                    ? t('composer.replying', { name: senderName(reply) })
                    : null
              }
              saving={editing !== null}
              attach={!editing}
              announce={room?.canModerate ?? false}
              findPeople={thread.kind === 'direct' ? undefined : findPeople}
              onCancel={() => {
                setEditing(null);
                setReply(null);
              }}
              onSend={sendMessage}
              onTyping={
                editing ? null : () => void send('POST', `${base}/typing`).catch(() => undefined)
              }
            />
          ) : (
            <View style={styles.padSmall}>
              <Notice tone="warning">{cannot()}</Notice>
            </View>
          )}
        </>
      )}

      {dialog?.kind === 'menu' && (
        <Sheet title={t('menu.open')} onClose={() => setDialog(null)}>
          {!dialog.message.deleted && (
            <ReactionPicker
              message={dialog.message}
              onPick={(reaction, on) => {
                setDialog(null);
                void react(dialog.message, reaction, on);
              }}
            />
          )}
          {actionsFor(dialog.message).map((action) => (
            <Row
              key={action}
              label={actionLabel[action]}
              danger={['deleteAll', 'remove', 'removePerson', 'banPerson'].includes(action)}
              onPress={() => run(action, dialog.message)}
            />
          ))}
        </Sheet>
      )}
      {dialog?.kind === 'deleteAll' && (
        <Confirm
          title={t('confirm.deleteAllTitle')}
          text={t('confirm.deleteAllText')}
          confirmLabel={t('confirm.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await send('DELETE', `/api/v1/chat/messages/${encodeURIComponent(dialog.message.id)}`);
            await reloadOne(dialog.message.seq);
          }}
        />
      )}
      {dialog?.kind === 'deleteMine' && (
        <Confirm
          title={t('confirm.deleteMineTitle')}
          text={t('confirm.deleteMineText')}
          confirmLabel={t('confirm.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await send(
              'POST',
              `/api/v1/chat/messages/${encodeURIComponent(dialog.message.id)}/hide`,
            );
            setMessages((current) => current.filter((x) => x.id !== dialog.message.id));
          }}
        />
      )}
      {dialog?.kind === 'report' && (
        <ReportSheet
          target={{ messageId: dialog.message.id, name: senderName(dialog.message) }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'forward' && (
        <ForwardSheet message={dialog.message} onClose={() => setDialog(null)} />
      )}
      {(dialog?.kind === 'remove' ||
        dialog?.kind === 'removePerson' ||
        dialog?.kind === 'banPerson') && (
        <Moderate
          action={dialog.kind}
          base={base}
          message={dialog.message}
          name={senderName(dialog.message)}
          onClose={() => setDialog(null)}
          onDone={() => void reloadOne(dialog.message.seq)}
        />
      )}
      {dialog?.kind === 'pins' && (
        <Sheet title={r('room.pinned')} onClose={() => setDialog(null)}>
          {pins.map((message) => (
            <View key={message.id} style={styles.pinned}>
              <Text style={styles.sender}>{senderName(message)}</Text>
              {message.body ? <MessageText message={message} /> : null}
              <Attachments files={message.attachments} />
              {room?.canModerate && (
                <Button
                  label={r('menu.unpin')}
                  variant="link"
                  onPress={() => run('unpin', message)}
                />
              )}
            </View>
          ))}
        </Sheet>
      )}
      {dialog?.kind === 'join' && (
        <Confirm
          title={r('join.title', { name: title })}
          text={r('join.text')}
          confirmLabel={r('join.confirm')}
          danger={false}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await send('POST', `${base}/join`);
            const opened = await loadThread();
            if (opened) {
              const page = await request<{ items: Message[]; hasMore: boolean }>(
                `${base}/messages`,
              );
              setMessages(page.items);
              setHasMore(page.hasMore);
              loadPins();
            }
          }}
        />
      )}
      {dialog?.kind === 'search' && (
        <MessageSearchSheet conversationId={id} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'details' && (
        <ThreadDetails
          thread={thread}
          title={title}
          onClose={() => setDialog(null)}
          onChanged={() => void loadThread()}
          onSearch={() => setDialog({ kind: 'search' })}
          onLeft={() => {
            setDialog(null);
            router.replace('/chat');
          }}
        />
      )}
    </Frame>
  );
}

/** The screen's frame: clear of the phone's edges, the demo line, and room for the keyboard. */
function Frame({ children }: { children: React.ReactNode }) {
  const m = useTranslations('mobile');
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.demo}>{m('demoBanner')}</Text>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A moderator's three actions on a message or its writer; each asks for a reason. */
function Moderate({
  action,
  base,
  message,
  name,
  onClose,
  onDone,
}: {
  action: 'remove' | 'removePerson' | 'banPerson';
  base: string;
  message: Message;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('rooms.moderate');
  const send = useSend();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const parsed = banDays(days);
  const valid = reason.trim().length > 0 && (action !== 'banPerson' || parsed.ok);
  const user = encodeURIComponent(message.senderId ?? '');
  return (
    <Confirm
      title={
        action === 'remove'
          ? t('removeMessageTitle')
          : action === 'removePerson'
            ? t('removePersonTitle', { name })
            : t('banTitle', { name })
      }
      text={
        action === 'remove'
          ? t('removeMessageText')
          : action === 'removePerson'
            ? t('removePersonText')
            : t('banText')
      }
      confirmLabel={action === 'banPerson' ? t('ban') : t('remove')}
      disabled={!valid}
      onClose={onClose}
      onConfirm={async () => {
        const body = { reason: reason.trim() };
        if (action === 'remove') {
          await send('DELETE', `${base}/messages/${encodeURIComponent(message.id)}`, body);
        } else if (action === 'removePerson') {
          await send('POST', `${base}/members/${user}/remove`, body);
        } else {
          await send('POST', `${base}/bans`, {
            ...body,
            userId: message.senderId,
            days: parsed.ok ? parsed.days : null,
          });
        }
        onDone();
      }}
    >
      <Field label={t('reason')} hint={t('reasonHint')} value={reason} onChangeText={setReason} />
      {action === 'banPerson' && (
        <Field
          label={t('days')}
          hint={t('daysHint')}
          value={days}
          onChangeText={setDays}
          keyboardType="number-pad"
        />
      )}
    </Confirm>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semantic.background },
  fill: { flex: 1 },
  demo: {
    backgroundColor: colors.accent[100],
    color: colors.accent[700],
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  pad: { padding: 20, gap: 16 },
  padSmall: { paddingHorizontal: 12, paddingBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  titleBox: { flex: 1 },
  activity: { fontSize: 13, color: semantic.textMuted },
  found: { borderColor: semantic.primary, borderWidth: 2 },
  title: { fontSize: 18, fontWeight: '600', color: colors.brand[900] },
  pins: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: colors.brand[50],
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  pinsText: { fontSize: 14, fontWeight: '600', color: colors.brand[900] },
  pinned: { gap: 4, borderBottomWidth: 1, borderBottomColor: semantic.border, paddingBottom: 8 },
  log: { padding: 12, gap: 8, flexGrow: 1 },
  line: { gap: 8 },
  day: {
    alignSelf: 'center',
    fontSize: 13,
    color: semantic.textMuted,
    backgroundColor: colors.neutral[100],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: {
    alignSelf: 'flex-end',
    borderColor: colors.brand[200],
    backgroundColor: colors.brand[50],
  },
  theirs: {
    alignSelf: 'flex-start',
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  sender: { fontSize: 14, fontWeight: '600', color: colors.brand[800] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 2 },
  quote: {
    borderStartWidth: 3,
    borderStartColor: semantic.primary,
    paddingStart: 8,
    marginBottom: 4,
  },
  quoteName: { fontSize: 13, fontWeight: '600', color: semantic.textMuted },
  quoteText: { fontSize: 14, color: semantic.textMuted },
  deleted: { fontSize: 16, fontStyle: 'italic', color: semantic.textMuted },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  meta: { fontSize: 12, color: semantic.textMuted },
  more: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 20, color: semantic.textMuted },
  typing: { minHeight: 22, paddingHorizontal: 16, fontSize: 14, color: semantic.textMuted },
});
