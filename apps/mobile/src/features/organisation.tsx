import type { components } from '@medconnect/api-client';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';
import { threadRoute } from '@/chat/model';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Heading, Notice, Screen, Title } from '@/ui/kit';
import { useGuest } from './visitor';

type Schemas = components['schemas'];
type Organisation = Schemas['OrganisationDto'];
type Membership = Schemas['MyMembershipsDto']['items'][number];
type NewsItem = Schemas['PublicNewsListDto']['items'][number];
type EventItem = Schemas['PublicEventListDto']['items'][number];
type Room = Schemas['RoomListDto']['items'][number];

/** How many of each the section shows; the full lists are in their own tabs. */
const FEW = 3;

/**
 * An organisation's section in the app (M16): who it is, the person's membership with the way
 * to the card, the membership and the application, and the organisation's rooms, news and
 * events. Without a named organisation it is the person's own, or the only one there is; with
 * several and none of them the person's, the person chooses.
 */
export function OrganisationScreen({ slug }: { slug?: string }) {
  const all = useTranslations();
  const t = useTranslations('organisations');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const { guest } = useGuest();
  const { request } = useSession();
  const [chosen, setChosen] = useState(slug);
  const [loaded, setLoaded] = useState<{
    organisations: Organisation[];
    memberships: Membership[];
  } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<{ items: Organisation[] }>('/api/v1/organisations'),
      guest
        ? Promise.resolve({ items: [] as Membership[] })
        : request<{ items: Membership[] }>('/api/v1/me/memberships'),
    ])
      .then(([organisations, memberships]) => {
        if (!active) return;
        setError(null);
        setLoaded({ organisations: organisations.items, memberships: memberships.items });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, guest]);

  const name = (item: { nameHe: string; nameEn: string }) =>
    locale === 'he' ? item.nameHe : item.nameEn;
  const organisations = loaded?.organisations ?? [];
  const wanted =
    chosen ??
    loaded?.memberships[0]?.organisation.slug ??
    (organisations.length === 1 ? organisations[0]?.slug : undefined);
  const organisation = organisations.find((item) => item.slug === wanted);

  if (!organisation) {
    return (
      <Screen>
        <Back />
        <Title>{t('list.title')}</Title>
        {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
        {!loaded && error === null && <Body muted>{m('loading')}</Body>}
        {loaded && wanted !== undefined && <Notice>{t('section.notFound')}</Notice>}
        {loaded && organisations.length === 0 && <Body muted>{t('list.empty')}</Body>}
        {loaded && organisations.length > 0 && (
          <Card>
            <Body muted>{t('list.intro')}</Body>
            {organisations.map((item) => (
              <Button
                key={item.id}
                label={name(item)}
                hint={t('list.open', { name: name(item) })}
                variant="secondary"
                onPress={() => setChosen(item.slug)}
              />
            ))}
          </Card>
        )}
      </Screen>
    );
  }

  const membership = loaded?.memberships.find((item) => item.organisation.id === organisation.id);
  const about =
    (locale === 'he' ? organisation.descriptionHe : organisation.descriptionEn) ??
    organisation.descriptionHe ??
    organisation.descriptionEn;
  return (
    <Screen>
      <Back />
      <Title>{name(organisation)}</Title>
      <Card>
        <Heading>{t('section.aboutTitle')}</Heading>
        <Body muted={!about}>{about ?? t('section.noDescription')}</Body>
      </Card>
      <MembershipPart membership={membership} guest={guest} />
      {membership?.status === 'ACTIVE' && <RoomsPart organisation={organisation} />}
      {!guest && membership?.status !== 'ACTIVE' && (
        <Card>
          <Heading>{t('section.rooms.title')}</Heading>
          <Body muted>{t('section.rooms.membersOnly')}</Body>
        </Card>
      )}
      <NewsPart organisation={organisation} />
      <EventsPart organisation={organisation} />
    </Screen>
  );
}

