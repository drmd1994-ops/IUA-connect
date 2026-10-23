import { ApiError, type components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Markdown } from '@/ui/markdown';
import { Choices, Tag } from '@/ui/parts';
import { useHospitals, useLocalName, useSubspecialties } from './reference';
import { PersonMark } from './verification';
import { useGuest } from './visitor';

/**
 * Jobs, fellowships and mentorship (M28), as on the site. Positions are open to visitors too
 * (owner answer §10.4); saving, mentors and requests need an account, and mentors are for
 * verified people. Writing and reviewing positions stays on the site, like the admin area.
 */

type Schemas = components['schemas'];
type PositionList = Schemas['PositionListDto'];
type Summary = PositionList['items'][number];
type Position = Schemas['PositionDto'];
type Place = Summary['place'];
type Kind = Summary['kind'];
type MentorList = Schemas['MentorListDto'];
type Mentor = MentorList['items'][number];
type Mentorship = Schemas['MentorshipDto'];
type Settings = Schemas['MentorSettingsDto'];
type SettingsInput = Schemas['MentorSettingsInputDto'];

const PAGE_SIZE = 10;
const KINDS: Kind[] = ['JOB', 'FELLOWSHIP', 'RESEARCH'];
const LANGUAGES = ['he', 'en', 'ar', 'ru', 'am', 'fr', 'es', 'de', 'ro', 'it', 'pt', 'uk'];
const json = { 'Content-Type': 'application/json' };
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

/** "Department, Hospital, City" or "Institution, City, Country". */
function usePlace() {
  const name = useLocalName();
  const locale = useLocale();
  const m = useTranslations('mobile.countries');
  return (place: Place) => {
    if (place.hospital) {
      const city = locale === 'en' ? place.hospital.cityEn : place.hospital.cityHe;
      return [place.department ? name(place.department) : null, name(place.hospital), city]
        .filter(Boolean)
        .join(', ');
    }
    const country = m.has(place.country) ? m(place.country) : place.country;
    return [place.institutionName, place.city, country].filter(Boolean).join(', ');
  };
}

/** A date column ("YYYY-MM-DD") in the reader's words. */
function useDay() {
  const format = useFormatter();
  return (day: string) => format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: 'long' });
}

/** The ways on from the positions: saved positions and mentorship, for a signed-in person. */
function CareersLinks() {
  const t = useTranslations('careers.tabs');
  const m = useTranslations('mobile.careers');
  const router = useRouter();
  const { guest } = useGuest();
  if (guest) return null;
  return (
    <Card>
      <Heading>{m('links')}</Heading>
      <Button
        label={t('saved')}
        variant="secondary"
        onPress={() => router.push('/positions/saved')}
      />
      <Button label={t('mentors')} variant="secondary" onPress={() => router.push('/mentorship')} />
      <Button
        label={t('requests')}
        variant="secondary"
        onPress={() => router.push('/mentorship/requests')}
      />
      <Button
        label={t('settings')}
        variant="secondary"
        onPress={() => router.push('/mentorship/settings')}
      />
    </Card>
  );
}

function PositionCard({ item }: { item: Summary }) {
  const t = useTranslations('careers');
  const locale = useLocale();
  const name = useLocalName();
  const place = usePlace();
  const day = useDay();
  const router = useRouter();
  const title =
    (locale === 'en' ? item.titleEn : item.titleHe) ?? item.titleHe ?? item.titleEn ?? '';
  return (
    <Pressable
      onPress={() => router.push(`/positions/${encodeURIComponent(item.id)}` as Href)}
      accessibilityRole="link"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.meta}>{t(`kinds.${item.kind}`)}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.text}>{place(item.place)}</Text>
      <Text style={styles.meta}>
        {t('positions.for', { audience: t(`audiences.${item.audience}`) })}
      </Text>
      <Text style={styles.meta}>{t('positions.applyBy', { date: day(item.closesOn) })}</Text>
      <View style={styles.tags}>
        {item.saved && <Tag tone="success">{t('positions.savedMark')}</Tag>}
        {item.subspecialties.map((s) => (
          <Tag key={s.id}>{name(s)}</Tag>
        ))}
      </View>
    </Pressable>
  );
}

