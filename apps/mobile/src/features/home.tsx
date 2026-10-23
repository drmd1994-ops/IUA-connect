import type { components } from '@medconnect/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { GuestHome, useGuest } from './visitor';
import { Body, Button, Card, Heading, Notice, Screen, Title } from '@/ui/kit';

type Me = components['schemas']['MeDto'];
type MyMembership = components['schemas']['MyMembershipDto'];

/**
 * The member's home: who is signed in, the state of their membership with the way to the
 * card, and how many notifications wait. What the app doesn't have yet is said plainly.
 */
export function Home() {
  const { guest } = useGuest();
  return guest ? <GuestHome /> : <MemberHome />;
}

function MemberHome() {
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
      request<{ unread: number }>('/api/v1/notifications/unread-count'),
    ])
      .then(([who, membership, notices]) => {
        if (!active) return;
        setMe(who);
        setMine(membership);
        setUnread(notices.unread);
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

      {me && !me.verified && (
        <Card>
          <Heading>{all('verification.start.askTitle')}</Heading>
          <Body>{all('verification.start.ask')}</Body>
          <Button
            label={all('verification.start.askLink')}
            onPress={() => router.push('/verification')}
          />
        </Card>
      )}

      {mine && (
        <Card>
          <Heading>{t('membership')}</Heading>
          {!membership && (
            <>
              <Body>{t('none')}</Body>
              <Button
                label={all('membership.apply.title')}
                onPress={() => router.push('/organisation')}
              />
            </>
          )}
          {membership?.status === 'ACTIVE' && (
            <>
              <Body>{t('active', { date: date(membership.endDate) })}</Body>
              <Button label={t('openCard')} onPress={() => router.push('/card')} />
              <Button
                label={m('me.organisation')}
                variant="secondary"
                onPress={() => router.push('/organisation')}
              />
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
      <Card>
        <Heading>{t('more')}</Heading>
        <Button label={all('mobile.scan.title')} onPress={() => router.push('/scan')} />
        <Button
          label={all('education.nav')}
          variant="secondary"
          onPress={() => router.push('/education')}
        />
        <Button
          label={all('education.list.examLink')}
          variant="secondary"
          onPress={() => router.push('/exam')}
        />
        <Button
          label={all('content.guidelines.title')}
          variant="secondary"
          onPress={() => router.push('/guidelines')}
        />
        <Button
          label={all('calculators.nav')}
          variant="secondary"
          onPress={() => router.push('/calculators')}
        />
        <Button
          label={all('careers.nav')}
          variant="secondary"
          onPress={() => router.push('/positions')}
        />
        <Button
          label={all('communities.nav')}
          variant="secondary"
          onPress={() => router.push('/communities')}
        />
        <Button
          label={all('directory.nav')}
          variant="secondary"
          onPress={() => router.push('/members')}
        />
        <Button
          label={all('search.page.title')}
          variant="secondary"
          onPress={() => router.push('/search')}
        />
      </Card>
    </Screen>
  );
}
