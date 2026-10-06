import type { components } from '@iua/api-client';
import { colors, semantic } from '@iua/ui-tokens';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Tag } from '@/ui/parts';
import { appRoute, changeable, noticeValues } from './notifications-model';

type List = components['schemas']['NotificationListDto'];
type Item = List['items'][number];
type Preference = components['schemas']['NotificationPreferencesDto']['items'][number];

const PAGE_SIZE = 20;
/** The most the API hands over at once; older notices are on the site. */
const MOST = 50;

/** The signed-in person's notices, newest first. */
export function Notifications() {
  const all = useTranslations();
  const n = useTranslations('notifications.list');
  const t = useTranslations('notifications');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ items: Item[]; unread: number; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  /** Increases to load the list again after something was marked as read. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    // Everything shown so far is asked for again, so that what was read shows as read.
    const size = Math.min(pages * PAGE_SIZE, MOST);
    request<List>(`/api/v1/notifications?page=1&pageSize=${size}`)
      .then((result) => {
        if (!active) return;
        setError(null);
        setList({ items: result.items, unread: result.unread, total: result.total });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, pages, version]);

  async function act(work: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await work();
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  const read = (id: string) =>
    request(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  const text = (notice: Item): string => {
    const key = `items.${notice.type}`;
    if (!t.has(key)) return t('items.unknown');
    try {
      return t(key, noticeValues(notice.params as Record<string, unknown>, locale));
    } catch {
      // A notice stored without a value its sentence needs.
      return t('items.unknown');
    }
  };

  return (
    <Screen>
      <Back />
      <Title>{n('title')}</Title>
      <Body muted>{n('intro')}</Body>
      <Button
        label={n('preferences')}
        variant="link"
        onPress={() => router.push('/notifications/settings')}
      />
      {list && list.unread > 0 && (
        <Button
          label={n('markAll')}
          variant="secondary"
          disabled={pending}
          onPress={() =>
            void act(() => request('/api/v1/notifications/read-all', { method: 'POST' }))
          }
        />
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!list && error === null && <Body muted>{m('loading')}</Body>}
      {list && (
        <Text style={styles.meta} accessibilityLiveRegion="polite">
          {n('summary', { unread: list.unread, total: list.total })}
        </Text>
      )}
      {list?.items.length === 0 && <Body muted>{n('empty')}</Body>}
      {list?.items.map((notice) => {
        const unread = notice.readAt === null;
        const route = appRoute(notice.link);
        return (
          <View key={notice.id} style={[styles.notice, unread && styles.unread]}>
            <View style={styles.line}>
              <Text style={styles.meta}>
                {`${t(`kinds.${notice.kind}`)} · ${format.dateTime(new Date(notice.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}`}
              </Text>
              {unread && <Tag tone="success">{n('new')}</Tag>}
            </View>
            {route ? (
              <Button
                label={text(notice)}
                variant="link"
                onPress={() => {
                  // Opening a notice reads it. The screen is left either way.
                  if (unread)
                    void read(notice.id).then(
                      () => setVersion((v) => v + 1),
                      () => undefined,
                    );
                  router.push(route as Href);
                }}
              />
            ) : (
              <Text style={styles.text}>{text(notice)}</Text>
            )}
            {notice.link && !route ? <Text style={styles.meta}>{m('notices.onSite')}</Text> : null}
            {unread && (
              <Button
                label={n('markRead')}
                variant="link"
                disabled={pending}
                onPress={() => void act(() => read(notice.id))}
              />
            )}
          </View>
        );
      })}
      {list && list.items.length < list.total && list.items.length < MOST && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((p) => p + 1)} />
      )}
    </Screen>
  );
}

/** Which kinds of notice the person wants, in the app and by email. The same switches as the site. */
export function NotificationSettings() {
  const all = useTranslations();
  const t = useTranslations('notifications');
  const p = useTranslations('notifications.preferences');
  const m = useTranslations('mobile');
  const { request } = useSession();
  const [items, setItems] = useState<Preference[] | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<{ items: Preference[] }>('/api/v1/me/notification-preferences')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  const set = (kind: Preference['kind'], channel: 'app' | 'email', value: boolean) => {
    setSaved(false);
    setItems(
      (current) =>
        current?.map((item) => (item.kind === kind ? { ...item, [channel]: value } : item)) ?? null,
    );
  };

  async function save() {
    if (!items) return;
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await request<{ items: Preference[] }>('/api/v1/me/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: changeable(items) }),
      });
      setItems(result.items);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Back />
      <Title>{p('title')}</Title>
      <Body muted>{p('intro')}</Body>
      {!items && error === null && <Body muted>{m('loading')}</Body>}
      {items?.map((item) => {
        const kind = t(`kinds.${item.kind}`);
        return (
          <Card key={item.kind}>
            <Text style={styles.kind} accessibilityRole="header">
              {kind}
            </Text>
            <Body muted>
              {t(`kindHints.${item.kind}`)}
              {item.locked ? ` ${p('alwaysOn')}.` : ''}
            </Body>
            <Toggle
              label={p('appFor', { kind })}
              value={item.app}
              disabled={item.locked || pending}
              onChange={(value) => set(item.kind, 'app', value)}
            />
            <Toggle
              label={p('emailFor', { kind })}
              value={item.email}
              disabled={item.locked || pending}
              onChange={(value) => set(item.kind, 'email', value)}
            />
          </Card>
        );
      })}
      {items && (
        <>
          <Body muted>{p('digestNote')}</Body>
          <Body muted>{p('securityNote')}</Body>
        </>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {saved && <Notice tone="success">{p('saved')}</Notice>}
      {items && <Button label={p('save')} pending={pending} onPress={() => void save()} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    backgroundColor: semantic.surface,
  },
  unread: { borderColor: semantic.primary, backgroundColor: colors.brand[50] },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  text: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: semantic.text },
  kind: { fontSize: 17, fontWeight: '600', color: semantic.text },
});