/** The open positions, with search. */
export function PositionsScreen() {
  const all = useTranslations();
  const t = useTranslations('careers.positions');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind | ''>('');
  const [subspecialty, setSubspecialty] = useState('');
  const [country, setCountry] = useState('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; data: PositionList } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${q}:${kind}:${subspecialty}:${country}`;
  const countryName = useTranslations('mobile.countries');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      page: String(pages),
      pageSize: String(PAGE_SIZE),
      ...(q ? { q } : {}),
      ...(kind ? { kind } : {}),
      ...(subspecialty ? { subspecialty } : {}),
      ...(country ? { country } : {}),
    });
    request<PositionList>(`/api/v1/positions?${query.toString()}`)
      .then((result) => {
        if (!active) return;
        setError(null);
        setList((current) => ({
          key,
          data:
            pages > 1 && current?.key === key
              ? { ...result, items: [...current.data.items, ...result.items] }
              : result,
        }));
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, q, kind, subspecialty, country, pages, key]);

  const shown = list?.key === key ? list.data : null;
  const reset = () => setPages(1);
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      <Field
        label={t('search')}
        hint={t('searchHint')}
        value={typed}
        onChangeText={setTyped}
        maxLength={100}
        returnKeyType="search"
        onSubmitEditing={() => {
          setQ(typed.trim());
          reset();
        }}
      />
      <Choices<Kind | ''>
        label={t('kind')}
        value={kind}
        onChange={(next) => {
          setKind(next);
          reset();
        }}
        options={[
          { value: '', label: t('allKinds') },
          ...KINDS.map((value) => ({ value, label: all(`careers.kinds.${value}`) })),
        ]}
      />
      {subspecialties.length > 0 && (
        <Choices
          label={t('subspecialty')}
          value={subspecialty}
          onChange={(next) => {
            setSubspecialty(next);
            reset();
          }}
          options={[
            { value: '', label: t('allSubspecialties') },
            ...subspecialties.map((s) => ({ value: s.key, label: name(s) })),
          ]}
        />
      )}
      {(list?.data.countries.length ?? 0) > 1 && (
        <Choices
          label={t('country')}
          value={country}
          onChange={(next) => {
            setCountry(next);
            reset();
          }}
          options={[
            { value: '', label: t('allCountries') },
            ...list!.data.countries.map((code) => ({
              value: code,
              label: countryName.has(code) ? countryName(code) : code,
            })),
          ]}
        />
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && <Body muted>{t('empty')}</Body>}
      {shown?.items.map((item) => (
        <PositionCard key={item.id} item={item} />
      ))}
      {shown && shown.items.length > 0 && (
        <Body muted>{m('news.shown', { shown: shown.items.length, total: shown.total })}</Body>
      )}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
      <CareersLinks />
    </Screen>
  );
}

