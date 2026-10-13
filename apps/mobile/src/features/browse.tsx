import { ApiError, type components } from '@iua/api-client';
import { colors, semantic } from '@iua/ui-tokens';
import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { useFileUrl } from './files';
import { appRoute } from './notifications-model';
import { useHospitals, useLocalName, useSubspecialties } from './reference';

type Schemas = components['schemas'];
type Guideline = Schemas['PublicGuidelineListDto']['items'][number];
type GuidelineDetail = Schemas['PublicGuidelineDto'];
type Member = Schemas['DirectoryListDto']['items'][number];
type MemberDetail = Schemas['DirectoryMemberDto'];
type Results = Schemas['SearchResultsDto'];
type Group = Results['groups'][number];
type Status = Guideline['status'];

const PAGE_SIZE = 10;
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

/** A guideline's date: the day, or only the year when that is all that is known. */
function useGuidelineDate() {
  const format = useFormatter();
  return (date: string, yearOnly: boolean) =>
    yearOnly
      ? format.dateTime(new Date(date), { year: 'numeric' })
      : format.dateTime(new Date(date), { dateStyle: 'long' });
}

/** A screen that could not be loaded, or whose item does not exist for this reader. */
function Failed({ error }: { error: unknown }) {
  const t = useTranslations();
  const missing = error instanceof ApiError && error.code === 'NOT_FOUND';
  return (
    <Screen>
      <Back />
      {missing ? (
        <>
          <Title>{t('content.common.notFoundTitle')}</Title>
          <Body muted>{t('content.common.notFoundBody')}</Body>
        </>
      ) : (
        <Notice tone="error">{errorMessage(error, t)}</Notice>
      )}
    </Screen>
  );
}

