import { ApiError, type components } from '@medconnect/api-client';
import { colors, semantic } from '@medconnect/ui-tokens';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Markdown } from '@/ui/markdown';
import { Choices, FileLink, Picture, Tag } from '@/ui/parts';
import { groupByDay, mapUrl, registrationPanel, toggleSession, writeRange } from './events-model';
import { useFileUrl } from './files';
import { useSaveCalendar } from './scan';
import { useGuest } from './visitor';

type Schemas = components['schemas'];
type List = Schemas['PublicEventListDto'];
type Item = List['items'][number];
type Category = Schemas['EventCategoryListDto']['items'][number];
type Event = Schemas['PublicEventDto'];
type Session = Schemas['PublicSessionListDto']['items'][number];
type Registration = Schemas['MyRegistrationDto'];
type Schedule = Schemas['MyScheduleDto']['items'];
type When = 'upcoming' | 'past';

const PAGE_SIZE = 10;
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

/** Event times are written in the event's own time zone (Israel), whatever the phone's is. */
function useEventTime() {
  const format = useFormatter();
  return useMemo(() => {
    const at = (iso: string) => new Date(iso);
    const time = (iso: string, timeZone: string) =>
      format.dateTime(at(iso), { timeStyle: 'short', timeZone });
    return {
      day: (iso: string, timeZone: string) =>
        format.dateTime(at(iso), { dateStyle: 'full', timeZone }),
      range: (start: string, end: string, timeZone: string) =>
        writeRange(start, end, {
          day: (iso) => format.dateTime(at(iso), { dateStyle: 'long', timeZone }),
          time: (iso) => time(iso, timeZone),
        }),
      timeRange: (start: string, end: string, timeZone: string) =>
        `${time(start, timeZone)} – ${time(end, timeZone)}`,
    };
  }, [format]);
}

