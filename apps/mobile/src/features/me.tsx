import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { APP_VERSION } from '@/config';
import { errorMessage } from '@/errors';
import { useAppLock } from '@/lock/app-lock';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { ConnectionCheck } from './connection-check';
import { LanguageChoice } from './language-choice';

/** The member's own settings in the app: language, the lock, and signing out. */
export function MeScreen() {
  const all = useTranslations();
  const t = useTranslations('mobile');
  const { session, request } = useSession();
  const lock = useAppLock();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function signOutEverywhere() {
    setPending(true);
    setError(null);
    try {
      // Every other session first, then this one.
      await request('/api/v1/auth/sessions', { method: 'DELETE' });
      await session.signOut();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <Screen>
      <Title>{t('me.title')}</Title>
      <Card>
        <Button label={t('me.card')} onPress={() => router.push('/card')} />
        <Button
          label={t('me.notices')}
          variant="secondary"
          onPress={() => router.push('/notifications/settings')}
        />
      </Card>
      <LanguageChoice />

      <Card>
        <Heading>{t('lock.title')}</Heading>
        {lock.available ? (
          <Toggle
            label={t('lock.setting')}
            hint={t('lock.settingHint')}
            value={lock.enabled}
            onChange={lock.setEnabled}
          />
        ) : (
          <Body muted>{t('lock.notAvailable')}</Body>
        )}
      </Card>

      <ConnectionCheck />

      <Card>
        {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
        <Button
          label={t('account.signOut')}
          variant="secondary"
          onPress={() => void session.signOut()}
        />
        <Button
          label={t('account.signOutEverywhere')}
          hint={t('account.signOutEverywhereHint')}
          variant="danger"
          pending={pending}
          onPress={() => void signOutEverywhere()}
        />
        <Body muted>{t('account.signOutEverywhereHint')}</Body>
        <Body muted>{t('account.version', { version: APP_VERSION })}</Body>
      </Card>
    </Screen>
  );
}