/** The person's membership here, and the ways to the card, its details and the application. */
function MembershipPart({
  membership,
  guest,
}: {
  membership: Membership | undefined;
  guest: boolean;
}) {
  const all = useTranslations();
  const t = useTranslations('organisations.section.membership');
  const locale = useLocale();
  const router = useRouter();
  const { toSignIn } = useGuest();
  return (
    <Card>
      <Heading>{t('title')}</Heading>
      {guest && (
        <>
          <Body muted>{t('signedOut')}</Body>
          <Button label={all('membership.common.signIn')} onPress={toSignIn} />
        </>
      )}
      {!guest && !membership && <Body>{t('none')}</Body>}
      {membership && (
        <Body>
          {t('state', {
            type: locale === 'he' ? membership.type.nameHe : membership.type.nameEn,
            status: all(`membership.membership.statuses.${membership.status}`),
          })}
        </Body>
      )}
      {membership?.status === 'ACTIVE' && (
        <Button label={t('card')} onPress={() => router.push('/card')} />
      )}
      {membership && (
        <Button label={t('open')} variant="secondary" onPress={() => router.push('/membership')} />
      )}
      {!guest && (
        <Button
          label={all('membership.application.title')}
          variant="secondary"
          onPress={() => router.push('/applications')}
        />
      )}
    </Card>
  );
}

/** The organisation's rooms that its member may open (the API decides which). */
function RoomsPart({ organisation }: { organisation: Organisation }) {
  const t = useTranslations('organisations.section.rooms');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [rooms, setRooms] = useState<Room[] | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ limit: '50', organisation: organisation.id });
    request<{ items: Room[] }>(`/api/v1/chat/rooms?${query.toString()}`)
      .then((result) => active && setRooms(result.items))
      .catch(() => active && setRooms([]));
    return () => {
      active = false;
    };
  }, [request, organisation.id]);

  return (
    <Card>
      <Heading>{t('title')}</Heading>
      {!rooms && <Body muted>{m('loading')}</Body>}
      {rooms?.length === 0 && <Body muted>{t('empty')}</Body>}
      {rooms?.map((room) => (
        <Button
          key={room.id}
          label={locale === 'he' ? room.nameHe : (room.nameEn ?? room.nameHe)}
          hint={t('members', { count: room.memberCount })}
          variant="secondary"
          onPress={() => router.push(threadRoute('room', room.id) as Href)}
        />
      ))}
    </Card>
  );
}

function NewsPart({ organisation }: { organisation: Organisation }) {
  const t = useTranslations('organisations.section.news');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      locale,
      page: '1',
      pageSize: String(FEW),
      organisation: organisation.id,
    });
    request<{ items: NewsItem[] }>(`/api/v1/news?${query.toString()}`)
      .then((result) => active && setItems(result.items))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [request, locale, organisation.id]);

  return (
    <Card>
      <Heading>{t('title')}</Heading>
      {!items && <Body muted>{m('loading')}</Body>}
      {items?.length === 0 && <Body muted>{t('empty')}</Body>}
      {items?.map((item) => (
        <Button
          key={item.slug}
          label={item.title}
          hint={format.dateTime(new Date(item.date), { dateStyle: 'long' })}
          variant="link"
          onPress={() => router.push(`/news/${encodeURIComponent(item.slug)}` as Href)}
        />
      ))}
    </Card>
  );
}

function EventsPart({ organisation }: { organisation: Organisation }) {
  const t = useTranslations('organisations.section.events');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [items, setItems] = useState<EventItem[] | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      locale,
      when: 'upcoming',
      page: '1',
      pageSize: String(FEW),
      organisation: organisation.id,
    });
    request<{ items: EventItem[] }>(`/api/v1/events?${query.toString()}`)
      .then((result) => active && setItems(result.items))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [request, locale, organisation.id]);

  return (
    <Card>
      <Heading>{t('title')}</Heading>
      {!items && <Body muted>{m('loading')}</Body>}
      {items?.length === 0 && <Body muted>{t('empty')}</Body>}
      {items?.map((item) => (
        <Button
          key={item.slug}
          label={item.title}
          hint={format.dateTime(new Date(item.startAt), {
            dateStyle: 'long',
            timeZone: item.timezone,
          })}
          variant="link"
          onPress={() => router.push(`/events/${encodeURIComponent(item.slug)}` as Href)}
        />
      ))}
    </Card>
  );
}