/** The list of events. A member also sees what their membership opens; the API decides. */
export function EventList() {
  const { guest } = useGuest();
  const all = useTranslations();
  const t = useTranslations('events');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [when, setWhen] = useState<When>('upcoming');
  const [category, setCategory] = useState('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; items: Item[]; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${locale}:${when}:${category}`;

  useEffect(() => {
    let active = true;
    request<{ items: Category[] }>('/api/v1/events/categories')
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      locale,
      when,
      page: String(pages),
      pageSize: String(PAGE_SIZE),
      ...(category ? { category } : {}),
    });
    request<List>(`/api/v1/events?${query.toString()}`)
      .then((result) => {
        if (!active) return;
        setError(null);
        setList((current) => ({
          key,
          total: result.total,
          items:
            pages > 1 && current?.key === key ? [...current.items, ...result.items] : result.items,
        }));
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, locale, when, category, pages, key]);

  const shown = list?.key === key ? list : null;
  return (
    <Screen>
      <Title>{t('list.title')}</Title>
      <Body muted>{t('list.intro')}</Body>
      {!guest && (
        <Button
          label={t('event.schedule.view')}
          variant="secondary"
          onPress={() => router.push('/events/schedule')}
        />
      )}
      <Choices
        label={t('list.show')}
        value={when}
        onChange={(next) => {
          setWhen(next);
          setPages(1);
        }}
        options={[
          { value: 'upcoming', label: t('list.upcoming') },
          { value: 'past', label: t('list.past') },
        ]}
      />
      {categories.length > 0 && (
        <Choices
          label={t('list.category')}
          value={category}
          onChange={(next) => {
            setCategory(next);
            setPages(1);
          }}
          options={[
            { value: '', label: t('list.allCategories') },
            ...categories.map((c) => ({
              value: c.key,
              label: locale === 'he' ? c.nameHe : c.nameEn,
            })),
          ]}
        />
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && (
        <Body muted>{t(when === 'upcoming' ? 'list.emptyUpcoming' : 'list.emptyPast')}</Body>
      )}
      {shown?.items.map((item) => (
        <EventCard key={item.slug} item={item} />
      ))}
      {shown && shown.items.length > 0 && (
        <Body muted>{m('news.shown', { shown: shown.items.length, total: shown.total })}</Body>
      )}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
    </Screen>
  );
}

/** One event of the list; the whole card opens it. */
function EventCard({ item }: { item: Item }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { range } = useEventTime();
  const thumb = useFileUrl(item.imageFileId, 'thumb');
  return (
    <Pressable
      onPress={() => router.push(`/events/${encodeURIComponent(item.slug)}`)}
      accessibilityRole="link"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {item.imageFileId &&
        (thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.thumb} />
        ))}
      <View style={styles.cardText}>
        <Text style={styles.meta}>{range(item.startAt, item.endAt, item.timezone)}</Text>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.locationName ? <Text style={styles.small}>{item.locationName}</Text> : null}
        {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
        <Text style={styles.meta}>
          {t('organisations.owner.from', {
            name: item.organisation
              ? locale === 'he'
                ? item.organisation.nameHe
                : item.organisation.nameEn
              : t('common.app.name'),
          })}
        </Text>
        <View style={styles.tags}>
          {item.cancelled && <Tag tone="danger">{t('events.list.cancelled')}</Tag>}
          {item.category && (
            <Tag>{locale === 'he' ? item.category.nameHe : item.category.nameEn}</Tag>
          )}
          {item.cmeAvailable && <Tag tone="success">{t('events.list.cme')}</Tag>}
          {item.accessTier !== 'PUBLIC' && (
            <Tag>
              {t(`content.common.tiers.${item.accessTier === 'VERIFIED' ? 'VERIFIED' : 'MEMBERS'}`)}
            </Tag>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** Saves a calendar file and hands it to the phone's calendar apps. */
function CalendarButton({ label, path, title }: { label: string; path: string; title: string }) {
  const m = useTranslations('mobile.events');
  const save = useSaveCalendar();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        label={label}
        variant="secondary"
        pending={pending}
        onPress={() => {
          setPending(true);
          setFailed(false);
          save(path, title)
            .catch(() => setFailed(true))
            .finally(() => setPending(false));
        }}
      />
      {failed && <Notice tone="error">{m('calendarFailed')}</Notice>}
    </>
  );
}

/** One event: when and where, its text, registration, and the programme. */
export function EventPage({ slug }: { slug: string }) {
  const { guest } = useGuest();
  const all = useTranslations();
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [found, setFound] = useState<{
    key: string;
    event: Event;
    sessions: Session[];
    registration: Registration;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const key = `${slug}:${locale}`;

  useEffect(() => {
    let active = true;
    const path = `/api/v1/events/${encodeURIComponent(slug)}`;
    Promise.all([
      request<Event>(`${path}?locale=${locale}`),
      request<{ items: Session[] }>(`${path}/sessions?locale=${locale}`),
      // A visitor has no registration; asking would only be refused.
      guest
        ? Promise.resolve<Registration>({ status: 'NONE', waitingPosition: null, sessionIds: [] })
        : request<Registration>(`${path}/registration`),
    ])
      .then(([event, list, registration]) => {
        if (!active) return;
        setError(null);
        setFound({ key, event, sessions: list.items, registration });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, slug, locale, key, version, guest]);

  const back = (
    <Button
      label={t('events.event.back')}
      variant="link"
      onPress={() => router.navigate('/events')}
    />
  );
  if (error !== null && found?.key !== key) {
    const missing = error instanceof ApiError && error.code === 'NOT_FOUND';
    return (
      <Screen>
        {back}
        {missing ? (
          <>
            <Title>{t('content.common.notFoundTitle')}</Title>
            <Body muted>{t('content.common.notFoundBody')}</Body>
          </>
        ) : (
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        )}
      </Screen>
    );
  }
  if (found?.key !== key) {
    return (
      <Screen>
        {back}
        <Body muted>{t('mobile.loading')}</Body>
      </Screen>
    );
  }
  const onChanged = (registration: Registration) => {
    setFound({ ...found, registration });
    // Places left and the waiting list may have changed.
    setVersion((v) => v + 1);
  };
  return (
    <Screen>
      {back}
      <EventView event={found.event} />
      <RegistrationCard
        event={found.event}
        registration={found.registration}
        onChanged={onChanged}
      />
      <Programme
        event={found.event}
        sessions={found.sessions}
        registration={found.registration}
        onChanged={onChanged}
      />
    </Screen>
  );
}

function EventView({ event }: { event: Event }) {
  const t = useTranslations();
  const locale = useLocale();
  const { range } = useEventTime();
  const map = mapUrl(event.lat, event.lng);
  const hint = t('mobile.news.fileHint');
  return (
    <>
      {event.cancelled && (
        <Notice tone="warning">
          {t('events.event.cancelledNotice')}
          {event.cancelReason
            ? ` ${t('events.event.cancelReason', { reason: event.cancelReason })}`
            : ''}
        </Notice>
      )}
      {event.fallback && <Notice>{t('content.common.fallbackNotice')}</Notice>}
      <Title>{event.title}</Title>
      {event.imageFileId && (
        <Picture
          fileId={event.imageFileId}
          label={t('events.event.imageAlt', { title: event.title })}
        />
      )}
      <Card>
        <Fact label={t('events.event.when')}>
          <Text style={styles.strong}>{range(event.startAt, event.endAt, event.timezone)}</Text>
          <Text style={styles.meta}>{t('events.event.timeNote')}</Text>
        </Fact>
        {(event.locationName || event.address) && (
          <Fact label={t('events.event.where')}>
            {event.locationName ? <Text style={styles.strong}>{event.locationName}</Text> : null}
            {event.address ? <Text style={styles.meta}>{event.address}</Text> : null}
            {map && (
              <Button
                label={t('events.event.openMap')}
                variant="link"
                hint={hint}
                onPress={() => open(map)}
              />
            )}
          </Fact>
        )}
        {event.organizer && (
          <Fact label={t('events.event.organizer')}>
            <Text style={styles.strong}>{event.organizer}</Text>
          </Fact>
        )}
        {event.cmeAvailable && (
          <Fact label={t('events.list.cme')}>
            <Text style={styles.strong}>{t('membership.common.yes')}</Text>
          </Fact>
        )}
      </Card>
      {event.summary ? <Text style={styles.lead}>{event.summary}</Text> : null}
      <Markdown>{event.description}</Markdown>
      <CalendarButton
        label={t('events.event.addToCalendar')}
        path={`/api/v1/events/${encodeURIComponent(event.slug)}.ics?locale=${locale}`}
        title={event.title}
      />
      {event.sourceUrl && (
        <View style={styles.source}>
          <Text style={styles.meta}>{t('events.event.sourceLabel')}</Text>
          <Button
            label={t('events.event.readAtSource')}
            variant="link"
            hint={hint}
            onPress={() => open(event.sourceUrl ?? '')}
          />
        </View>
      )}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.meta}>{label}</Text>
      {children}
    </View>
  );
}

function RegistrationCard({
  event,
  registration,
  onChanged,
}: {
  event: Event;
  registration: Registration;
  onChanged: (registration: Registration) => void;
}) {
  const all = useTranslations();
  const r = useTranslations('events.event.registration');
  const { guest, toSignIn } = useGuest();
  const router = useRouter();
  const m = useTranslations('mobile');
  const { request } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const panel = registrationPanel(event, registration);

  async function send(method: 'POST' | 'DELETE') {
    setPending(true);
    setError(null);
    try {
      onChanged(
        await request<Registration>(
          `/api/v1/events/${encodeURIComponent(event.slug)}/registration`,
          { method },
        ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <Heading>{r('title')}</Heading>
      {panel.kind === 'none' && <Body>{r('none')}</Body>}
      {panel.kind === 'external' && (
        <>
          <Body>{r('external')}</Body>
          {panel.url && (
            <Button
              label={r('externalLink')}
              hint={m('news.fileHint')}
              onPress={() => open(panel.url ?? '')}
            />
          )}
        </>
      )}
      {panel.kind === 'member' && guest && (
        <>
          <Body>{event.registrationOpen ? r('signIn') : r('closed')}</Body>
          {event.registrationOpen && <Button label={m('signIn.submit')} onPress={toSignIn} />}
        </>
      )}
      {panel.kind === 'member' && !guest && (
        <>
          {panel.mine === 'REGISTERED' && <Notice tone="success">{r('registered')}</Notice>}
          {panel.mine === 'WAITLISTED' && (
            <Notice>{r('waiting', { position: panel.position ?? 1 })}</Notice>
          )}
          {panel.note === 'closed' && <Body>{r('closed')}</Body>}
          {panel.note === 'full' && <Body muted>{r('full')}</Body>}
          {panel.note === 'placesLeft' && (
            <Body muted>{r('placesLeft', { count: panel.placesLeft ?? 0 })}</Body>
          )}
          {panel.action && (
            <Button
              label={r(panel.action)}
              variant={
                panel.action === 'register' || panel.action === 'joinWaitingList'
                  ? 'primary'
                  : 'secondary'
              }
              pending={pending}
              onPress={() =>
                void send(
                  panel.action === 'register' || panel.action === 'joinWaitingList'
                    ? 'POST'
                    : 'DELETE',
                )
              }
            />
          )}
          {panel.mine === 'REGISTERED' && (
            <Button
              label={m('events.scanVenue')}
              variant="secondary"
              onPress={() => router.push('/scan')}
            />
          )}
        </>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
    </Card>
  );
}

function Programme({
  event,
  sessions,
  registration,
  onChanged,
}: {
  event: Event;
  sessions: Session[];
  registration: Registration;
  onChanged: (registration: Registration) => void;
}) {
  const all = useTranslations();
  const t = useTranslations('events.event');
  const router = useRouter();
  const { day, timeRange } = useEventTime();
  const { request } = useSession();
  const canChoose = registration.status === 'REGISTERED';
  // The saved choice arrives with the registration (and empties when it is cancelled). When it
  // changes, the ticked boxes start again from it.
  const savedKey = registration.sessionIds.join(',');
  const [choice, setChoice] = useState({ from: savedKey, ids: registration.sessionIds });
  if (choice.from !== savedKey) setChoice({ from: savedKey, ids: registration.sessionIds });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const days = groupByDay(sessions, (iso) => day(iso, event.timezone));

  async function save() {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      onChanged(
        await request<Registration>(`/api/v1/events/${encodeURIComponent(event.slug)}/schedule`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionIds: choice.ids }),
        }),
      );
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.section}>
      <Heading>{t('sessions')}</Heading>
      {sessions.length === 0 && <Body muted>{t('noSessions')}</Body>}
      {canChoose && sessions.length > 0 && <Body muted>{t('schedule.hint')}</Body>}
      {days.map((group) => (
        <View key={group.day} style={styles.section}>
          <Text style={styles.day} accessibilityRole="header">
            {group.day}
          </Text>
          {group.sessions.map((session) => (
            <Card key={session.id}>
              <Text style={styles.meta}>
                {timeRange(session.startAt, session.endAt, event.timezone)}
                {session.room ? ` · ${t('room', { room: session.room })}` : ''}
              </Text>
              <Text style={styles.strong}>{session.title}</Text>
              {session.description ? <Body>{session.description}</Body> : null}
              {session.speakers.length > 0 && (
                <View style={styles.list}>
                  <Text style={styles.label}>{t('speakers')}</Text>
                  {session.speakers.map((speaker) => (
                    <View key={speaker.id} style={styles.speaker}>
                      {speaker.photoFileId && <SpeakerPhoto fileId={speaker.photoFileId} />}
                      <View style={styles.speakerText}>
                        <Text style={styles.strong}>
                          {[speaker.title, speaker.name].filter(Boolean).join(' ')}
                        </Text>
                        {speaker.affiliation ? (
                          <Text style={styles.meta}>{speaker.affiliation}</Text>
                        ) : null}
                        {speaker.bio ? <Text style={styles.small}>{speaker.bio}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {session.materials.length > 0 && (
                <View style={styles.list}>
                  <Text style={styles.label}>{t('materials')}</Text>
                  {session.materials.map((file) => (
                    <FileLink key={file.id} file={file} />
                  ))}
                </View>
              )}
              {canChoose && (
                <Toggle
                  label={t('schedule.add', { title: session.title })}
                  value={choice.ids.includes(session.id)}
                  onChange={() => {
                    setSaved(false);
                    setChoice((current) => ({
                      ...current,
                      ids: toggleSession(current.ids, session.id),
                    }));
                  }}
                />
              )}
            </Card>
          ))}
        </View>
      ))}
      {canChoose && sessions.length > 0 && (
        <>
          <Button label={t('schedule.save')} pending={pending} onPress={() => void save()} />
          <Button
            label={t('schedule.view')}
            variant="link"
            onPress={() => router.push('/events/schedule')}
          />
        </>
      )}
      {saved && <Notice tone="success">{t('schedule.saved')}</Notice>}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
    </View>
  );
}

function SpeakerPhoto({ fileId }: { fileId: string }) {
  const url = useFileUrl(fileId, 'thumb');
  if (!url) return <View style={styles.photo} />;
  return <Image source={{ uri: url }} style={styles.photo} contentFit="cover" />;
}

/** The events the member registered for, with the sessions they chose. */
export function MySchedule() {
  const all = useTranslations();
  const t = useTranslations('events');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const router = useRouter();
  const { day, range, timeRange } = useEventTime();
  const { request } = useSession();
  const [items, setItems] = useState<Schedule | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<{ items: Schedule }>(`/api/v1/me/schedule?locale=${locale}`)
      .then((result) => {
        if (!active) return;
        setError(null);
        setItems(result.items);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, locale]);

  return (
    <Screen>
      <Button label={t('event.back')} variant="link" onPress={() => router.navigate('/events')} />
      <Title>{t('schedule.title')}</Title>
      <Body muted>{t('schedule.intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!items && error === null && <Body muted>{m('loading')}</Body>}
      {items?.length === 0 && <Body muted>{t('schedule.empty')}</Body>}
      {items && items.length > 0 && (
        <CalendarButton
          label={t('schedule.download')}
          path={`/api/v1/me/schedule.ics?locale=${locale}`}
          title={t('schedule.title')}
        />
      )}
      {items?.map((event) => (
        <Card key={event.slug}>
          <Button
            label={event.title}
            variant="link"
            onPress={() => router.push(`/events/${encodeURIComponent(event.slug)}`)}
          />
          {(event.cancelled || event.status === 'WAITLISTED') && (
            <View style={styles.tags}>
              {event.cancelled && <Tag tone="danger">{t('schedule.cancelled')}</Tag>}
              {event.status === 'WAITLISTED' && <Tag tone="warning">{t('schedule.waiting')}</Tag>}
            </View>
          )}
          <Text style={styles.meta}>
            {range(event.startAt, event.endAt, event.timezone)}
            {event.locationName ? ` · ${event.locationName}` : ''}
          </Text>
          {event.sessions.length === 0 && <Body muted>{t('schedule.noSessions')}</Body>}
          {event.sessions.map((session) => (
            <View key={session.id} style={styles.chosen}>
              <Text style={styles.meta}>
                {`${day(session.startAt, event.timezone)} · ${timeRange(session.startAt, session.endAt, event.timezone)}`}
                {session.room ? ` · ${t('event.room', { room: session.room })}` : ''}
              </Text>
              <Text style={styles.strong}>{session.title}</Text>
              {session.overlaps && <Tag tone="warning">{t('schedule.overlap')}</Tag>}
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.8 },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.neutral[100] },
  cardText: { padding: 16, gap: 6 },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  small: { fontSize: 14, lineHeight: 20, color: semantic.text },
  strong: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: semantic.text },
  label: { fontSize: 14, fontWeight: '600', color: semantic.text },
  cardTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    color: semantic.primary,
    textDecorationLine: 'underline',
  },
  summary: { fontSize: 16, lineHeight: 24, color: semantic.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lead: { fontSize: 18, lineHeight: 28, color: semantic.textMuted },
  fact: { gap: 2 },
  section: { gap: 12 },
  day: { fontSize: 18, fontWeight: '600', color: semantic.text },
  list: { gap: 8 },
  speaker: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  speakerText: { flex: 1, gap: 2 },
  photo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.neutral[100] },
  source: { borderWidth: 1, borderColor: semantic.border, borderRadius: 10, padding: 12 },
  chosen: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
});
