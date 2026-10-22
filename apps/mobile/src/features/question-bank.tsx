import { type components } from '@medconnect/api-client';
import { colors, semantic } from '@medconnect/ui-tokens';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { clock, dueWarning, optionMarks, percent } from './exam-model';
import { useLocalName, useSubspecialties } from './reference';

type Schemas = components['schemas'];
type Exam = Schemas['MockExamDto'];
type ExamList = Schemas['MockExamListDto'];
type Size = Schemas['MockExamStartDto']['size'];
type Reason = Schemas['ExamReportInputDto']['reason'];
type Reviewer = { nameHe: string | null; nameEn: string | null; at: string } | null;

const SIZES: Size[] = [10, 25, 50];
const REASONS: Reason[] = ['WRONG_ANSWER', 'UNCLEAR', 'OUTDATED', 'TYPO', 'OTHER'];
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);
const json = { 'Content-Type': 'application/json' };

/** The references a right answer rests on, and who reviewed the question (M23). */
export function AnswerSources({
  references,
  reviewer,
}: {
  references: { title: string; url?: string }[];
  reviewer: Reviewer;
}) {
  const e = useTranslations('education.exam');
  const locale = useLocale();
  const format = useFormatter();
  const who = reviewer
    ? locale === 'he'
      ? (reviewer.nameHe ?? reviewer.nameEn)
      : (reviewer.nameEn ?? reviewer.nameHe)
    : null;
  return (
    <>
      {references.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.why}>{e('references')}</Text>
          {references.map((reference, index) =>
            reference.url ? (
              <Button
                key={index}
                label={reference.title}
                variant="link"
                onPress={() => open(reference.url!)}
              />
            ) : (
              <Text key={index} style={styles.body}>
                {reference.title}
              </Text>
            ),
          )}
        </View>
      )}
      {reviewer && (
        <Text style={styles.meta}>
          {who
            ? e('reviewedBy', {
                name: who,
                date: format.dateTime(new Date(reviewer.at), { dateStyle: 'long' }),
              })
            : e('reviewedOn', {
                date: format.dateTime(new Date(reviewer.at), { dateStyle: 'long' }),
              })}
        </Text>
      )}
    </>
  );
}

/** Bookmarks the question, or takes the bookmark away. */
export function BookmarkButton({ questionId, initial }: { questionId: string; initial: boolean }) {
  const e = useTranslations('education.exam');
  const all = useTranslations();
  const { request } = useSession();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => setOn(initial), [initial]);

  async function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    try {
      await request(`/api/v1/me/exam-bookmarks/${encodeURIComponent(questionId)}`, {
        method: next ? 'PUT' : 'DELETE',
      });
    } catch (caught) {
      setOn(!next);
      setError(caught);
    }
  }

  return (
    <>
      <Toggle label={e('bookmark')} value={on} onChange={() => void toggle()} />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
    </>
  );
}

/** "Something wrong with this question?": goes to the reviewers, who answer (M23). */
export function ReportQuestion({ questionId }: { questionId: string }) {
  const r = useTranslations('education.exam.report');
  const all = useTranslations();
  const { request } = useSession();
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState<Reason | ''>('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ready = reason !== '' && (reason !== 'OTHER' || text.trim() !== '');

  async function send() {
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await request(`/api/v1/exam-questions/${encodeURIComponent(questionId)}/reports`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ reason, text: text.trim() }),
      });
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (sent) return <Notice tone="success">{r('sent')}</Notice>;
  if (!opened) return <Button label={r('open')} variant="link" onPress={() => setOpened(true)} />;
  return (
    <View style={styles.section}>
      <Heading>{r('title')}</Heading>
      <Choices<Reason | ''>
        label={r('title')}
        value={reason}
        onChange={setReason}
        options={REASONS.map((value) => ({ value, label: r(`reasons.${value}`) }))}
      />
      <Field
        label={r('text')}
        hint={r('textHint')}
        value={text}
        onChangeText={setText}
        maxLength={1000}
        multiline
      />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Button label={r('send')} pending={pending} disabled={!ready} onPress={() => void send()} />
      <Button label={r('cancel')} variant="secondary" onPress={() => setOpened(false)} />
    </View>
  );
}