/** One position, with how to apply. */
export function PositionScreen({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('careers.positions');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const name = useLocalName();
  const place = usePlace();
  const day = useDay();
  const { guest } = useGuest();
  const { request } = useSession();
  const [item, setItem] = useState<Position | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    request<Position>(`/api/v1/positions/${encodeURIComponent(id)}`)
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, id]);

  async function toggleSave() {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      await request(`/api/v1/positions/${encodeURIComponent(item.id)}/saved`, {
        method: item.saved ? 'DELETE' : 'PUT',
      });
      setItem({ ...item, saved: !item.saved });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (error !== null && !item) {
    const missing = error instanceof ApiError && error.code === 'NOT_FOUND';
    return (
      <Screen>
        <Back />
        <Notice tone="error">{missing ? t('notFound') : errorMessage(error, all)}</Notice>
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen>
        <Back />
        <Body muted>{m('loading')}</Body>
      </Screen>
    );
  }
  const lang: 'he' | 'en' = item.translations[locale] ? locale : locale === 'he' ? 'en' : 'he';
  const text = item.translations[lang]!;
  return (
    <Screen>
      <Back />
      <Body muted>{all(`careers.kinds.${item.kind}`)}</Body>
      <Title>{text.title}</Title>
      <Body>{place(item.place)}</Body>
      <Body muted>{t('for', { audience: all(`careers.audiences.${item.audience}`) })}</Body>
      {item.subspecialties.length > 0 && (
        <Body muted>
          {t('subspecialties')}: {item.subspecialties.map((s) => name(s)).join(', ')}
        </Body>
      )}
      <Heading>
        {item.closed
          ? t('closedOn', { date: day(item.closesOn) })
          : t('applyBy', { date: day(item.closesOn) })}
      </Heading>
      {item.organisation && <Body muted>{t('from', { name: name(item.organisation) })}</Body>}
      {item.closed && <Notice tone="warning">{t('closed')}</Notice>}
      {!guest && (
        <Button
          label={item.saved ? t('unsave') : t('save')}
          variant="secondary"
          pending={pending}
          onPress={() => void toggleSave()}
        />
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {text.body.trim() !== '' && (
        <Card>
          <Heading>{t('details')}</Heading>
          <Markdown>{text.body}</Markdown>
        </Card>
      )}
      {!item.closed && (
        <Card>
          <Heading>{t('howToApply')}</Heading>
          {item.applyUrl && (
            <Button label={t('applyLink')} variant="link" onPress={() => open(item.applyUrl!)} />
          )}
          {item.applyEmail && (
            <Button
              label={t('applyEmail', { email: item.applyEmail })}
              variant="link"
              onPress={() => open(`mailto:${item.applyEmail}`)}
            />
          )}
          <Body muted>{t('applyNote')}</Body>
        </Card>
      )}
    </Screen>
  );
}

/** The reader's saved positions. */
export function SavedPositionsScreen() {
  const all = useTranslations();
  const t = useTranslations('careers.saved');
  const m = useTranslations('mobile');
  const { request } = useSession();
  const [items, setItems] = useState<Summary[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<{ items: Summary[] }>('/api/v1/positions/saved')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!items && error === null && <Body muted>{m('loading')}</Body>}
      {items?.length === 0 && <Body muted>{t('empty')}</Body>}
      {items?.map((item) => (
        <PositionCard key={item.id} item={item} />
      ))}
    </Screen>
  );
}

/** The mentors, for verified people. */
export function MentorsScreen() {
  const all = useTranslations();
  const t = useTranslations('careers.mentors');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const hospitals = useHospitals();
  const router = useRouter();
  const { request } = useSession();
  const [subspecialty, setSubspecialty] = useState('');
  const [hospital, setHospital] = useState('');
  const [language, setLanguage] = useState('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; data: MentorList } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${subspecialty}:${hospital}:${language}`;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      page: String(pages),
      pageSize: String(PAGE_SIZE),
      ...(subspecialty ? { subspecialty } : {}),
      ...(hospital ? { hospital } : {}),
      ...(language ? { language } : {}),
    });
    request<MentorList>(`/api/v1/mentorship/mentors?${query.toString()}`)
      .then((result) => {
        if (!active) return;
        setError(null);
        setList((current) => ({
          key,
          data:
            pages > 1 && current?.key === key
              ? { ...result, items: [...current.data.items, ...result.items] }
              : result,
        }));
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, subspecialty, hospital, language, pages, key]);

  const notVerified =
    error instanceof ApiError && error.details.some((detail) => detail.code === 'membersOnly');
  if (notVerified) {
    return (
      <Screen>
        <Back />
        <Title>{t('title')}</Title>
        <Notice>{t('verifiedOnly')}</Notice>
        <Button label={t('verifyLink')} onPress={() => router.push('/verification')} />
      </Screen>
    );
  }
  const shown = list?.key === key ? list.data : null;
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {subspecialties.length > 0 && (
        <Choices
          label={t('subspecialty')}
          value={subspecialty}
          onChange={(next) => {
            setSubspecialty(next);
            setPages(1);
          }}
          options={[
            { value: '', label: t('allSubspecialties') },
            ...subspecialties.map((s) => ({ value: s.key, label: name(s) })),
          ]}
        />
      )}
      {hospitals.length > 0 && (
        <Choices
          label={t('hospital')}
          value={hospital}
          onChange={(next) => {
            setHospital(next);
            setPages(1);
          }}
          options={[
            { value: '', label: t('allHospitals') },
            ...hospitals.map((h) => ({ value: h.id, label: name(h) })),
          ]}
        />
      )}
      <Choices
        label={t('language')}
        value={language}
        onChange={(next) => {
          setLanguage(next);
          setPages(1);
        }}
        options={[
          { value: '', label: t('allLanguages') },
          ...LANGUAGES.map((code) => ({ value: code, label: m(`languages.${code}`) })),
        ]}
      />
      <Body muted>{t('rules')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && <Body muted>{t('empty')}</Body>}
      {shown?.items.map((mentor) => (
        <MentorCard key={mentor.person.id} mentor={mentor} />
      ))}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
    </Screen>
  );
}

