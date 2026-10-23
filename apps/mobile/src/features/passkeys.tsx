import { type components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { PasskeyProblem, makePasskey, passkeysSupported } from '@/session/passkey';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Field, Heading } from '@/ui/kit';
import { Tag } from '@/ui/parts';

type PasskeyItem = components['schemas']['PasskeyListDto']['passkeys'][number];
type Translate = ReturnType<typeof useTranslations>;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined
    ? {}
    : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

/** What to tell the person when a passkey prompt or request failed (M18b). */
export function passkeyMessage(error: unknown, all: Translate): string {
  if (error instanceof PasskeyProblem) {
    if (error.reason === 'cancelled') return all('auth.passkeys.cancelled');
    if (error.reason === 'alreadyRegistered') return all('auth.passkeys.alreadyRegistered');
    if (error.reason === 'none') return all('mobile.passkeys.none');
    return all('mobile.passkeys.unsupported');
  }
  return errorMessage(error, all);
}

/**
 * The account's passkeys on the security screen (M18b): the list, adding one made on this phone,
 * and removing one. Adding and removing need a recent sign-in; `protect` asks for it.
 */
export function PasskeysCard({
  act,
  pending,
  version,
}: {
  /** Runs one change on the security screen; `protect` asks the person to confirm it's them. */
  act: (work: () => Promise<void>, protect?: boolean) => Promise<void>;
  pending: boolean;
  version: number;
}) {
  const t = useTranslations('auth.passkeys');
  const m = useTranslations('mobile.passkeys');
  const format = useFormatter();
  const { request } = useSession();
  const [passkeys, setPasskeys] = useState<PasskeyItem[] | null>(null);
  const [name, setName] = useState('');
  const supported = passkeysSupported();

  useEffect(() => {
    let active = true;
    request<{ passkeys: PasskeyItem[] }>('/api/v1/auth/passkeys')
      .then((result) => active && setPasskeys(result.passkeys))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, version]);

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <Card>
      <Heading>{t('title')}</Heading>
      <Body muted>{m('intro')}</Body>
      {passkeys?.length === 0 && <Body muted>{t('none')}</Body>}
      {passkeys?.map((passkey) => (
        <View key={passkey.id} style={styles.item}>
          <Text style={styles.strong}>{passkey.name}</Text>
          {passkey.synced && <Tag tone="plain">{t('synced')}</Tag>}
          <Text style={styles.meta}>
            {t('created', { date: date(passkey.createdAt) })} ·{' '}
            {passkey.lastUsedAt
              ? t('lastUsed', { date: date(passkey.lastUsedAt) })
              : t('neverUsed')}
          </Text>
          <Button
            label={`${t('remove')}: ${passkey.name}`}
            variant="link"
            disabled={pending}
            onPress={() =>
              void act(async () => {
                await request(
                  `/api/v1/auth/passkeys/${encodeURIComponent(passkey.id)}`,
                  json('DELETE'),
                );
              }, true)
            }
          />
        </View>
      ))}
      {supported ? (
        <>
          <Field
            label={t('nameLabel')}
            hint={t('nameHint')}
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
          <Button
            label={t('add')}
            pending={pending}
            onPress={() =>
              void act(async () => {
                const options = await request<Record<string, unknown>>(
                  '/api/v1/auth/passkeys/registration/options',
                  json('POST'),
                );
                const response = await makePasskey(options);
                await request(
                  '/api/v1/auth/passkeys/registration/verify',
                  json('POST', { response, name: name.trim() || t('defaultName') }),
                );
                setName('');
              }, true)
            }
          />
        </>
      ) : (
        <Body muted>{m('unsupported')}</Body>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: 4, borderBottomWidth: 1, borderBottomColor: semantic.border, paddingBottom: 10 },
  strong: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: semantic.text },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
});