/** Choosing a mock exam, and the person's earlier ones (M23). */
export function MockExamStart() {
  const all = useTranslations();
  const t = useTranslations('education.mock');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [size, setSize] = useState<Size>(10);
  const [topics, setTopics] = useState<string[]>([]);
  const [list, setList] = useState<ExamList | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<ExamList>('/api/v1/me/mock-exams')
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const exam = await request<Exam>(`/api/v1/me/mock-exams?locale=${locale}`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ size, subspecialties: topics }),
      });
      router.push(`/mock-exam/${exam.id}`);
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
      <Choices<`${Size}`>
        label={t('size')}
        value={`${size}`}
        onChange={(value) => setSize(Number(value) as Size)}
        options={SIZES.map((value) => ({
          value: `${value}`,
          label: t('sizeOption', { count: value, minutes: (value * 90) / 60 }),
        }))}
      />
      <Heading>{t('topics')}</Heading>
      <Body muted>{t('topicsHint')}</Body>
      {subspecialties.map((s) => (
        <Toggle
          key={s.key}
          label={name(s)}
          value={topics.includes(s.key)}
          onChange={(on) =>
            setTopics((current) =>
              on ? [...current, s.key] : current.filter((key) => key !== s.key),
            )
          }
        />
      ))}
      <Body muted>{t('rules')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Button label={t('start')} pending={pending} onPress={() => void start()} />

      <Heading>{t('earlier')}</Heading>
      {!list && error === null && <Body muted>{m('loading')}</Body>}
      {list?.items.length === 0 && <Body muted>{t('none')}</Body>}
      {list?.items.map((exam) => (
        <Button
          key={exam.id}
          variant="link"
          label={`${format.dateTime(new Date(exam.startedAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })} · ${
            exam.status === 'RUNNING'
              ? t('running')
              : t('scored', {
                  correct: exam.correct ?? 0,
                  total: exam.total,
                  percent: percent(exam.correct ?? 0, exam.total),
                })
          }`}
          onPress={() => router.push(`/mock-exam/${exam.id}`)}
        />
      ))}
    </Screen>
  );
}

