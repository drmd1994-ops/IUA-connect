import { ApiError, type components } from '@medconnect/api-client';
import { findPatientDetails } from '@medconnect/shared';
import { semantic } from '@medconnect/ui-tokens';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Choices, Picture } from '@/ui/parts';
import { PatientCheck, refused } from './communities';
import { ScanList } from './imaging';
import { useLocalName, useSubspecialties } from './reference';
import { PersonMark } from './verification';

/**
 * Case discussions (M26), as on the site, for verified people: approved cases with the case of
 * the week, a case with its pictures, poll and discussion, reporting, the reader's own cases, and
 * presenting a case (pictures from the photo library, after the same confirmation). Reviewing
 * stays on the site.
 */

type Schemas = components['schemas'];
type List = Schemas['CaseListDto'];
type Summary = List['items'][number];
type Case = Schemas['CaseDto'];
type Poll = NonNullable<Case['poll']>;
type Input = Schemas['CaseInputDto'];

const AGE_RANGES: Case['ageRange'][] = [
  'UNDER_18',
  'FROM_18_TO_39',
  'FROM_40_TO_64',
  'FROM_65_TO_79',
  'OVER_80',
];
const SEXES: Case['sex'][] = ['FEMALE', 'MALE', 'NOT_STATED'];
const TEXTS = ['history', 'examination', 'labs', 'imaging', 'pathology', 'management'] as const;
type TextKey = (typeof TEXTS)[number];
const json = { 'Content-Type': 'application/json' };

function isNotVerified(error: unknown): boolean {
  return error instanceof ApiError && error.details.some((d) => d.code === 'membersOnly');
}