/** Links to the official clinical guidelines; the documents stay with their publishers. */
export function GuidelinesList() {
  const all = useTranslations();
  const t = useTranslations('content.guidelines');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const name = useLocalName();
  const date = useGuidelineDate();
  const router = useRouter();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [subspecialty, setSubspecialty] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; items: Guideline[]; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${locale}:${subspecialty}:${status}`;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      locale,
      page: String(pages),
      pageSize: String(PAGE_SIZE),
      ...(subspecialty ? { subspecialty } : {}),
      ...(status ? { status } : {}),
    });
    request<Schemas['PublicGuidelineListDto']>(`/api/v1/guidelines?${query.toString()}`)
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
  }, [request, locale, subspecialty, status, pages, key]);

  const shown = list?.key === key ? list : null;
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      <Choices<Status | ''>
        label={t('status')}
        value={status}
        onChange={(next) => {
          setStatus(next);
          setPages(1);
        }}
        options={[
          { value: '', label: t('allStatuses') },
          ...(['CURRENT', 'SUPERSEDED', 'WITHDRAWN'] as const).map((value) => ({
            value,
            label: t(`statuses.${value}`),
          })),
        ]}
      />
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
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && <Body muted>{t('empty')}</Body>}
      {shown?.items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => router.push(`/guidelines/${encodeURIComponent(item.id)}` as Href)}
          accessibilityRole="link"
          accessibilityLabel={item.title}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <Text style={styles.meta}>
            {item.sourceOrg}
            {item.publishedOn ? ` · ${date(item.publishedOn, item.yearOnly)}` : ''}
          </Text>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <View style={styles.tags}>
            <Tag tone={item.status === 'CURRENT' ? 'success' : 'warning'}>
              {t(`statuses.${item.status}`)}
            </Tag>
            {item.subspecialty && <Tag>{name(item.subspecialty)}</Tag>}
            {item.accessTier !== 'PUBLIC' && (
              <Tag>
                {all(
                  `content.common.tiers.${item.accessTier === 'VERIFIED' ? 'VERIFIED' : 'MEMBERS'}`,
                )}
              </Tag>
            )}
          </View>
        </Pressable>
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

/** One guideline: where it is published, the association's summary, and its earlier versions. */
export function GuidelineView({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('content.guidelines');
  const locale = useLocale();
  const name = useLocalName();
  const date = useGuidelineDate();
  const { request } = useSession();
  const [found, setFound] = useState<{ key: string; item: GuidelineDetail } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${id}:${locale}`;

  useEffect(() => {
    let active = true;
    request<GuidelineDetail>(`/api/v1/guidelines/${encodeURIComponent(id)}?locale=${locale}`)
      .then((item) => {
        if (!active) return;
        setError(null);
        setFound({ key, item });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, id, locale, key]);

  const item = found?.key === key ? found.item : null;
  if (error !== null && !item) return <Failed error={error} />;
  if (!item) {
    return (
      <Screen>
        <Back />
        <Body muted>{all('mobile.loading')}</Body>
      </Screen>
    );
  }
  const hint = all('mobile.news.fileHint');
  return (
    <Screen>
      <Back />
      {item.fallback && <Notice>{all('content.common.fallbackNotice')}</Notice>}
      <Title>{item.title}</Title>
      <View style={styles.tags}>
        <Tag tone={item.status === 'CURRENT' ? 'success' : 'warning'}>
          {t(`statuses.${item.status}`)}
        </Tag>
        {item.subspecialty && <Tag>{name(item.subspecialty)}</Tag>}
      </View>
      <Card>
        <Fact label={t('source')}>{item.sourceOrg}</Fact>
        {item.version && <Fact label={t('version')}>{item.version}</Fact>}
        {item.publishedOn && (
          <Fact label={t('publishedOn')}>{date(item.publishedOn, item.yearOnly)}</Fact>
        )}
        {item.evidenceLevel && <Fact label={t('evidenceLevel')}>{item.evidenceLevel}</Fact>}
      </Card>
      <Button label={t('officialLink')} hint={hint} onPress={() => open(item.officialUrl)} />
      {item.summary && (
        <>
          <Heading>{t('summaryTitle')}</Heading>
          <Body>{item.summary}</Body>
        </>
      )}
      {item.versions.length > 0 && (
        <>
          <Heading>{t('versions')}</Heading>
          {item.versions.map((version) => (
            <Card key={version.id}>
              <Text style={styles.strong}>
                {`${version.version} · ${date(version.publishedOn, version.yearOnly)}`}
              </Text>
              {version.licenseNote ? (
                <Body muted>{`${t('licenseNote')}: ${version.licenseNote}`}</Body>
              ) : null}
              {version.url && (
                <Button
                  label={t('versionLink')}
                  variant="link"
                  hint={hint}
                  onPress={() => open(version.url ?? '')}
                />
              )}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.strong}>{children}</Text>
    </View>
  );
}

/** The name a listed member shows, in the reader's language where they gave one. */
function useMemberName() {
  const locale = useLocale();
  const t = useTranslations('chat.list');
  return (member: Member) => {
    const own =
      locale === 'he' ? (member.nameHe ?? member.nameEn) : (member.nameEn ?? member.nameHe);
    const plain = [member.firstName, member.lastName].filter(Boolean).join(' ');
    return [member.title, own ?? plain].filter(Boolean).join(' ') || t('unknownPerson');
  };
}

function Photo({ fileId, size, label }: { fileId: string | null; size: number; label?: string }) {
  const url = useFileUrl(fileId, 'thumb');
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (!url) return <View style={[styles.photo, shape]} />;
  return (
    <Image
      source={{ uri: url }}
      style={shape}
      contentFit="cover"
      accessible={Boolean(label)}
      accessibilityLabel={label}
    />
  );
}

/** Members who chose to be listed. Open to members with an active membership. */
export function Directory() {
  const all = useTranslations();
  const t = useTranslations('directory.list');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const memberName = useMemberName();
  const router = useRouter();
  const hospitals = useHospitals();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [subspecialtyId, setSubspecialtyId] = useState('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; items: Member[]; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${q}:${hospitalId}:${subspecialtyId}`;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      page: String(pages),
      ...(q ? { q } : {}),
      ...(hospitalId ? { hospitalId } : {}),
      ...(subspecialtyId ? { subspecialtyId } : {}),
    });
    request<Schemas['DirectoryListDto']>(`/api/v1/members?${query.toString()}`)
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
  }, [request, q, hospitalId, subspecialtyId, pages, key]);

  const shown = list?.key === key ? list : null;
  const forbidden = error instanceof ApiError && error.status === 403;
  const search = () => {
    setQ(typed.trim());
    setPages(1);
  };
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      <Field
        label={t('search')}
        value={typed}
        onChangeText={setTyped}
        returnKeyType="search"
        onSubmitEditing={search}
      />
      <Button label={t('searchButton')} variant="secondary" onPress={search} />
      {hospitals.length > 0 && (
        <Choices
          label={t('hospital')}
          value={hospitalId}
          onChange={(next) => {
            setHospitalId(next);
            setPages(1);
          }}
          options={[
            { value: '', label: t('allHospitals') },
            ...hospitals.map((h) => ({ value: h.id, label: name(h) })),
          ]}
        />
      )}
      {subspecialties.length > 0 && (
        <Choices
          label={t('subspecialty')}
          value={subspecialtyId}
          onChange={(next) => {
            setSubspecialtyId(next);
            setPages(1);
          }}
          options={[
            { value: '', label: t('allSubspecialties') },
            ...subspecialties.map((s) => ({ value: s.id, label: name(s) })),
          ]}
        />
      )}
      {forbidden ? (
        <Notice tone="warning">{t('membersOnly')}</Notice>
      ) : (
        error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>
      )}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown && <Body muted>{t('total', { total: shown.total })}</Body>}
      {shown?.items.length === 0 && <Body muted>{t('empty')}</Body>}
      {shown?.items.map((member) => (
        <Pressable
          key={member.id}
          onPress={() => router.push(`/members/${encodeURIComponent(member.id)}` as Href)}
          accessibilityRole="link"
          accessibilityLabel={memberName(member)}
          style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
        >
          <Photo fileId={member.photoFileId} size={52} />
          <View style={styles.fill}>
            <Text style={styles.cardTitle}>{memberName(member)}</Text>
            {member.position ? <Text style={styles.meta}>{member.position}</Text> : null}
            {member.hospital && <Text style={styles.meta}>{name(member.hospital)}</Text>}
          </View>
        </Pressable>
      ))}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
      <Body muted>{t('joinHint')}</Body>
      <Button label={t('profileLink')} variant="link" onPress={() => router.push('/profile')} />
    </Screen>
  );
}

/** A listed member's page: only what they chose to show. */
export function MemberPage({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('directory.member');
  const name = useLocalName();
  const memberName = useMemberName();
  const router = useRouter();
  const { request } = useSession();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [writeError, setWriteError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<MemberDetail>(`/api/v1/members/${encodeURIComponent(id)}`)
      .then((result) => active && setMember(result))
      .catch((caught: unknown) => active && setError(caught));
    request<{ id: string }>('/api/v1/me')
      .then((me) => active && setMeId(me.id))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, id]);

  if (error !== null && !member) return <Failed error={error} />;
  if (!member) {
    return (
      <Screen>
        <Back />
        <Body muted>{all('mobile.loading')}</Body>
      </Screen>
    );
  }
  const shown = memberName(member);
  const more =
    member.position ||
    member.hospital ||
    member.subspecialties.length > 0 ||
    member.bio ||
    member.researchInterests ||
    member.orcid ||
    member.languages.length > 0 ||
    member.contactEmail ||
    member.contactPhone;

  async function write() {
    setWriteError(null);
    try {
      const opened = await request<{ id: string }>('/api/v1/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      router.push(`/thread/direct/${encodeURIComponent(opened.id)}` as Href);
    } catch (caught) {
      setWriteError(caught);
    }
  }

  return (
    <Screen>
      <Back />
      <View style={styles.row}>
        <Photo fileId={member.photoFileId} size={84} label={t('photoAlt', { name: shown })} />
        <View style={styles.fill}>
          <Title>{shown}</Title>
        </View>
      </View>
      {!more && <Body muted>{t('nameOnly')}</Body>}
      {more ? (
        <Card>
          {member.position && <Fact label={t('position')}>{member.position}</Fact>}
          {member.hospital && (
            <Fact label={t('institution')}>
              {[name(member.hospital), member.department ? name(member.department) : null]
                .filter(Boolean)
                .join(' · ')}
            </Fact>
          )}
          {member.subspecialties.length > 0 && (
            <Fact label={t('subspecialties')}>{member.subspecialties.map(name).join(', ')}</Fact>
          )}
          {member.languages.length > 0 && (
            <Fact label={t('languages')}>{member.languages.join(', ')}</Fact>
          )}
          {member.orcid && <Fact label={t('orcid')}>{member.orcid}</Fact>}
        </Card>
      ) : null}
      {member.bio && (
        <>
          <Heading>{t('bio')}</Heading>
          <Body>{member.bio}</Body>
        </>
      )}
      {member.researchInterests && (
        <>
          <Heading>{t('researchInterests')}</Heading>
          <Body>{member.researchInterests}</Body>
        </>
      )}
      {member.contactEmail && (
        <Button
          label={`${t('contactEmail')}: ${member.contactEmail}`}
          variant="link"
          onPress={() => open(`mailto:${member.contactEmail}`)}
        />
      )}
      {member.contactPhone && (
        <Button
          label={`${t('contactPhone')}: ${member.contactPhone}`}
          variant="link"
          onPress={() => open(`tel:${member.contactPhone}`)}
        />
      )}
      {meId !== null && meId !== id && (
        <Button label={all('chat.start.write', { name: shown })} onPress={() => void write()} />
      )}
      {writeError !== null && <Notice tone="error">{errorMessage(writeError, all)}</Notice>}
    </Screen>
  );
}

/** One search over news, events, education, guidelines and, for members, the directory. */
export function Search() {
  const all = useTranslations();
  const t = useTranslations('search');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  /** One kind of result shown in full, or all kinds with their first few. */
  const [only, setOnly] = useState<Group['type'] | ''>('');
  const [pages, setPages] = useState(1);
  const [results, setResults] = useState<{ key: string; groups: Group[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${q}:${locale}:${only}`;

  useEffect(() => {
    if (q.length < 2) return;
    let active = true;
    const query = new URLSearchParams({
      q,
      locale,
      ...(only ? { types: only, page: String(pages) } : {}),
    });
    request<Results>(`/api/v1/search?${query.toString()}`)
      .then((data) => {
        if (!active) return;
        setError(null);
        setResults((current) => {
          if (!only || pages === 1 || current?.key !== key) return { key, groups: data.groups };
          // A further page of the one kind is added to what is shown.
          return {
            key,
            groups: current.groups.map((group) => {
              const next = data.groups.find((x) => x.type === group.type);
              return next ? { ...next, items: [...group.items, ...next.items] } : group;
            }),
          };
        });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, q, locale, only, pages, key]);

  const shown = q.length >= 2 && results?.key === key ? results.groups : null;
  const found = shown?.filter((group) => group.items.length > 0) ?? [];
  const search = () => {
    setQ(typed.trim());
    setOnly('');
    setPages(1);
  };
  return (
    <Screen>
      <Back />
      <Title>{t('page.title')}</Title>
      <Body muted>{t('page.intro')}</Body>
      <Field
        label={t('box.label')}
        value={typed}
        onChangeText={setTyped}
        returnKeyType="search"
        onSubmitEditing={search}
      />
      <Button label={t('box.button')} disabled={typed.trim().length < 2} onPress={search} />
      {q.length < 2 && <Body muted>{t('page.prompt')}</Body>}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {q.length >= 2 && !shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown && found.length === 0 && <Body muted>{t('page.empty', { q })}</Body>}
      {shown && found.length > 0 && (
        <Text style={styles.meta} accessibilityLiveRegion="polite">
          {t('page.resultsFor', { q })}
        </Text>
      )}
      {only !== '' && (
        <Button
          label={t('page.backToAll')}
          variant="link"
          onPress={() => {
            setOnly('');
            setPages(1);
          }}
        />
      )}
      {found.map((group) => (
        <View key={group.type} style={styles.section}>
          <Heading>{t(`page.types.${group.type}`)}</Heading>
          <Text style={styles.meta}>{t('page.count', { total: group.total })}</Text>
          {group.items.map((item) => {
            const route = appRoute(item.link);
            return (
              <View key={item.id} style={styles.card}>
                {route ? (
                  <Button
                    label={item.title}
                    variant="link"
                    onPress={() => router.push(route as Href)}
                  />
                ) : (
                  <Text style={styles.strong}>{item.title}</Text>
                )}
                {item.excerpt ? <Text style={styles.meta}>{item.excerpt}</Text> : null}
              </View>
            );
          })}
          {only === '' && group.total > group.items.length && (
            <Button
              label={t('page.showAllIn', {
                total: group.total,
                type: t(`page.types.${group.type}`),
              })}
              variant="secondary"
              onPress={() => {
                setOnly(group.type);
                setPages(1);
              }}
            />
          )}
          {only !== '' && group.total > group.items.length && (
            <Button
              label={m('news.more')}
              variant="secondary"
              onPress={() => setPages((n) => n + 1)}
            />
          )}
        </View>
      ))}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fill: { flex: 1, gap: 2 },
  pressed: { opacity: 0.8 },
  cardTitle: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    color: semantic.primary,
    textDecorationLine: 'underline',
  },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  strong: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: semantic.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { gap: 2 },
  section: { gap: 8 },
  photo: { backgroundColor: colors.neutral[100] },
});
