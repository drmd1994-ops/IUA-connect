import type { components } from '@iua/api-client';
import { semantic } from '@iua/ui-tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Choices } from '@/ui/parts';
import { type Person, usePersonLabel, useSend } from './ui';

type Settings = components['schemas']['ChatSettingsDto'];

/** The reader's own chat settings, the same ones as on the site, and the people they blocked. */
export function ChatSettings() {
  const all = useTranslations();
  const t = useTranslations('chat.settings');
  const g = useTranslations('groups.settings');
  const m = useTranslations('mobile');
  const label = usePersonLabel();
  const { request } = useSession();
  const send = useSend();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [blocked, setBlocked] = useState<Person[] | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    request<Settings>('/api/v1/me/chat-settings')
      .then((result) => active && setSettings(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    let active = true;
    request<{ items: { user: Person }[] }>('/api/v1/chat/blocks')
      .then((result) => active && setBlocked(result.items.map((item) => item.user)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, version]);

  const change = (part: Partial<Settings>) => {
    setSaved(false);
    setSettings((current) => (current ? { ...current, ...part } : current));
  };

  async function save() {
    if (!settings) return;
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      setSettings(await send<Settings>('PUT', '/api/v1/me/chat-settings', settings));
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
      <Title>{t('title')}</Title>
      {!settings && error === null && <Body muted>{m('loading')}</Body>}
      {settings && (
        <>
          <Card>
            <Text style={styles.label}>{t('audience')}</Text>
            <Choices<Settings['audience']>
              label={t('audience')}
              value={settings.audience}
              onChange={(audience) => change({ audience })}
              options={[
                { value: 'LISTED', label: t('audienceListed') },
                { value: 'NOBODY', label: t('audienceNobody') },
              ]}
            />
            <Body muted>{t('audienceNote')}</Body>
          </Card>
          <Card>
            <Text style={styles.label}>{g('invitesFrom')}</Text>
            <Choices<Settings['invitesFrom']>
              label={g('invitesFrom')}
              value={settings.invitesFrom}
              onChange={(invitesFrom) => change({ invitesFrom })}
              options={[
                { value: 'LISTED', label: g('invitesListed') },
                { value: 'CONTACTS', label: g('invitesContacts') },
                { value: 'NOBODY', label: g('invitesNobody') },
              ]}
            />
            <Body muted>{g('invitesNote')}</Body>
          </Card>
          <Card>
            <Toggle
              label={t('readReceipts')}
              hint={t('readReceiptsHint')}
              value={settings.readReceipts}
              onChange={(readReceipts) => change({ readReceipts })}
            />
            <Toggle
              label={t('typing')}
              value={settings.typing}
              onChange={(typing) => change({ typing })}
            />
            <Toggle
              label={g('showActivity')}
              hint={g('showActivityHint')}
              value={settings.showActivity}
              onChange={(showActivity) => change({ showActivity })}
            />
          </Card>
        </>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {saved && <Notice tone="success">{t('saved')}</Notice>}
      {settings && <Button label={t('save')} pending={pending} onPress={() => void save()} />}

      <Card>
        <Text style={styles.label}>{t('blocked')}</Text>
        {blocked?.length === 0 && <Body muted>{t('noBlocked')}</Body>}
        {blocked?.map((person) => (
          <Button
            key={person.id}
            label={t('unblockName', { name: label(person) })}
            variant="secondary"
            onPress={() =>
              void send('DELETE', `/api/v1/chat/blocks/${encodeURIComponent(person.id ?? '')}`)
                .then(() => setVersion((v) => v + 1))
                .catch((caught: unknown) => setError(caught))
            }
          />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '600', color: semantic.text },
});