function NotVerified() {
  const t = useTranslations('cases.list');
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

function usePatientLine() {
  const t = useTranslations('cases');
  return (item: { sex: Case['sex']; ageRange: Case['ageRange'] }) =>
    t('list.patient', { sex: t(`sexes.${item.sex}`), age: t(`ageRanges.${item.ageRange}`) });
}

function AuthorLine({ author }: { author: Case['author'] }) {
  const t = useTranslations('cases.list');
  if (!author) return null;
  return (
    <View style={styles.tags}>
      <Text style={styles.meta}>{t('by', { name: `${author.firstName} ${author.lastName}` })}</Text>
      <PersonMark mark={author.mark} />
    </View>
  );
}

function CaseCard({ item, showStatus = false }: { item: Summary; showStatus?: boolean }) {
  const t = useTranslations('cases');
  const name = useLocalName();
  const patient = usePatientLine();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/cases/${encodeURIComponent(item.id)}` as Href)}
      accessibilityRole="link"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.meta}>
        {showStatus
          ? `${name(item.subspecialty)} · ${t(`statuses.${item.status}`)}`
          : name(item.subspecialty)}
      </Text>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.meta}>{patient(item)}</Text>
      <Text style={styles.text}>{item.question}</Text>
      <AuthorLine author={item.author} />
    </Pressable>
  );
}

/** Approved cases, the case of the week first. */
export function CasesScreen() {
  const all = useTranslations();
  const t = useTranslations('cases.list');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const router = useRouter();
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
    request<List>(`/api/v1/cases?${query.toString()}`)
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
  const others = shown?.items.filter((item) => item.id !== shown.week?.id) ?? [];
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      <Notice>{all('cases.note')}</Notice>
      <Button label={all('cases.tabs.new')} onPress={() => router.push('/cases/new')} />
      <Button
        label={all('cases.tabs.mine')}
        variant="secondary"
        onPress={() => router.push('/cases/mine')}
      />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.week && (
        <>
          <Heading>{t('week')}</Heading>
          <CaseCard item={shown.week} />
        </>
      )}
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
        <CaseCard key={item.id} item={item} />
      ))}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
    </Screen>
  );
}

/** The reader's own cases, in every state. */
export function MyCasesScreen() {
  const all = useTranslations();
  const m = useTranslations('mobile');
  const { request } = useSession();
  const [items, setItems] = useState<Schemas['MyCasesDto']['items'] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<Schemas['MyCasesDto']>('/api/v1/cases/mine')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  if (isNotVerified(error)) return <NotVerified />;
  return (
    <Screen>
      <Back />
      <Title>{all('cases.tabs.mine')}</Title>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!items && error === null && <Body muted>{m('loading')}</Body>}
      {items?.length === 0 && <Body muted>{all('cases.list.empty')}</Body>}
      {items?.map((item) => (
        <CaseCard key={item.id} item={item} showStatus />
      ))}
    </Screen>
  );
}

/** One case: its parts, pictures, poll and discussion; the author's actions; reporting. */
export function CaseScreen({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('cases.case');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const patient = usePatientLine();
  const router = useRouter();
  const { request } = useSession();
  const [item, setItem] = useState<Case | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let active = true;
    request<Case>(`/api/v1/cases/${encodeURIComponent(id)}`)
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, id]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  const path = `/api/v1/cases/${encodeURIComponent(id)}`;

  if (isNotVerified(error)) return <NotVerified />;
  if (reported) {
    return (
      <Screen>
        <Back />
        <Notice tone="success">{t('reported')}</Notice>
      </Screen>
    );
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
  const sections: [TextKey, string | null][] = TEXTS.map((key) => [key, item[key]]);
  return (
    <Screen>
      <Back />
      <Body muted>
        {[
          name(item.subspecialty),
          item.status !== 'PUBLISHED' ? all(`cases.statuses.${item.status}`) : null,
          item.week ? t('weekMark') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Body>
      <Title>{item.title}</Title>
      <AuthorLine author={item.author} />
      <Notice>{all('cases.note')}</Notice>
      {item.status === 'IN_REVIEW' && item.mine && <Notice>{t('waitingNote')}</Notice>}
      {item.reviewNote && item.status === 'RETURNED' && (
        <Notice tone="warning">{t('returnedNote', { note: item.reviewNote })}</Notice>
      )}
      <Body>{`${t('patient')}: ${patient(item)}`}</Body>
      {sections.map(([key, text]) =>
        text ? (
          <View key={key} style={styles.section}>
            <Heading>{t(key)}</Heading>
            <Body>{text}</Body>
          </View>
        ) : null,
      )}
      {item.fileIds.length > 0 && (
        <>
          <Heading>{t('pictures')}</Heading>
          {item.fileIds.map((fileId, index) => (
            <Picture key={fileId} fileId={fileId} label={t('pictureAlt', { number: index + 1 })} />
          ))}
        </>
      )}
      {item.scans.length > 0 && (
        <>
          <Heading>{t('scans')}</Heading>
          <ScanList scans={item.scans} />
        </>
      )}
      <Card>
        <Heading>{t('question')}</Heading>
        <Body>{item.question}</Body>
      </Card>
      {item.poll && (
        <PollCard
          poll={item.poll}
          pending={pending}
          onVote={(optionId) =>
            void run(async () => {
              const poll = await request<Poll>(`${path}/vote`, {
                method: 'PUT',
                headers: json,
                body: JSON.stringify({ optionId }),
              });
              setItem({ ...item, poll });
            })
          }
        />
      )}
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
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {item.mine && item.canEdit && (
        <>
          <Button
            label={t('edit')}
            variant="secondary"
            onPress={() => router.push(`/cases/${encodeURIComponent(item.id)}/edit` as Href)}
          />
          <Button
            label={t('submit')}
            pending={pending}
            onPress={() =>
              void run(async () => {
                setItem(await request<Case>(`${path}/submit`, { method: 'POST' }));
              })
            }
          />
        </>
      )}
      {item.mine && item.status !== 'REMOVED' && !deleting && (
        <Button label={t('delete')} variant="secondary" onPress={() => setDeleting(true)} />
      )}
      {deleting && (
        <Card>
          <Body>{t('deleteConfirm')}</Body>
          <Button
            label={t('delete')}
            variant="danger"
            pending={pending}
            onPress={() =>
              void run(async () => {
                await request(path, { method: 'DELETE' });
                router.replace('/cases/mine');
              })
            }
          />
          <Button label={t('cancel')} variant="secondary" onPress={() => setDeleting(false)} />
        </Card>
      )}
      {!item.mine && item.status === 'PUBLISHED' && !reporting && (
        <Button label={t('report')} variant="secondary" onPress={() => setReporting(true)} />
      )}
      {reporting && (
        <Card>
          <Field
            label={t('reportReason')}
            hint={t('reportHint')}
            value={reason}
            onChangeText={setReason}
            maxLength={1000}
            multiline
          />
          <Button
            label={t('sendReport')}
            pending={pending}
            disabled={!reason.trim()}
            onPress={() =>
              void run(async () => {
                await request(`${path}/report`, {
                  method: 'POST',
                  headers: json,
                  body: JSON.stringify({ reason: reason.trim() }),
                });
                setReported(true);
              })
            }
          />
          <Button label={t('cancel')} variant="secondary" onPress={() => setReporting(false)} />
        </Card>
      )}
    </Screen>
  );
}

function PollCard({
  poll,
  pending,
  onVote,
}: {
  poll: Poll;
  pending: boolean;
  onVote: (optionId: string) => void;
}) {
  const t = useTranslations('cases.case');
  const mine = poll.options.find((o) => o.id === poll.mine);
  return (
    <Card>
      <Heading>{t('poll')}</Heading>
      <Body muted>{t('pollNote')}</Body>
      {poll.open ? (
        poll.options.map((option) => (
          <Button
            key={option.id}
            label={option.text}
            variant={poll.mine === option.id ? 'primary' : 'secondary'}
            disabled={pending}
            onPress={() => onVote(option.id)}
          />
        ))
      ) : (
        <Body>{t('pollClosed')}</Body>
      )}
      {mine && <Body>{t('yourAnswer', { answer: mine.text })}</Body>}
      {poll.totals && (
        <>
          <Body muted>{t('totals', { count: poll.total })}</Body>
          {poll.options.map((option) => (
            <Body key={option.id}>
              {t('share', {
                answer: option.text,
                percent: poll.total
                  ? Math.round(((poll.totals?.[option.id] ?? 0) / poll.total) * 100)
                  : 0,
              })}
            </Body>
          ))}
        </>
      )}
    </Card>
  );
}

interface Form {
  subspecialtyId: string;
  title: string;
  ageRange: Case['ageRange'] | '';
  sex: Case['sex'] | '';
  history: string;
  examination: string;
  labs: string;
  imaging: string;
  pathology: string;
  management: string;
  question: string;
  options: string[];
  fileIds: string[];
  confirmed: boolean;
  /** Scans are added on the site; the app keeps the case's as they are. */
  scanIds: string[];
}

const EMPTY: Form = {
  subspecialtyId: '',
  title: '',
  ageRange: '',
  sex: '',
  history: '',
  examination: '',
  labs: '',
  imaging: '',
  pathology: '',
  management: '',
  question: '',
  options: ['', '', '', ''],
  fileIds: [],
  confirmed: false,
  scanIds: [],
};

/** Presents a new case, or changes the reader's draft or returned one (`id`). */
export function WriteCaseScreen({ id }: { id?: string }) {
  const all = useTranslations();
  const t = useTranslations('cases.form');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const router = useRouter();
  const { request } = useSession();
  const [form, setForm] = useState<Form | null>(id ? null : EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    request<Case>(`/api/v1/cases/${encodeURIComponent(id)}`)
      .then((item) => {
        if (!active) return;
        const options = item.poll?.options.map((o) => o.text) ?? [];
        setForm({
          subspecialtyId: item.subspecialty.id,
          title: item.title,
          ageRange: item.ageRange,
          sex: item.sex,
          history: item.history,
          examination: item.examination ?? '',
          labs: item.labs ?? '',
          imaging: item.imaging ?? '',
          pathology: item.pathology ?? '',
          management: item.management ?? '',
          question: item.question,
          options: [...options, '', '', '', ''].slice(0, 4),
          fileIds: item.fileIds,
          confirmed: item.fileIds.length > 0,
          scanIds: item.scans.map((scan) => scan.id),
        });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, id]);

  if (isNotVerified(error)) return <NotVerified />;
  const set = (patch: Partial<Form>) => setForm((current) => current && { ...current, ...patch });
  const options = form?.options.map((o) => o.trim()).filter(Boolean) ?? [];
  const found = form
    ? [form.title, form.question, ...TEXTS.map((key) => form[key]), ...form.options].flatMap(
        (text) => findPatientDetails(text),
      )
    : [];
  const blocked = found.length ? found : refused(error);

  async function addPicture() {
    if (!form || form.fileIds.length >= 4 || !form.confirmed) return;
    setPending(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const data = new FormData();
      data.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'picture.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      const stored = await request<{ id: string }>('/api/v1/cases/pictures?confirmed=true', {
        method: 'POST',
        body: data,
      });
      set({ fileIds: [...form.fileIds, stored.id] });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!form || !form.ageRange || !form.sex || found.length > 0) return;
    setPending(true);
    setError(null);
    const body: Input = {
      subspecialtyId: form.subspecialtyId,
      title: form.title.trim(),
      ageRange: form.ageRange,
      sex: form.sex,
      history: form.history.trim(),
      examination: form.examination.trim() || null,
      labs: form.labs.trim() || null,
      imaging: form.imaging.trim() || null,
      pathology: form.pathology.trim() || null,
      management: form.management.trim() || null,
      question: form.question.trim(),
      pollOptions: options.length >= 2 ? options : [],
      fileIds: form.fileIds,
      picturesConfirmed: form.confirmed,
      scanIds: form.scanIds,
    };
    try {
      const saved = await request<Case>(
        id ? `/api/v1/cases/${encodeURIComponent(id)}` : '/api/v1/cases',
        { method: id ? 'PUT' : 'POST', headers: json, body: JSON.stringify(body) },
      );
      router.replace(`/cases/${encodeURIComponent(saved.id)}` as Href);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Back />
      <Title>{id ? t('editTitle') : t('newTitle')}</Title>
      <Notice tone="warning">{t('warning')}</Notice>
      {!form && error === null && <Body muted>{m('loading')}</Body>}
      {form && (
        <>
          <Field
            label={t('title')}
            value={form.title}
            onChangeText={(title) => set({ title })}
            maxLength={200}
          />
          {subspecialties.length > 0 && (
            <Choices
              label={t('subspecialty')}
              value={form.subspecialtyId}
              onChange={(subspecialtyId) => set({ subspecialtyId })}
              options={[
                { value: '', label: t('chooseSubspecialty') },
                ...subspecialties.map((s) => ({ value: s.id, label: name(s) })),
              ]}
            />
          )}
          <Choices<Form['ageRange']>
            label={t('ageRange')}
            value={form.ageRange}
            onChange={(ageRange) => set({ ageRange })}
            options={AGE_RANGES.map((value) => ({
              value,
              label: all(`cases.ageRanges.${value}`),
            }))}
          />
          <Choices<Form['sex']>
            label={t('sex')}
            value={form.sex}
            onChange={(sex) => set({ sex })}
            options={SEXES.map((value) => ({ value, label: all(`cases.sexes.${value}`) }))}
          />
          {TEXTS.map((key) => (
            <Field
              key={key}
              label={t(key)}
              value={form[key]}
              onChangeText={(text) => set({ [key]: text })}
              maxLength={key === 'history' ? 5000 : 3000}
              multiline
            />
          ))}
          <Field
            label={t('question')}
            value={form.question}
            onChangeText={(question) => set({ question })}
            maxLength={1000}
            multiline
          />
          <Card>
            <Heading>{t('poll')}</Heading>
            <Body muted>{t('pollHint')}</Body>
            {form.options.map((option, index) => (
              <Field
                key={index}
                label={t('option', { number: index + 1 })}
                value={option}
                maxLength={200}
                onChangeText={(text) =>
                  set({ options: form.options.map((o, i) => (i === index ? text : o)) })
                }
              />
            ))}
          </Card>
          <Card>
            <Heading>{t('pictures')}</Heading>
            <Body muted>{t('picturesHint')}</Body>
            <Toggle
              label={t('confirm')}
              value={form.confirmed}
              onChange={(confirmed) => set({ confirmed })}
            />
            {form.fileIds.map((fileId, index) => (
              <View key={fileId} style={styles.section}>
                <Picture
                  fileId={fileId}
                  label={all('cases.case.pictureAlt', { number: index + 1 })}
                />
                <Button
                  label={t('removePicture', { number: index + 1 })}
                  variant="secondary"
                  onPress={() => set({ fileIds: form.fileIds.filter((f) => f !== fileId) })}
                />
              </View>
            ))}
            {form.fileIds.length < 4 && (
              <Button
                label={t('addPicture')}
                variant="secondary"
                disabled={!form.confirmed || pending}
                onPress={() => void addPicture()}
              />
            )}
          </Card>
          <PatientCheck found={blocked} />
          {error !== null && refused(error).length === 0 && (
            <Notice tone="error">{errorMessage(error, all)}</Notice>
          )}
          <Button
            label={t('save')}
            pending={pending}
            disabled={
              found.length > 0 ||
              !form.subspecialtyId ||
              !form.title.trim() ||
              !form.ageRange ||
              !form.sex ||
              !form.history.trim() ||
              !form.question.trim() ||
              options.length === 1 ||
              (form.fileIds.length > 0 && !form.confirmed)
            }
            onPress={() => void save()}
          />
        </>
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
  section: { gap: 4 },
});
