import type { components } from '@iua/api-client';
import { colors, semantic } from '@iua/ui-tokens';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Notice, Screen, Title } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { MessageSearchSheet, PeopleSearch } from './dialogs';
import { useChatEvents } from './events';
import { listKind, threadRoute } from './model';
import { Avatar, Confirm, type Person, usePersonLabel, useSend } from './ui';

type Schemas = components['schemas'];
type Conversation = Schemas['ConversationListDto']['items'][number];
type Room = Schemas['RoomListDto']['items'][number];
type RoomCategory = Schemas['RoomCategoriesDto']['items'][number];
type Invitation = Schemas['InvitationListDto']['items'][number];
type Side = 'private' | 'rooms';
type Which = 'active' | 'archived';

/** Loads again when the screen is returned to, and when a live event says something changed. */
function useReload(): [number, () => void] {
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useFocusEffect(reload);
  useChatEvents((event) => {
    if (event.type !== 'typing' && event.type !== 'activity') reload();
  });
  return [version, reload];
}

/** The Chat tab: the reader's private conversations and groups, or their rooms. */
export function ChatTab() {
  const all = useTranslations();
  const t = useTranslations('chat.list');
  const r = useTranslations('rooms');
  const g = useTranslations('groups.list');
  const router = useRouter();
  const { request } = useSession();
  const [side, setSide] = useState<Side>('private');
  const [which, setWhich] = useState<Which>('active');
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [invitations, setInvitations] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [version] = useReload();

  useEffect(() => {
    let active = true;
    const fail = (caught: unknown) => active && setError(caught);
    request<{ enabled: boolean }>('/api/v1/chat/unread-count')
      .then((result) => active && setEnabled(result.enabled))
      .catch(() => undefined);
    request<{ items: Invitation[] }>('/api/v1/chat/invitations')
      .then((result) => active && setInvitations(result.items.length))
      .catch(() => undefined);
    if (side === 'private') {
      request<{ items: Conversation[] }>(
        `/api/v1/chat/conversations?limit=50&archived=${which === 'archived'}`,
      )
        .then((result) => {
          if (!active) return;
          setError(null);
          setConversations(result.items);
        })
        .catch(fail);
    } else {
      request<{ items: Room[] }>('/api/v1/chat/rooms/mine?limit=50')
        .then((result) => {
          if (!active) return;
          setError(null);
          setRooms(result.items);
        })
        .catch(fail);
    }
    return () => {
      active = false;
    };
  }, [request, side, which, version]);

  return (
    <Screen>
      <Title>{t('title')}</Title>
      {!enabled && <Notice tone="warning">{r('browse.membersOnly')}</Notice>}
      <Choices<Side>
        label={r('tabs.label')}
        value={side}
        onChange={setSide}
        options={[
          { value: 'private', label: r('tabs.private') },
          { value: 'rooms', label: r('tabs.rooms') },
        ]}
      />
      {invitations > 0 && (
        <Button
          label={g('invitations', { count: invitations })}
          onPress={() => router.push('/chat-invitations')}
        />
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}

      {side === 'private' ? (
        <>
          <View style={styles.actions}>
            <Button label={t('new')} onPress={() => router.push('/chat-new')} />
            <Button
              label={g('newGroup')}
              variant="secondary"
              onPress={() => router.push('/chat-new-group')}
            />
          </View>
          <Choices<Which>
            label={t('tabsLabel')}
            value={which}
            onChange={(next) => {
              setConversations(null);
              setWhich(next);
            }}
            options={[
              { value: 'active', label: t('active') },
              { value: 'archived', label: t('archived') },
            ]}
          />
          {conversations?.length === 0 && (
            <Body muted>{which === 'archived' ? t('emptyArchived') : t('empty')}</Body>
          )}
          {conversations?.map((item) => (
            <ConversationLine key={item.id} item={item} />
          ))}
        </>
      ) : (
        <>
          <Button label={r('list.browse')} onPress={() => router.push('/chat-rooms')} />
          {rooms?.length === 0 && <Body muted>{r('list.empty')}</Body>}
          {rooms?.map((room) => (
            <RoomLine key={room.id} room={room} />
          ))}
        </>
      )}
      <Button label={t('searchMessages')} variant="link" onPress={() => setSearching(true)} />
      {searching && <MessageSearchSheet onClose={() => setSearching(false)} />}
      <Button label={t('settings')} variant="link" onPress={() => router.push('/chat-settings')} />
    </Screen>
  );
}

function ConversationLine({ item }: { item: Conversation }) {
  const t = useTranslations('chat.list');
  const g = useTranslations('groups.list');
  const format = useFormatter();
  const label = usePersonLabel();
  const router = useRouter();
  const name = item.group?.name ?? label(item.other);
  const last = item.lastMessage;
  const text = !last
    ? ''
    : last.deleted
      ? t('deleted')
      : last.body || (last.files > 0 ? g('files', { count: last.files }) : '');
  const unread = item.unreadCount > 0 ? t('unread', { count: item.unreadCount }) : null;
  return (
    <Pressable
      onPress={() => router.push(threadRoute(listKind(item.kind), item.id) as Href)}
      accessibilityRole="link"
      accessibilityLabel={[name, unread, text].filter(Boolean).join('. ')}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      {item.group ? <GroupMark /> : <Avatar person={item.other} />}
      <View style={styles.lineText}>
        <View style={styles.lineTop}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {item.lastMessageAt && (
            <Text style={styles.meta}>
              {format.dateTime(new Date(item.lastMessageAt), {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </Text>
          )}
        </View>
        {text ? (
          <Text style={styles.preview} numberOfLines={1}>
            {last?.senderId && last.senderId !== item.other.id && !item.group
              ? t('you', { text })
              : text}
          </Text>
        ) : null}
        <View style={styles.tags}>
          {unread && <Tag tone="success">{unread}</Tag>}
          {item.markedUnread && item.unreadCount === 0 && <Tag>{t('markedUnread')}</Tag>}
          {item.group && <Tag>{g('people', { count: item.group.memberCount })}</Tag>}
          {item.pinned && <Tag>{g('pinned')}</Tag>}
          {item.muted && <Tag>{t('muted')}</Tag>}
        </View>
      </View>
    </Pressable>
  );
}

/** Stands where a person's photo would, for a group. Decorative. */
function GroupMark() {
  return (
    <View style={styles.groupMark} importantForAccessibility="no-hide-descendants">
      <Text style={styles.groupMarkText}>{'#'}</Text>
    </View>
  );
}

function RoomLine({ room, action }: { room: Room; action?: React.ReactNode }) {
  const r = useTranslations('rooms');
  const g = useTranslations('groups');
  const locale = useLocale();
  const router = useRouter();
  const name = locale === 'en' ? (room.nameEn ?? room.nameHe) : room.nameHe;
  const description = (locale === 'en' ? room.descriptionEn : null) ?? room.descriptionHe;
  const unread = room.unreadCount > 0 ? r('list.unread', { count: room.unreadCount }) : null;
  const body = (
    <View style={styles.lineText}>
      <Text style={styles.name}>{name}</Text>
      {description ? (
        <Text style={styles.preview} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
      <View style={styles.tags}>
        {unread && <Tag tone="success">{unread}</Tag>}
        {room.markedUnread && room.unreadCount === 0 && <Tag>{r('list.markedUnread')}</Tag>}
        <Tag>{r('list.members', { count: room.memberCount })}</Tag>
        {room.moderatorsOnly && <Tag>{r('browse.announcements')}</Tag>}
        {room.inviteOnly && <Tag>{g('room.inviteOnly')}</Tag>}
        {room.locked && <Tag tone="warning">{r('list.locked')}</Tag>}
        {room.archived && <Tag>{r('list.archived')}</Tag>}
        {room.pinned && <Tag>{g('list.pinned')}</Tag>}
        {room.muted && <Tag>{r('list.muted')}</Tag>}
      </View>
      {action}
    </View>
  );
  if (action) return <View style={styles.line}>{body}</View>;
  return (
    <Pressable
      onPress={() => router.push(threadRoute('room', room.id) as Href)}
      accessibilityRole="link"
      accessibilityLabel={[name, unread].filter(Boolean).join('. ')}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** Starting a private conversation: find a member who can be written to. */
export function NewConversation() {
  const all = useTranslations();
  const t = useTranslations('chat.start');
  const router = useRouter();
  const send = useSend();
  const [error, setError] = useState<unknown>(null);

  async function start(person: Person) {
    setError(null);
    try {
      const opened = await send<{ id: string }>('POST', '/api/v1/chat/conversations', {
        userId: person.id,
      });
      router.replace(threadRoute('direct', opened.id) as Href);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <PeopleSearch
        path="/api/v1/chat/people"
        actionLabel={(name) => t('write', { name })}
        onPick={(person) => void start(person)}
      />
    </Screen>
  );
}

/** Making a group: a name, and the people to invite. Each joins only if they accept. */
export function NewGroup() {
  const all = useTranslations();
  const t = useTranslations('groups.create');
  const label = usePersonLabel();
  const router = useRouter();
  const send = useSend();
  const [name, setName] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const group = await send<{ id: string }>('POST', '/api/v1/chat/groups', {
        name: name.trim(),
        userIds: people.map((person) => person.id),
      });
      router.replace(threadRoute('group', group.id) as Href);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Field label={t('name')} value={name} onChangeText={setName} maxLength={80} />
      <Card>
        <Text style={styles.name}>{t('chosen')}</Text>
        {people.length === 0 && <Body muted>{t('none')}</Body>}
        {people.map((person) => (
          <Button
            key={person.id}
            label={t('removeName', { name: label(person) })}
            variant="secondary"
            onPress={() => setPeople((current) => current.filter((x) => x.id !== person.id))}
          />
        ))}
      </Card>
      <Text style={styles.name}>{t('people')}</Text>
      <PeopleSearch
        path="/api/v1/chat/invitable"
        exclude={people.map((person) => person.id ?? '')}
        actionLabel={(person) => t('addName', { name: person })}
        onPick={(person) => setPeople((current) => [...current, person])}
      />
      <Body muted>{t('note')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Button
        label={t('create')}
        pending={pending}
        disabled={name.trim().length === 0}
        onPress={() => void create()}
      />
    </Screen>
  );
}

/** Every open room, with search and a category; joining shows the reader's name to the room. */
export function BrowseRooms() {
  const all = useTranslations();
  const r = useTranslations('rooms');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const send = useSend();
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [joining, setJoining] = useState<Room | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, reload] = useReload();

  useEffect(() => {
    let active = true;
    request<{ items: RoomCategory[] }>('/api/v1/chat/room-categories')
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams({
      limit: '50',
      ...(query ? { q: query } : {}),
      ...(categoryId ? { categoryId } : {}),
    });
    request<{ items: Room[] }>(`/api/v1/chat/rooms?${search.toString()}`)
      .then((result) => {
        if (!active) return;
        setError(null);
        setRooms(result.items);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, query, categoryId, version]);

  const nameOf = (room: Room) => (locale === 'en' ? (room.nameEn ?? room.nameHe) : room.nameHe);
  return (
    <Screen>
      <Back />
      <Title>{r('browse.title')}</Title>
      <Body muted>{r('browse.intro')}</Body>
      <Field
        label={r('browse.search')}
        value={typed}
        onChangeText={setTyped}
        returnKeyType="search"
        onSubmitEditing={() => setQuery(typed.trim())}
      />
      <Button
        label={r('browse.searchButton')}
        variant="secondary"
        onPress={() => setQuery(typed.trim())}
      />
      {categories.length > 0 && (
        <Choices
          label={r('browse.category')}
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: '', label: r('browse.allCategories') },
            ...categories.map((c) => ({
              value: c.id,
              label: locale === 'he' ? c.nameHe : c.nameEn,
            })),
          ]}
        />
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {rooms?.length === 0 && <Body muted>{r('browse.empty')}</Body>}
      {rooms?.map((room) => (
        <RoomLine
          key={room.id}
          room={room}
          action={
            room.role === 'NONE' ? (
              <Button
                label={r('browse.joinName', { name: nameOf(room) })}
                onPress={() => setJoining(room)}
              />
            ) : (
              <Button
                label={r('browse.openName', { name: nameOf(room) })}
                variant="secondary"
                onPress={() => router.push(threadRoute('room', room.id) as Href)}
              />
            )
          }
        />
      ))}
      {joining && (
        <Confirm
          title={r('join.title', { name: nameOf(joining) })}
          text={r('join.text')}
          confirmLabel={r('join.confirm')}
          danger={false}
          onClose={() => setJoining(null)}
          onConfirm={async () => {
            await send('POST', `/api/v1/chat/rooms/${encodeURIComponent(joining.id)}/join`);
            reload();
            router.push(threadRoute('room', joining.id) as Href);
          }}
        />
      )}
    </Screen>
  );
}

/** Groups and rooms the reader was invited to. They are in none of them until they accept. */
export function Invitations() {
  const all = useTranslations();
  const t = useTranslations('groups.invitations');
  const locale = useLocale();
  const format = useFormatter();
  const label = usePersonLabel();
  const router = useRouter();
  const { request } = useSession();
  const send = useSend();
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [version, reload] = useReload();

  useEffect(() => {
    let active = true;
    request<{ items: Invitation[] }>('/api/v1/chat/invitations')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, version]);

  async function act(work: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await work();
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  const path = (id: string) => `/api/v1/chat/invitations/${encodeURIComponent(id)}`;

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {items?.length === 0 && <Body muted>{t('empty')}</Body>}
      {items?.map((item) => {
        const name =
          item.kind === 'ROOM' && locale === 'en' ? (item.nameEn ?? item.name) : item.name;
        const from = item.invitedBy.id ? label(item.invitedBy) : null;
        return (
          <Card key={item.id}>
            <View style={styles.tags}>
              <Tag>{item.kind === 'GROUP' ? t('group') : t('room')}</Tag>
              <Tag>{t('people', { count: item.memberCount })}</Tag>
            </View>
            <Text style={styles.name}>{name}</Text>
            <Body>{from ? t('from', { name: from }) : t('fromUnknown')}</Body>
            {item.kind === 'GROUP' && item.members.length > 0 && (
              <Body muted>{`${t('inGroup')} ${item.members.map(label).join(', ')}`}</Body>
            )}
            <Body muted>{item.kind === 'GROUP' ? t('groupNote') : t('roomNote')}</Body>
            <Body muted>
              {t('expires', {
                when: format.dateTime(new Date(item.expiresAt), { dateStyle: 'long' }),
              })}
            </Body>
            <Button
              label={t('acceptName', { name })}
              disabled={pending}
              onPress={() =>
                void act(async () => {
                  const accepted = await send<{ kind: 'GROUP' | 'ROOM'; conversationId: string }>(
                    'POST',
                    `${path(item.id)}/accept`,
                  );
                  router.push(
                    threadRoute(
                      accepted.kind === 'GROUP' ? 'group' : 'room',
                      accepted.conversationId,
                    ) as Href,
                  );
                })
              }
            />
            <Button
              label={t('declineName', { name })}
              variant="secondary"
              disabled={pending}
              onPress={() => void act(() => send('POST', `${path(item.id)}/decline`))}
            />
            {from && item.invitedBy.id && (
              <Button
                label={t('block', { name: from })}
                variant="link"
                disabled={pending}
                onPress={() =>
                  void act(async () => {
                    await send('POST', '/api/v1/chat/blocks', { userId: item.invitedBy.id });
                    await send('POST', `${path(item.id)}/decline`);
                  })
                }
              />
            )}
          </Card>
        );
      })}
      {items && items.length > 0 && <Body muted>{t('declineNote')}</Body>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
  line: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 12,
    backgroundColor: semantic.surface,
  },
  pressed: { opacity: 0.8 },
  lineText: { flex: 1, gap: 4 },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: { flexShrink: 1, fontSize: 17, fontWeight: '600', color: semantic.text },
  meta: { fontSize: 13, color: semantic.textMuted },
  preview: { fontSize: 15, lineHeight: 21, color: semantic.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  groupMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupMarkText: { fontSize: 18, fontWeight: '700', color: colors.brand[900] },
});
