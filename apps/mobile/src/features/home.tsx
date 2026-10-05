import type { components } from '@iua/api-client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { APP_VERSION } from '@/config';
import { errorMessage } from '@/errors';
import { useAppLock } from '@/lock/app-lock';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { ConnectionCheck } from './connection-check';
import { LanguageChoice } from './language-choice';

type Me = components['schemas']['MeDto'];

/**
 * What a signed-in person sees in this first step of the app: who is signed in, the language,
 * the lock, the connection check, and signing out. The member's screens (card, news, events,
 * notifications, chat) are added in the next steps, and the page says so.
 */
export function Home() {
  const all = useTranslations();
  const t = useTranslations('mobile');
  const { session, request } = useSession();
  const lock = useAppLock();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    request<Me>('/api/v1/me')
      .then((result) => active && setMe(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

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
      <Title>{t('home.title')}</Title>
      {me ? (
        <Body>{t('home.signedInAs', { email: me.email })}</Body>
      ) : (
        <Body muted>{t('loading')}</Body>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {me && me.roles.length > 0 && <Notice>{t('home.staffNote')}</Notice>}
      <Notice>{t('home.soon')}</Notice>

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
