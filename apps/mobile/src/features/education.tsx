import { ApiError, type components } from '@medconnect/api-client';
import { colors, semantic } from '@medconnect/ui-tokens';
import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Heading, Notice, Screen, Title } from '@/ui/kit';
import { Markdown } from '@/ui/markdown';
import { Choices, FileLink, Picture, Tag } from '@/ui/parts';
import {
  type ExamState,
  countAnswer,
  hostOf,
  optionMarks,
  savedNote,
  stateAfterNext,
} from './exam-model';
import { useFileUrl } from './files';
import { AnswerSources, BookmarkButton, ReportQuestion } from './question-bank';
import { useLocalName, useSubspecialties } from './reference';
import { useGuest } from './visitor';

type Schemas = components['schemas'];
type List = Schemas['PublicEducationListDto'];
type Item = List['items'][number];
type Detail = Schemas['PublicEducationDto'];
type Question = NonNullable<Schemas['NextQuestionDto']['question']>;
type Result = Schemas['AnswerResultDto'];
type Results = Schemas['ExamResultsDto'];
type Progress = Schemas['ExamProgressDto'];
type Bookmarks = Schemas['ExamBookmarkListDto']['items'];
type Reports = Schemas['MyExamReportListDto']['items'];
type PracticeSet = 'all' | 'bookmarks' | 'wrong';
type Level = NonNullable<Item['level']>;

const PAGE_SIZE = 10;
const TYPES: Item['type'][] = [
  'VIDEO',
  'ARTICLE',
  'PDF',
  'PRESENTATION',
  'PODCAST',
  'WEBINAR',
  'SURGICAL_VIDEO',
  'CASE',
  'COURSE',
];
const LEVELS: Level[] = ['STUDENT', 'RESIDENT', 'FELLOW', 'SPECIALIST', 'EXPERT'];
const SETS: PracticeSet[] = ['all', 'bookmarks', 'wrong'];
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

/** The filters the library and exam practice share: by level and by subspecialty. */
function LevelAndSubspecialty({
  level,
  subspecialty,
  onLevel,
  onSubspecialty,
  labels,
}: {
  level: Level | '';
  subspecialty: string;
  onLevel: (level: Level | '') => void;
  onSubspecialty: (key: string) => void;
  labels: { level: string; allLevels: string; subspecialty: string; allSubspecialties: string };
}) {
  const t = useTranslations('education');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  return (
    <>
      <Choices<Level | ''>
        label={labels.level}
        value={level}
        onChange={onLevel}
        options={[
          { value: '', label: labels.allLevels },
          ...LEVELS.map((value) => ({ value, label: t(`levels.${value}`) })),
        ]}
      />
      {subspecialties.length > 0 && (
        <Choices
          label={labels.subspecialty}
          value={subspecialty}
          onChange={onSubspecialty}
          options={[
            { value: '', label: labels.allSubspecialties },
            ...subspecialties.map((s) => ({ value: s.key, label: name(s) })),
          ]}
        />
      )}
    </>
  );
}

