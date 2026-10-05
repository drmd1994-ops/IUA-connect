import type { components } from '@iua/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Heading, Notice, Screen, Title } from '@/ui/kit';

type Me = components['schemas']['MeDto'];
type MyMembership = components['schemas']['MyMembershipDto'];

/**
 * The member's home: who is signed in, the state of their membership with the way to the
 * card, and how many notifications wait. What the app doesn't have yet is said plainly.
 */
export function Home() {
  const all = useTranslations();
  const t = useTranslations('mobile.home');
  const m = useTranslations('mobile');
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [mine, setMine] = useState<MyMembership | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<Me>('/api/v1/me'),
      request<MyMembership>('/api/v1/me/membership'),
      request<{ count: number }>('/api/v1/notifications/unread-count'),
    ])
      .then(([who, membership, notices]) => {
        if (!active) return;
        setMe(who);
        setMine(membership);
        setUnread(notices.count);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  const membership = mine?.membership ?? null;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long' });
  return (
    <Screen>
      <Title>{t('title')}</Title>
      {me ? <Body>{t('signedInAs', { email: me.email })}</Body> : <Body muted>{m('loading')}</Body>}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {me && me.roles.length > 0 && <Notice>{t('staffNote')}</Notice>}

      {mine && (
        <Card>
          <Heading>{t('membership')}</Heading>
          {!membership && <Body>{t('none')}</Body>}
          {membership?.status === 'ACTIVE' && (
            <>
              <Body>{t('active', { date: date(membership.endDate) })}</Body>
              <Button label={t('openCard')} onPress={() => router.push('/card')} />
            </>
          )}
          {membership?.status === 'SUSPENDED' && <Body>{t('suspended')}</Body>}
          {membership?.status === 'EXPIRED' && (
            <Body>{t('expired', { date: date(membership.endDate) })}</Body>
          )}
        </Card>
      )}

      {unread !== null && (
        <Card>
          <Body>{t('unread', { count: unread })}</Body>
          <Button
            label={t('openNotices')}
            variant="secondary"
            onPress={() => router.push('/notifications')}
          />
        </Card>
      )}

      <Notice>{t('soon')}</Notice>
    </Screen>
  );
}
