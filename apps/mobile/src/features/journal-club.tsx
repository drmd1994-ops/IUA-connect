import { ApiError, type components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Heading, Notice, Screen, Title } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { useLocalName, useSubspecialties } from './reference';
import { PersonMark } from './verification';

/**
 * The journal club (M31), as on the site, for verified people (owner answer §10.2): this
 * month's entry and the archive, an entry with its anonymous poll, and the way to its discussion
 * in the community. Writing and publishing entries stay on the site, like the admin area.
 */

type Schemas = components['schemas'];
type List = Schemas['JournalClubListDto'];
type Summary = List['items'][number];
type Entry = Schemas['JournalClubEntryDto'];
type Poll = Entry['poll'];
type Answer = 'YES' | 'PERHAPS' | 'NO';

const ANSWERS: Answer[] = ['YES', 'PERHAPS', 'NO'];
const json = { 'Content-Type': 'application/json' };
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

function isNotVerified(error: unknown): boolean {
  return error instanceof ApiError && error.details.some((d) => d.code === 'membersOnly');
}

function NotVerified() {
  const t = useTranslations('journalClub.list');
  const router = useRouter();
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Notice>{t('verifiedOnly')}</Notice>
      <Button label={t('verifyLink')} onPress={() => router.push('/verification')} />
    </Screen>
  );
}

function useMonth() {
  const format = useFormatter();
  return (month: string) =>
    format.dateTime(new Date(`${month}-15T12:00:00Z`), { month: 'long', year: 'numeric' });
}

const where = (item: { journal: string | null; year: number | null }) =>
  [item.journal, item.year].filter(Boolean).join(', ');

function EntryCard({ item }: { item: Summary }) {
  const t = useTranslations('journalClub.list');
  const name = useLocalName();
  const month = useMonth();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/journal-club/${encodeURIComponent(item.id)}` as Href)}
      accessibilityRole="link"
      accessibilityLabel={item.articleTitle}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.meta}>{`${month(item.month)} · ${name(item.subspecialty)}`}</Text>
      <Text style={styles.cardTitle}>{item.articleTitle}</Text>
      {where(item) !== '' && <Text style={styles.meta}>{where(item)}</Text>}
      <Text style={styles.text}>{item.excerpt}</Text>
      {item.archived && (
        <View style={styles.tags}>
          <Tag>{t('archived')}</Tag>
        </View>
      )}
    </Pressable>
  );
}

/** This month's entry first, then the archive. */
export function JournalClubScreen() {
  const all = useTranslations();
  const t = useTranslations('journalClub.list');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [subspecialty, setSubspecialty] = useState('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; data: List } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = subspecialty;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      page: String(pages),
      ...(subspecialty ? { subspecialty } : {}),
    });
    request<List>(`/api/v1/journal-club?${query.toString()}`)
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
  }, [request, subspecialty, pages, key]);

  if (isNotVerified(error)) return <NotVerified />;
  const shown = list?.key === key ? list.data : null;
  const others = shown?.items.filter((item) => item.id !== shown.current?.id) ?? [];
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.current && (
        <>
          <Heading>{t('current')}</Heading>
          <EntryCard item={shown.current} />
        </>
      )}
      <Heading>{t('archive')}</Heading>
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
      {shown && others.length === 0 && <Body muted>{t('empty')}</Body>}
      {others.map((item) => (
        <EntryCard key={item.id} item={item} />
      ))}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
    </Screen>
  );
}

function Author({
  role,
  person,
}: {
  role: 'summaryBy' | 'commentaryBy';
  person: Entry['summaryAuthor'];
}) {
  const t = useTranslations('journalClub.entry');
  const name = useLocalName();
  if (!person) return null;
  return (
    <View style={styles.tags}>
      <Text style={styles.meta}>
        {[
          t(role, { name: `${person.firstName} ${person.lastName}` }),
          person.hospital && name(person.hospital),
        ]
          .filter(Boolean)
          .join(', ')}
      </Text>
      <PersonMark mark={person.mark} />
    </View>
  );
}

/** One entry: the article's links, the summary and commentary, the poll, the discussion. */
export function JournalClubEntryScreen({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('journalClub.entry');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const month = useMonth();
  const router = useRouter();
  const { request } = useSession();
  const [item, setItem] = useState<Entry | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    request<Entry>(`/api/v1/journal-club/${encodeURIComponent(id)}`)
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, id]);

  async function vote(answer: Answer) {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      const poll = await request<Poll>(`/api/v1/journal-club/${encodeURIComponent(item.id)}/vote`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ answer }),
      });
      setItem({ ...item, poll });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (isNotVerified(error)) return <NotVerified />;
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
  const totals = item.poll.totals;
  return (
    <Screen>
      <Back />
      <Body muted>{`${month(item.month)} · ${name(item.subspecialty)}`}</Body>
      <Title>{item.articleTitle}</Title>
      {item.articleAuthors !== '' && <Body>{item.articleAuthors}</Body>}
      {where(item) !== '' && <Body muted>{where(item)}</Body>}
      <Card>
        <Heading>{t('article')}</Heading>
        {item.doi && (
          <Button
            label={t('readArticle')}
            variant="link"
            onPress={() => open(`https://doi.org/${item.doi}`)}
          />
        )}
        {item.pmid && (
          <Button
            label={t('onPubmed')}
            variant="link"
            onPress={() => open(`https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`)}
          />
        )}
        <Body muted>{t('notCopied')}</Body>
      </Card>
      <Heading>{t('summary')}</Heading>
      <Author role="summaryBy" person={item.summaryAuthor} />
      <Body>{item.summary}</Body>
      {item.keyPoints.length > 0 && (
        <>
          <Heading>{t('keyPoints')}</Heading>
          {item.keyPoints.map((point) => (
            <Body key={point}>{`• ${point}`}</Body>
          ))}
        </>
      )}
      {item.commentary && (
        <>
          <Heading>{t('commentary')}</Heading>
          <Author role="commentaryBy" person={item.commentaryAuthor} />
          <Body>{item.commentary}</Body>
        </>
      )}
      <Card>
        <Heading>{t('poll')}</Heading>
        <Body muted>{t('pollNote')}</Body>
        {item.poll.open ? (
          ANSWERS.map((answer) => (
            <Button
              key={answer}
              label={t(`answers.${answer}`)}
              variant={item.poll.mine === answer ? 'primary' : 'secondary'}
              disabled={pending}
              hint={
                item.poll.mine === answer
                  ? t('yourAnswer', { answer: t(`answers.${answer}`) })
                  : undefined
              }
              onPress={() => void vote(answer)}
            />
          ))
        ) : (
          <Body>{t('pollClosed')}</Body>
        )}
        {item.poll.mine && (
          <Body>{t('yourAnswer', { answer: t(`answers.${item.poll.mine}`) })}</Body>
        )}
        {totals && (
          <>
            <Body muted>{t('totals', { count: totals.total })}</Body>
            {ANSWERS.map((answer) => (
              <Body key={answer}>
                {t('share', {
                  answer: t(`answers.${answer}`),
                  percent: totals.total ? Math.round((totals[answer] / totals.total) * 100) : 0,
                })}
              </Body>
            ))}
          </>
        )}
      </Card>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Heading>{t('discussion')}</Heading>
      {item.discussion ? (
        <Button
          label={t('openDiscussion')}
          onPress={() =>
            router.push(
              `/communities/${encodeURIComponent(item.discussion!.communitySlug)}/${encodeURIComponent(item.discussion!.postId)}` as Href,
            )
          }
        />
      ) : (
        <Body muted>{t('noDiscussion')}</Body>
      )}
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
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