/** Sitting a mock exam against the server's clock, and its review once it is over. */
export function MockExamSitting({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('education.mock');
  const e = useTranslations('education.exam');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [exam, setExam] = useState<Exam | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState<unknown>(null);
  const warned = useRef(new Set<number>());

  const load = useCallback(
    (path: string, init?: RequestInit) =>
      request<Exam>(path, init)
        .then((result) => {
          const clientNow = Date.now();
          setExam(result);
          setNow(clientNow);
          setOffset(Date.parse(result.now) - clientNow);
        })
        .catch((caught: unknown) => setError(caught)),
    [request],
  );
  const path = `/api/v1/me/mock-exams/${encodeURIComponent(id)}?locale=${locale}`;

  useEffect(() => {
    void load(path);
  }, [load, path]);

  const running = exam?.status === 'RUNNING';
  const left = exam ? Date.parse(exam.endsAt) - (now + offset) : 0;
  const over = running && left <= 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const due = dueWarning(left, warned.current);
    if (due) {
      warned.current.add(due);
      setWarning(t('minutesLeft', { count: due }));
    }
  }, [running, left, t]);

  useEffect(() => {
    // The server closes it when its time is up; reading it again shows the review.
    if (over) void load(path);
  }, [over, load, path]);

  async function choose(position: number, option: number) {
    if (!exam) return;
    const before = exam;
    setExam({
      ...exam,
      answered: exam.answered + (exam.questions[position - 1]?.chosenPosition === null ? 1 : 0),
      questions: exam.questions.map((q) =>
        q.position === position ? { ...q, chosenPosition: option } : q,
      ),
    });
    setError(null);
    try {
      await request(`/api/v1/me/mock-exams/${encodeURIComponent(id)}/answers/${position}`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ position: option }),
      });
    } catch (caught) {
      setExam(before);
      setError(caught);
    }
  }

  async function finish() {
    setPending(true);
    setConfirming(false);
    await load(`/api/v1/me/mock-exams/${encodeURIComponent(id)}/finish?locale=${locale}`, {
      method: 'POST',
    });
    setPending(false);
  }

  if (!exam) {
    return (
      <Screen>
        <Back />
        {error !== null ? (
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        ) : (
          <Body muted>{m('loading')}</Body>
        )}
      </Screen>
    );
  }

  if (exam.status === 'FINISHED') {
    return (
      <Screen>
        <Back />
        <Title>{t('resultTitle')}</Title>
        <Notice tone="success">
          {t('scored', {
            correct: exam.correct ?? 0,
            total: exam.total,
            percent: percent(exam.correct ?? 0, exam.total),
          })}
        </Notice>
        <Body muted>{t('unanswered', { count: exam.total - exam.answered })}</Body>
        {exam.questions.map((question) => (
          <Card key={question.position}>
            <Heading>
              {`${t('questionOf', { number: question.position, total: exam.total })} · ${
                question.chosenPosition === null
                  ? t('notAnswered')
                  : question.chosenPosition === question.correctPosition
                    ? e('right')
                    : e('wrong')
              }`}
            </Heading>
            <Text style={styles.stem}>{question.stem}</Text>
            {question.options.map((option) => {
              const marks = optionMarks(
                { position: option.position, correct: option.correct === true },
                question.chosenPosition ?? 0,
              );
              return (
                <View
                  key={option.position}
                  style={[styles.explained, marks.right && styles.explainedRight]}
                >
                  <Text style={styles.body}>{option.text}</Text>
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
            {question.summary ? (
              <>
                <Text style={styles.why}>{e('summary')}</Text>
                <Text style={styles.body}>{question.summary}</Text>
              </>
            ) : null}
            <AnswerSources references={question.references} reviewer={question.reviewer} />
          </Card>
        ))}
        <Button label={t('again')} onPress={() => router.replace('/mock-exam')} />
      </Screen>
    );
  }

  const question = exam.questions[current - 1]!;
  const unanswered = exam.total - exam.answered;
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Text
        style={styles.clock}
        accessibilityLabel={`${t('timeLeft')} ${clock(left)}`}
        accessibilityRole="timer"
      >
        {clock(left)}
      </Text>
      {warning ? <Notice tone="warning">{warning}</Notice> : null}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <View style={styles.numbers} accessibilityLabel={t('questions')}>
        {exam.questions.map((q) => (
          <Pressable
            key={q.position}
            onPress={() => setCurrent(q.position)}
            accessibilityRole="button"
            accessibilityLabel={t(q.chosenPosition === null ? 'goTo' : 'goToAnswered', {
              number: q.position,
            })}
            accessibilityState={{ selected: q.position === current }}
            style={[
              styles.number,
              q.chosenPosition !== null && styles.numberAnswered,
              q.position === current && styles.numberCurrent,
            ]}
          >
            <Text style={[styles.numberText, q.position === current && styles.numberTextOn]}>
              {q.position}
            </Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Heading>{t('questionOf', { number: current, total: exam.total })}</Heading>
        <Text style={styles.stem}>{question.stem}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={e('choose')}
          style={styles.options}
        >
          {question.options.map((option) => {
            const selected = question.chosenPosition === option.position;
            return (
              <Pressable
                key={option.position}
                onPress={() => void choose(question.position, option.position)}
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
        {current > 1 && (
          <Button
            label={t('previous')}
            variant="secondary"
            onPress={() => setCurrent(current - 1)}
          />
        )}
        {current < exam.total && (
          <Button label={t('next')} onPress={() => setCurrent(current + 1)} />
        )}
      </Card>
      <Body muted>{t('progress', { answered: exam.answered, total: exam.total })}</Body>
      {confirming ? (
        <>
          <Notice tone="warning">
            {unanswered > 0 ? t('confirmUnanswered', { count: unanswered }) : t('confirm')}
          </Notice>
          <Button label={t('finishNow')} pending={pending} onPress={() => void finish()} />
          <Button label={t('keepGoing')} variant="secondary" onPress={() => setConfirming(false)} />
        </>
      ) : (
        <Button label={t('finish')} variant="secondary" onPress={() => setConfirming(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  why: { fontSize: 14, fontWeight: '700', color: semantic.text },
  body: { fontSize: 16, lineHeight: 24, color: semantic.text },
  stem: { fontSize: 17, lineHeight: 26, fontWeight: '600', color: semantic.text },
  clock: { fontSize: 28, fontWeight: '700', color: semantic.text, fontVariant: ['tabular-nums'] },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  number: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 8,
  },
  numberAnswered: { borderColor: semantic.primary, backgroundColor: colors.brand[50] },
  numberCurrent: { backgroundColor: semantic.primary, borderColor: semantic.primary },
  numberText: { fontSize: 16, fontWeight: '600', color: semantic.text },
  numberTextOn: { color: semantic.onPrimary },
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
});