/** The education library. A member also sees what their membership opens; the API decides. */
export function EducationList() {
  const all = useTranslations();
  const t = useTranslations('education');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [type, setType] = useState<Item['type'] | ''>('');
  const [level, setLevel] = useState<Level | ''>('');
  const [subspecialty, setSubspecialty] = useState('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; items: Item[]; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${locale}:${type}:${level}:${subspecialty}`;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      locale,
      page: String(pages),
      pageSize: String(PAGE_SIZE),
      ...(type ? { type } : {}),
      ...(level ? { level } : {}),
      ...(subspecialty ? { subspecialty } : {}),
    });
    request<List>(`/api/v1/education?${query.toString()}`)
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
  }, [request, locale, type, level, subspecialty, pages, key]);

  const shown = list?.key === key ? list : null;
  const change = <T,>(set: (value: T) => void) => {
    return (value: T) => {
      set(value);
      setPages(1);
    };
  };
  return (
    <Screen>
      <Back />
      <Title>{t('list.title')}</Title>
      <Body muted>{t('list.intro')}</Body>
      <Card>
        <Heading>{t('list.examTitle')}</Heading>
        <Body>{t('list.examBody')}</Body>
        <Button label={t('list.examLink')} onPress={() => router.push('/exam')} />
      </Card>
      <Choices<Item['type'] | ''>
        label={t('list.type')}
        value={type}
        onChange={change(setType)}
        options={[
          { value: '', label: t('list.allTypes') },
          ...TYPES.map((value) => ({ value, label: t(`types.${value}`) })),
        ]}
      />
      <LevelAndSubspecialty
        level={level}
        subspecialty={subspecialty}
        onLevel={change(setLevel)}
        onSubspecialty={change(setSubspecialty)}
        labels={{
          level: t('list.level'),
          allLevels: t('list.allLevels'),
          subspecialty: t('list.subspecialty'),
          allSubspecialties: t('list.allSubspecialties'),
        }}
      />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && <Body muted>{t('list.empty')}</Body>}
      {shown?.items.map((item) => (
        <EducationCard key={item.slug} item={item} />
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

function EducationCard({ item }: { item: Item }) {
  const t = useTranslations();
  const router = useRouter();
  const cover = useFileUrl(item.coverFileId, 'thumb');
  return (
    <Pressable
      onPress={() => router.push(`/education/${encodeURIComponent(item.slug)}` as Href)}
      accessibilityRole="link"
      accessibilityLabel={`${t(`education.types.${item.type}`)}: ${item.title}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {item.coverFileId &&
        (cover ? (
          <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={styles.cover} />
        ))}
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.author ? (
          <Text style={styles.meta}>{t('education.item.by', { author: item.author })}</Text>
        ) : null}
        <Facts item={item} />
      </View>
    </Pressable>
  );
}

/** The short facts of an item: its type, level, subspecialty, length, CME points, who it is for. */
function Facts({ item }: { item: Item }) {
  const t = useTranslations();
  const name = useLocalName();
  return (
    <View style={styles.tags}>
      <Tag>{t(`education.types.${item.type}`)}</Tag>
      {item.level && <Tag>{t(`education.levels.${item.level}`)}</Tag>}
      {item.subspecialty && <Tag>{name(item.subspecialty)}</Tag>}
      {item.durationMinutes !== null && (
        <Tag>{t('education.list.minutes', { count: item.durationMinutes })}</Tag>
      )}
      {item.cmePoints !== null && (
        <Tag tone="success">{t('education.list.cme', { points: item.cmePoints })}</Tag>
      )}
      {item.accessTier !== 'PUBLIC' && (
        <Tag>
          {t(`content.common.tiers.${item.accessTier === 'VERIFIED' ? 'VERIFIED' : 'MEMBERS'}`)}
        </Tag>
      )}
    </View>
  );
}

/** One item of the library: its text, where its recording is, its files, and a course's lessons. */
export function EducationItem({ slug }: { slug: string }) {
  const all = useTranslations();
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [found, setFound] = useState<{ key: string; item: Detail } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${slug}:${locale}`;

  useEffect(() => {
    let active = true;
    request<Detail>(`/api/v1/education/${encodeURIComponent(slug)}?locale=${locale}`)
      .then((item) => {
        if (!active) return;
        setError(null);
        setFound({ key, item });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, slug, locale, key]);

  const item = found?.key === key ? found.item : null;
  if (error !== null && !item) {
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
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        )}
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen>
        <Back />
        <Body muted>{t('mobile.loading')}</Body>
      </Screen>
    );
  }
  return (
    <Screen>
      <Back />
      {item.archived && <Notice tone="warning">{t('education.item.archivedNotice')}</Notice>}
      {item.fallback && <Notice>{t('content.common.fallbackNotice')}</Notice>}
      <Title>{item.title}</Title>
      {item.author ? <Body muted>{t('education.item.by', { author: item.author })}</Body> : null}
      <Facts item={item} />
      {item.coverFileId && <Picture fileId={item.coverFileId} label={item.title} />}
      {item.externalUrl && (
        <Button
          label={t('education.item.openAt', { host: hostOf(item.externalUrl) })}
          hint={t('mobile.news.fileHint')}
          onPress={() => open(item.externalUrl ?? '')}
        />
      )}
      {item.videoStatus === 'PENDING_PROVIDER' && <Notice>{t('education.item.pending')}</Notice>}
      <Markdown>{item.description}</Markdown>

      {item.type === 'COURSE' && (
        <View style={styles.section}>
          <Heading>{t('education.item.lessons')}</Heading>
          {item.lessons.length === 0 && <Body muted>{t('education.item.noLessons')}</Body>}
          {item.lessons.map((lesson) => (
            <View key={lesson.position} style={styles.lesson}>
              <Text style={styles.meta}>
                {t('education.item.lessonNumber', { number: lesson.position })}
                {lesson.type ? ` · ${t(`education.types.${lesson.type}`)}` : ''}
                {lesson.durationMinutes !== null
                  ? ` · ${t('education.list.minutes', { count: lesson.durationMinutes })}`
                  : ''}
              </Text>
              {lesson.locked || !lesson.slug ? (
                <Text style={styles.locked}>{t('education.item.locked')}</Text>
              ) : (
                <Button
                  label={lesson.title ?? ''}
                  variant="link"
                  onPress={() =>
                    router.push(`/education/${encodeURIComponent(lesson.slug ?? '')}` as Href)
                  }
                />
              )}
            </View>
          ))}
        </View>
      )}

      {item.files.length > 0 && (
        <View style={styles.section}>
          <Heading>{t('education.item.files')}</Heading>
          {item.files.map((file) => (
            <FileLink key={file.id} file={file} />
          ))}
        </View>
      )}
      {item.references.length > 0 && (
        <View style={styles.section}>
          <Heading>{t('education.item.references')}</Heading>
          {item.references.map((reference, index) => (
            <Button
              key={reference.url}
              label={`${index + 1}. ${reference.title}`}
              variant="link"
              hint={t('mobile.news.fileHint')}
              onPress={() => open(reference.url)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

/**
 * Exam practice: one multiple-choice question; after the reader answers, the right answer, why
 * each option is right or wrong, and a short summary of the topic. A signed-in reader (M23) also
 * practises their bookmarks or the ones they got wrong, bookmarks a question, and reports one;
 * questions they answered right in the last 30 days are left out.
 */
export function ExamPractice() {
  const { guest } = useGuest();
  const all = useTranslations();
  const e = useTranslations('education.exam');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [subspecialty, setSubspecialty] = useState('');
  const [level, setLevel] = useState<Level | ''>('');
  const [practiceSet, setPracticeSet] = useState<PracticeSet>('all');
  const [leftOut, setLeftOut] = useState(0);
  /** Questions already asked in this visit; a change of filters starts again. */
  const [seen, setSeen] = useState<string[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [state, setState] = useState<ExamState>('loading');
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [visit, setVisit] = useState({ answered: 0, correct: 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** What to ask for next: the filters and what was seen, fixed at the moment of asking. */
  const [ask, setAsk] = useState({ turn: 0, exclude: '' });

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      locale,
      ...(subspecialty ? { subspecialty } : {}),
      ...(level ? { level } : {}),
      ...(!guest && practiceSet !== 'all' ? { set: practiceSet } : {}),
      ...(ask.exclude ? { exclude: ask.exclude } : {}),
    });
    request<Schemas['NextQuestionDto']>(`/api/v1/exam-questions/next?${query.toString()}`)
      .then((next) => {
        if (!active) return;
        setQuestion(next.question);
        setLeftOut(next.leftOutRecentlyRight);
        setChosen(null);
        setResult(null);
        setError(null);
        setState(stateAfterNext(next.question !== null, ask.exclude ? 1 : 0));
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, locale, subspecialty, level, practiceSet, guest, ask]);

  function restart(change: () => void) {
    change();
    setSeen([]);
    setState('loading');
    setAsk((current) => ({ turn: current.turn + 1, exclude: '' }));
  }

  async function check() {
    if (!question || chosen === null) return;
    setPending(true);
    setError(null);
    try {
      const answer = await request<Result>(
        `/api/v1/exam-questions/${encodeURIComponent(question.id)}/answer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: chosen, locale }),
        },
      );
      setResult(answer);
      setState('answered');
      setSeen((current) => [...current, question.id]);
      setVisit((current) => countAnswer(current, answer.correct));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const note = result ? savedNote(result) : null;
  return (
    <Screen>
      <Back />
      <Title>{e('title')}</Title>
      <Body muted>{e('intro')}</Body>
      {guest ? (
        <Notice>{e('signInNote')}</Notice>
      ) : (
        <>
          <Button label={e('mockLink')} variant="link" onPress={() => router.push('/mock-exam')} />
          <Button
            label={e('progressLink')}
            variant="link"
            onPress={() => router.push('/exam-results')}
          />
        </>
      )}
      <LevelAndSubspecialty
        level={level}
        subspecialty={subspecialty}
        onLevel={(value) => restart(() => setLevel(value))}
        onSubspecialty={(value) => restart(() => setSubspecialty(value))}
        labels={{
          level: e('level'),
          allLevels: e('allLevels'),
          subspecialty: e('subspecialty'),
          allSubspecialties: e('allSubspecialties'),
        }}
      />
      {!guest && (
        <Choices<PracticeSet>
          label={e('set')}
          value={practiceSet}
          onChange={(value) => restart(() => setPracticeSet(value))}
          options={SETS.map((value) => ({ value, label: e(`sets.${value}`) }))}
        />
      )}
      {!guest && practiceSet === 'all' && leftOut > 0 && (
        <Body muted>{e('leftOut', { count: leftOut })}</Body>
      )}
      {visit.answered > 0 && (
        <Text style={styles.meta} accessibilityLiveRegion="polite">
          {e('score', visit)}
        </Text>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {state === 'loading' && error === null && <Body muted>{m('loading')}</Body>}
      {state === 'none' && (
        <Body muted>{practiceSet === 'all' ? e('none') : e(`noneIn.${practiceSet}`)}</Body>
      )}
      {state === 'done' && (
        <>
          <Notice tone="success">{e('noMore')}</Notice>
          <Button label={e('startOver')} onPress={() => restart(() => undefined)} />
        </>
      )}

      {question && (state === 'asking' || state === 'answered') && (
        <Card>
          <Heading>
            {question.difficulty
              ? `${e('question')} · ${e(`difficulty.${question.difficulty}`)}`
              : e('question')}
          </Heading>
          <Text style={styles.stem}>{question.stem}</Text>
          {!guest && (
            <BookmarkButton
              questionId={question.id}
              initial={result?.bookmarked ?? question.bookmarked}
            />
          )}
          {state === 'asking' && (
            <>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={e('choose')}
                style={styles.options}
              >
                {question.options.map((option) => {
                  const selected = chosen === option.position;
                  return (
                    <Pressable
                      key={option.position}
                      onPress={() => setChosen(option.position)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={option.text}
                      style={[styles.option, selected && styles.optionOn]}
                    >
                      <View style={[styles.dot, selected && styles.dotOn]} />
                      <Text style={styles.optionText}>{option.text}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button
                label={e('check')}
                pending={pending}
                disabled={chosen === null}
                onPress={() => void check()}
              />
            </>
          )}
          {state === 'answered' && result && (
            <>
              <Notice tone={result.correct ? 'success' : 'warning'}>
                {result.correct ? e('right') : e('wrong')}
              </Notice>
              {result.options.map((option) => {
                const marks = optionMarks(option, result.chosenPosition);
                return (
                  <View
                    key={option.position}
                    style={[styles.explained, marks.right && styles.explainedRight]}
                  >
                    <Text style={styles.optionText}>{option.text}</Text>
                    <View style={styles.tags}>
                      {marks.right && <Tag tone="success">{e('rightAnswer')}</Tag>}
                      {marks.yours && (
                        <Tag tone={marks.right ? 'success' : 'warning'}>{e('yourAnswer')}</Tag>
                      )}
                    </View>
                    {option.explanation ? (
                      <>
                        <Text style={styles.why}>{e(marks.why)}</Text>
                        <Text style={styles.body}>{option.explanation}</Text>
                      </>
                    ) : null}
                  </View>
                );
              })}
              {result.summary ? (
                <>
                  <Text style={styles.why}>{e('summary')}</Text>
                  <Text style={styles.body}>{result.summary}</Text>
                </>
              ) : null}
              <AnswerSources references={result.references} reviewer={result.reviewer} />
              {note && <Body muted>{e(note)}</Body>}
              <Button
                label={e('next')}
                onPress={() => {
                  setState('loading');
                  setAsk((current) => ({ turn: current.turn + 1, exclude: seen.join(',') }));
                }}
              />
              {!guest && <ReportQuestion key={question.id} questionId={question.id} />}
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

/**
 * The reader's own results and progress (M6, M23): by topic and by week from first answers, the
 * weak topics, bookmarks and reports. Only they see them; the first answer to each question counts.
 */
export function ExamResults() {
  const all = useTranslations();
  const t = useTranslations('education.results');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [results, setResults] = useState<Results | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmarks>([]);
  const [reports, setReports] = useState<Reports>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<Progress>('/api/v1/me/exam-progress'),
      request<Results>(`/api/v1/me/exam-results?locale=${locale}`),
      request<{ items: Bookmarks }>(`/api/v1/me/exam-bookmarks?locale=${locale}`),
      request<{ items: Reports }>(`/api/v1/me/exam-reports?locale=${locale}`),
    ])
      .then(([progressResult, resultsResult, bookmarksResult, reportsResult]) => {
        if (!active) return;
        setProgress(progressResult);
        setResults(resultsResult);
        setBookmarks(bookmarksResult.items);
        setReports(reportsResult.items);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, locale]);

  async function unbookmark(questionId: string) {
    try {
      await request(`/api/v1/me/exam-bookmarks/${encodeURIComponent(questionId)}`, {
        method: 'DELETE',
      });
      setBookmarks((current) => current.filter((item) => item.questionId !== questionId));
    } catch (caught) {
      setError(caught);
    }
  }

  const topicName = (topic: Progress['topics'][number]) =>
    (locale === 'he' ? topic.nameHe : topic.nameEn) ?? t('noTopic');
  const weak = progress?.topics.filter((topic) => topic.weak) ?? [];
  const answeredTopics = progress?.topics.filter((topic) => topic.answered > 0) ?? [];

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!results && error === null && <Body muted>{m('loading')}</Body>}
      {results?.answered === 0 && (
        <>
          <Body muted>{t('empty')}</Body>
          <Button label={t('practise')} onPress={() => router.replace('/exam')} />
        </>
      )}
      <Button label={t('mock')} variant="link" onPress={() => router.push('/mock-exam')} />
      {results && results.answered > 0 && (
        <Notice tone="success">
          {t('summary', {
            correct: results.correct,
            answered: results.answered,
            percent: results.percent ?? 0,
          })}
        </Notice>
      )}
      {progress && progress.answered > 0 && (
        <>
          <Heading>{t('weakTitle')}</Heading>
          <Body muted>{t('weakRule')}</Body>
          {weak.length === 0 ? (
            <Body>{t('noWeak')}</Body>
          ) : (
            weak.map((topic) => (
              <Notice key={topic.key ?? 'none'} tone="warning">
                {t('weakLine', {
                  topic: topicName(topic),
                  correct: topic.correct,
                  answered: topic.answered,
                  percent: topic.percent ?? 0,
                })}
              </Notice>
            ))
          )}
          <Heading>{t('byTopic')}</Heading>
          {answeredTopics.map((topic) => (
            <Text key={topic.key ?? 'none'} style={styles.body}>
              {t('weakLine', {
                topic: topicName(topic),
                correct: topic.correct,
                answered: topic.answered,
                percent: topic.percent ?? 0,
              })}
            </Text>
          ))}
          <Heading>{t('byWeek')}</Heading>
          {progress.weeks
            .filter((week) => week.answered > 0)
            .map((week) => (
              <Text key={week.start} style={styles.body}>
                {t('weekLine', {
                  week: format.dateTime(new Date(`${week.start}T12:00:00Z`), {
                    dateStyle: 'medium',
                  }),
                  correct: week.correct,
                  answered: week.answered,
                })}
              </Text>
            ))}
        </>
      )}
      {results && (
        <>
          <Heading>{t('bookmarks')}</Heading>
          {bookmarks.length === 0 && <Body muted>{t('noBookmarks')}</Body>}
          {bookmarks.map((item) => (
            <Card key={item.questionId}>
              <Text style={styles.body}>{item.stem}</Text>
              <Button
                label={t('removeBookmark')}
                variant="link"
                onPress={() => void unbookmark(item.questionId)}
              />
            </Card>
          ))}
        </>
      )}
      {reports.length > 0 && (
        <>
          <Heading>{t('reports')}</Heading>
          {reports.map((report) => (
            <Card key={report.id}>
              <Text style={styles.body}>{report.stem}</Text>
              <Text style={styles.meta}>
                {`${all(`education.exam.report.reasons.${report.reason}`)} · ${t(
                  `reportStatus.${report.status}`,
                )}`}
              </Text>
              {report.response ? (
                <Text style={styles.body}>{t('reportAnswer', { answer: report.response })}</Text>
              ) : null}
            </Card>
          ))}
        </>
      )}
      {results && results.items.length > 0 && <Heading>{t('answeredTitle')}</Heading>}
      {results?.items.map((item) => (
        <Card key={item.questionId}>
          <Text style={styles.body}>{item.stem}</Text>
          <View style={styles.tags}>
            <Tag tone={item.firstCorrect ? 'success' : 'warning'}>
              {item.firstCorrect ? t('firstRight') : t('firstWrong')}
            </Tag>
            <Tag>{t('attempts', { count: item.attempts })}</Tag>
          </View>
          <Text style={styles.meta}>
            {t('last', {
              when: format.dateTime(new Date(item.lastAnsweredAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </Text>
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
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.neutral[100] },
  cardText: { padding: 16, gap: 6 },
  cardTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    color: semantic.primary,
    textDecorationLine: 'underline',
  },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  section: { gap: 6 },
  lesson: { borderWidth: 1, borderColor: semantic.border, borderRadius: 10, padding: 12, gap: 2 },
  locked: { fontSize: 16, fontWeight: '600', color: semantic.textMuted },
  stem: { fontSize: 17, lineHeight: 26, fontWeight: '600', color: semantic.text },
  options: { gap: 8 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.neutral[400],
    borderRadius: 10,
    backgroundColor: semantic.surface,
  },
  optionOn: { borderColor: semantic.primary, backgroundColor: colors.brand[50] },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.neutral[500],
  },
  dotOn: { borderColor: semantic.primary, backgroundColor: semantic.primary },
  optionText: { flex: 1, fontSize: 16, lineHeight: 24, color: semantic.text },
  explained: {
    gap: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 10,
  },
  explainedRight: { borderColor: colors.success[700], backgroundColor: colors.success[100] },
  why: { fontSize: 14, fontWeight: '700', color: semantic.text },
  body: { fontSize: 16, lineHeight: 24, color: semantic.text },
});
