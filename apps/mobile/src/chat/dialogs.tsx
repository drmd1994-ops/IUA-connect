import type { components } from '@iua/api-client';
import { type Message, personName } from '@iua/api-client/chat';
import { semantic } from '@iua/ui-tokens';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Body, Button, Field, Notice } from '@/ui/kit';
import { Choices } from '@/ui/parts';
import { threadRoute } from './model';
import { Avatar, type Person, Row, Sheet, usePersonLabel, useSend } from './ui';

type Schemas = components['schemas'];
type Category = Schemas['ReportCategoriesDto']['items'][number];
type Conversation = Schemas['ConversationListDto']['items'][number];
type Room = Schemas['RoomListDto']['items'][number];

export type ReportTarget =
  | { messageId: string; name: string }
  | { userId: string; name: string }
  | { roomId: string; name: string };

/** A report to the association's staff: about a message, a person, or a room. */
export function ReportSheet({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const all = useTranslations();
  const t = useTranslations('chat.report');
  const r = useTranslations('rooms.report');
  const locale = useLocale();
  const { request } = useSession();
  const send = useSend();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<{ items: Category[] }>('/api/v1/chat/report-categories')
      .then((result) => active && setCategories(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  const { name, ...about } = target;
  const title =
    'messageId' in target
      ? t('titleMessage')
      : 'roomId' in target
        ? r('title', { name })
        : t('titlePerson', { name });
  const intro =
    'messageId' in target ? t('introMessage') : 'roomId' in target ? r('intro') : t('introPerson');

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await send('POST', '/api/v1/chat/reports', {
        ...about,
        categoryId,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {sent ? (
        <Notice tone="success">{t('sent')}</Notice>
      ) : (
        <>
          <Body muted>{intro}</Body>
          <Text style={styles.label}>{t('category')}</Text>
          <Choices
            label={t('category')}
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({
              value: c.id,
              label: locale === 'he' ? c.nameHe : c.nameEn,
            }))}
          />
          <Field
            label={t('description')}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
          />
          {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
          <Button
            label={t('send')}
            pending={pending}
            disabled={!categoryId}
            onPress={() => void submit()}
          />
        </>
      )}
    </Sheet>
  );
}

/**
 * Forwarding a message: the reader picks one of their conversations, groups or rooms, and a copy
 * of the text and its files is sent there. The copy doesn't say whose it was.
 */
export function ForwardSheet({ message, onClose }: { message: Message; onClose: () => void }) {
  const all = useTranslations();
  const t = useTranslations('groups.forward');
  const locale = useLocale();
  const label = usePersonLabel();
  const { request } = useSession();
  const send = useSend();
  const [targets, setTargets] = useState<{ id: string; name: string; room: boolean }[] | null>(
    null,
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<{ items: Conversation[] }>('/api/v1/chat/conversations?limit=50'),
      request<{ items: Room[] }>('/api/v1/chat/rooms/mine?limit=50'),
    ])
      .then(([conversations, rooms]) => {
        if (!active) return;
        setTargets([
          ...conversations.items.map((item) => ({
            id: item.id,
            name: item.group?.name ?? label(item.other),
            room: false,
          })),
          ...rooms.items
            .filter((room) => !room.archived)
            .map((room) => ({
              id: room.id,
              name: locale === 'en' ? (room.nameEn ?? room.nameHe) : room.nameHe,
              room: true,
            })),
        ]);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, label, locale]);

  async function forward(target: { id: string; name: string }) {
    setPending(true);
    setError(null);
    try {
      await send('POST', `/api/v1/chat/messages/${encodeURIComponent(message.id)}/forward`, {
        conversationId: target.id,
      });
      setSentTo(target.name);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const group = (room: boolean) => targets?.filter((target) => target.room === room) ?? [];
  return (
    <Sheet title={t('title')} onClose={onClose}>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {sentTo && <Notice tone="success">{t('sent', { name: sentTo })}</Notice>}
      {targets?.length === 0 && <Body muted>{t('empty')}</Body>}
      {!sentTo &&
        ([false, true] as const).map((room) =>
          group(room).length === 0 ? null : (
            <View key={String(room)} style={styles.group}>
              <Text style={styles.label}>{t(room ? 'rooms' : 'conversations')}</Text>
              {group(room).map((target) => (
                <Row
                  key={target.id}
                  label={t('toName', { name: target.name })}
                  onPress={() => !pending && void forward(target)}
                />
              ))}
            </View>
          ),
        )}
    </Sheet>
  );
}

/**
 * Finding people by name. The API decides who can be found: for a new conversation, members
 * who can be written to; for an invitation, members who may be invited.
 */
export function PeopleSearch({
  path,
  actionLabel,
  onPick,
  exclude = [],
}: {
  /** The search address, without its query. */
  path: string;
  actionLabel: (name: string) => string;
  onPick: (person: Person) => void;
  exclude?: readonly string[];
}) {
  const all = useTranslations();
  const t = useTranslations('chat.start');
  const { request } = useSession();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Person[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function search() {
    if (query.trim().length < 2) return;
    setPending(true);
    setError(null);
    try {
      const join = path.includes('?') ? '&' : '?';
      const result = await request<{ items: Person[] }>(
        `${path}${join}q=${encodeURIComponent(query.trim())}`,
      );
      setFound(result.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const shown = found?.filter((person) => person.id && !exclude.includes(person.id)) ?? null;
  return (
    <View style={styles.group}>
      <Field
        label={t('search')}
        hint={t('hint')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        returnKeyType="search"
        onSubmitEditing={() => void search()}
      />
      <Button
        label={t('searchButton')}
        variant="secondary"
        pending={pending}
        disabled={query.trim().length < 2}
        onPress={() => void search()}
      />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {shown?.length === 0 && <Body muted>{t('empty')}</Body>}
      {shown?.map((person) => {
        const name = personName(person) ?? '';
        return (
          <View key={person.id} style={styles.person}>
            <Avatar person={person} />
            <Text style={styles.name}>{name}</Text>
            <Button label={actionLabel(name)} variant="secondary" onPress={() => onPick(person)} />
          </View>
        );
      })}
    </View>
  );
}

type Found = Schemas['MessageSearchDto']['items'][number];

/**
 * Searching the reader's own messages: in one thread, or in all of them. A result opens its
 * thread at that message.
 */
export function MessageSearchSheet({
  conversationId,
  onClose,
}: {
  conversationId?: string;
  onClose: () => void;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.search');
  const g = useTranslations('groups.search');
  const locale = useLocale();
  const label = usePersonLabel();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function search() {
    if (query.trim().length < 2) return;
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        ...(conversationId ? { conversationId } : {}),
      });
      const result = await request<{ items: Found[] }>(`/api/v1/chat/search?${params.toString()}`);
      setFound(result.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const where = (item: Found) =>
    item.room
      ? locale === 'en'
        ? (item.room.nameEn ?? item.room.nameHe)
        : item.room.nameHe
      : item.group
        ? g('inGroup', { name: item.group.name })
        : t('with', { name: label(item.other) });
  return (
    <Sheet title={t('title')} onClose={onClose}>
      <Field
        label={t('label')}
        hint={t('hint')}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={() => void search()}
      />
      <Button
        label={t('button')}
        pending={pending}
        disabled={query.trim().length < 2}
        onPress={() => void search()}
      />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {found?.length === 0 && <Body muted>{t('empty')}</Body>}
      {found?.map((item) => (
        <View key={item.message.id} style={styles.group}>
          <Text style={styles.meta}>
            {`${where(item)} · ${format.dateTime(new Date(item.message.createdAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}`}
          </Text>
          <Text style={styles.name} numberOfLines={3}>
            {item.message.body}
          </Text>
          <Button
            label={g('goTo')}
            variant="link"
            onPress={() => {
              onClose();
              const kind = item.room ? 'room' : item.group ? 'group' : 'direct';
              router.push(
                `${threadRoute(kind, item.message.conversationId)}?at=${item.message.seq}` as Href,
              );
            }}
          />
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, color: semantic.textMuted },
  label: { fontSize: 16, fontWeight: '600', color: semantic.text },
  group: { gap: 8 },
  person: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  name: { flex: 1, minWidth: 120, fontSize: 16, color: semantic.text },
});