/** A mentor, and the request to them; once sent, the card says so until the list is read again. */
function MentorCard({ mentor }: { mentor: Mentor }) {
  const all = useTranslations();
  const t = useTranslations('careers.mentors');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const { request } = useSession();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const person = mentor.person;
  const fullName = `${person.firstName} ${person.lastName}`;
  const place = [
    person.department ? name(person.department) : null,
    person.hospital ? name(person.hospital) : null,
  ]
    .filter(Boolean)
    .join(', ');

  async function send() {
    setPending(true);
    setError(null);
    try {
      await request('/api/v1/mentorship/requests', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ mentorId: person.id, message: message.trim() }),
      });
      setSent(true);
      setAsking(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <Heading>{fullName}</Heading>
      {place !== '' && <Body>{place}</Body>}
      {mentor.subspecialties.length > 0 && (
        <View style={styles.tags}>
          {mentor.subspecialties.map((s) => (
            <Tag key={s.id}>{name(s)}</Tag>
          ))}
        </View>
      )}
      {mentor.academicInterests !== '' && (
        <Fact label={t('academic')}>{mentor.academicInterests}</Fact>
      )}
      {mentor.careerInterests !== '' && <Fact label={t('career')}>{mentor.careerInterests}</Fact>}
      {mentor.availability !== '' && <Fact label={t('availability')}>{mentor.availability}</Fact>}
      {mentor.languages.length > 0 && (
        <Fact label={t('languages')}>
          {mentor.languages
            .map((code) => (m.has(`languages.${code}`) ? m(`languages.${code}`) : code))
            .join(', ')}
        </Fact>
      )}
      {sent && <Notice tone="success">{t('sent', { name: fullName })}</Notice>}
      {!sent && mentor.mine?.state === 'PENDING' && <Notice>{t('waiting')}</Notice>}
      {mentor.mine?.state === 'ACCEPTED' && <Body>{t('yourMentor')}</Body>}
      {!mentor.mine && !mentor.taking && <Body muted>{t('notTaking')}</Body>}
      {!mentor.mine && mentor.taking && !asking && !sent && (
        <Button
          label={t('ask')}
          hint={t('askLabel', { name: fullName })}
          variant="secondary"
          onPress={() => setAsking(true)}
        />
      )}
      {asking && (
        <>
          <Field
            label={t('message', { name: fullName })}
            hint={t('messageHint')}
            value={message}
            onChangeText={setMessage}
            maxLength={1000}
            multiline
          />
          <Button
            label={t('send')}
            pending={pending}
            disabled={!message.trim()}
            onPress={() => void send()}
          />
          <Button label={t('cancel')} variant="secondary" onPress={() => setAsking(false)} />
        </>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.strong}>{label}</Text>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

type Step = 'accept' | 'decline' | 'withdraw' | 'end';

/** The reader's requests and mentorships, on both sides. */
export function MentorshipRequestsScreen() {
  const all = useTranslations();
  const t = useTranslations('careers.requests');
  const m = useTranslations('mobile');
  const router = useRouter();
  const { request } = useSession();
  const [items, setItems] = useState<Mentorship[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    request<{ items: Mentorship[] }>('/api/v1/mentorship/requests')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  async function act(item: Mentorship, step: Step) {
    setPending(item.id);
    setError(null);
    try {
      const next = await request<Mentorship>(
        `/api/v1/mentorship/requests/${encodeURIComponent(item.id)}/${step}`,
        { method: 'POST' },
      );
      setItems((current) => current && current.map((x) => (x.id === next.id ? next : x)));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  const section = (role: 'mentor' | 'mentee') => {
    const mine = items?.filter((item) => item.role === role) ?? [];
    return (
      <Card>
        <Heading>{t(role === 'mentor' ? 'toYou' : 'yours')}</Heading>
        {mine.length === 0 && (
          <Body muted>{t(role === 'mentor' ? 'emptyToYou' : 'emptyYours')}</Body>
        )}
        {mine.length === 0 && role === 'mentee' && (
          <Button
            label={t('findMentor')}
            variant="link"
            onPress={() => router.push('/mentorship')}
          />
        )}
        {mine.map((item) => (
          <RequestItem
            key={item.id}
            item={item}
            pending={pending === item.id}
            onStep={(step) => void act(item, step)}
          />
        ))}
      </Card>
    );
  };

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!items && error === null && <Body muted>{m('loading')}</Body>}
      {items && section('mentor')}
      {items && section('mentee')}
    </Screen>
  );
}

function RequestItem({
  item,
  pending,
  onStep,
}: {
  item: Mentorship;
  pending: boolean;
  onStep: (step: Step) => void;
}) {
  const t = useTranslations('careers.requests');
  const format = useFormatter();
  const name = useLocalName();
  const router = useRouter();
  const other = item.other;
  const place = [
    other.department ? name(other.department) : null,
    other.hospital ? name(other.hospital) : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={styles.request}>
      <View style={styles.tags}>
        <Text style={styles.strong}>{`${other.firstName} ${other.lastName}`}</Text>
        <PersonMark mark={other.mark} />
      </View>
      {place !== '' && <Text style={styles.text}>{place}</Text>}
      <Text style={styles.meta}>
        {t(`states.${item.state}`)} ·{' '}
        {t('sentOn', { date: format.dateTime(new Date(item.createdAt), { dateStyle: 'long' }) })}
      </Text>
      <Text style={styles.text}>{item.message}</Text>
      {item.role === 'mentor' && item.state === 'PENDING' && (
        <>
          <Button label={t('accept')} pending={pending} onPress={() => onStep('accept')} />
          <Button
            label={t('decline')}
            hint={t('declineNote')}
            variant="secondary"
            disabled={pending}
            onPress={() => onStep('decline')}
          />
          <Text style={styles.meta}>{t('declineNote')}</Text>
        </>
      )}
      {item.role === 'mentee' && item.state === 'PENDING' && (
        <Button
          label={t('withdraw')}
          variant="secondary"
          pending={pending}
          onPress={() => onStep('withdraw')}
        />
      )}
      {item.state === 'ACCEPTED' && (
        <>
          {item.conversationId && (
            <Button
              label={t('openChat')}
              onPress={() =>
                router.push(`/thread/direct/${encodeURIComponent(item.conversationId!)}` as Href)
              }
            />
          )}
          <Button
            label={t('end')}
            variant="secondary"
            pending={pending}
            onPress={() => onStep('end')}
          />
        </>
      )}
    </View>
  );
}

const EMPTY_SETTINGS: SettingsInput = {
  open: true,
  subspecialtyIds: [],
  academicInterests: '',
  careerInterests: '',
  availability: '',
  languages: [],
  capacity: 2,
};

/** A verified specialist's own mentor settings. */
export function MentorSettingsScreen() {
  const all = useTranslations();
  const t = useTranslations('careers.settings');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [loaded, setLoaded] = useState<Settings | null>(null);
  const [form, setForm] = useState<SettingsInput>(EMPTY_SETTINGS);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<Settings>('/api/v1/mentorship/settings')
      .then((result) => {
        if (!active) return;
        setLoaded(result);
        if (result.settings) setForm(result.settings);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  const set = (patch: Partial<SettingsInput>) => {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  };
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  async function save() {
    setPending(true);
    setError(null);
    try {
      const result = await request<Settings>('/api/v1/mentorship/settings', {
        method: 'PUT',
        headers: json,
        body: JSON.stringify(form),
      });
      setLoaded(result);
      if (result.settings) setForm(result.settings);
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
      <Body muted>{t('intro')}</Body>
      {!loaded && error === null && <Body muted>{m('loading')}</Body>}
      {loaded && !loaded.eligible && <Notice>{t('notEligible')}</Notice>}
      {loaded?.eligible && (
        <>
          <Body muted>{t('active', { count: loaded.active })}</Body>
          <Toggle
            label={t('open')}
            hint={t('openHint')}
            value={form.open}
            onChange={(open) => set({ open })}
          />
          <Card>
            <Heading>{t('subspecialties')}</Heading>
            {subspecialties.map((s) => (
              <Toggle
                key={s.id}
                label={name(s)}
                value={form.subspecialtyIds.includes(s.id)}
                onChange={() => set({ subspecialtyIds: toggle(form.subspecialtyIds, s.id) })}
              />
            ))}
          </Card>
          <Field
            label={t('academic')}
            value={form.academicInterests}
            onChangeText={(academicInterests) => set({ academicInterests })}
            maxLength={1000}
            multiline
          />
          <Field
            label={t('career')}
            hint={t('careerHint')}
            value={form.careerInterests}
            onChangeText={(careerInterests) => set({ careerInterests })}
            maxLength={1000}
            multiline
          />
          <Field
            label={t('availability')}
            hint={t('availabilityHint')}
            value={form.availability}
            onChangeText={(availability) => set({ availability })}
            maxLength={300}
          />
          <Card>
            <Heading>{t('languages')}</Heading>
            {LANGUAGES.map((code) => (
              <Toggle
                key={code}
                label={m(`languages.${code}`)}
                value={form.languages.includes(code)}
                onChange={() => set({ languages: toggle(form.languages, code) })}
              />
            ))}
          </Card>
          <Choices
            label={t('capacity')}
            value={String(form.capacity)}
            onChange={(next) => set({ capacity: Number(next) })}
            options={Array.from({ length: 10 }, (_, i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
          />
          <Body muted>{t('capacityHint')}</Body>
          {saved && <Notice tone="success">{t('saved')}</Notice>}
          <Button label={t('save')} pending={pending} onPress={() => void save()} />
        </>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: 14,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 12,
  },
  pressed: { opacity: 0.8 },
  cardTitle: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    color: semantic.primary,
    textDecorationLine: 'underline',
  },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  text: { fontSize: 16, lineHeight: 24, color: semantic.text },
  strong: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: semantic.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  fact: { gap: 2 },
  request: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
});
