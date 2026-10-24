import { ApiError, type components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { useLocalName, useSubspecialties } from './reference';
import { PersonMark } from './verification';

/**
 * Research projects and publications (M27), as on the site, for verified people (owner answer
 * §10.2): projects with search, a project with asking to join, a lead's own projects and the
 * requests, listing or editing a project (physicians only, §10.1), and the reader's own
 * publications, typed in or filled from PubMed or ORCID.
 */

type Schemas = components['schemas'];
type ProjectList = Schemas['ProjectListDto'];
type Summary = ProjectList['items'][number];
type Project = Schemas['ProjectDto'];
type Person = Project['lead'];
type ProjectInput = Schemas['ProjectInputDto'];
type ResearchRequest = Schemas['ResearchRequestDto'];
type Publication = Schemas['PublicationDto'];
type Draft = Schemas['PublicationDraftListDto']['items'][number];
type PublicationInput = Schemas['PublicationInputDto'];
type Me = Schemas['MeDto'];
type Step = 'accept' | 'decline' | 'withdraw';

const STUDY_TYPES: Project['studyType'][] = [
  'PROSPECTIVE',
  'RETROSPECTIVE',
  'TRIAL',
  'REGISTRY',
  'SURVEY',
  'OTHER',
];
const STATUSES: Project['status'][] = ['PLANNING', 'RECRUITING', 'ONGOING', 'COMPLETED'];
const ETHICS: Project['ethics'][] = ['APPROVED', 'SUBMITTED', 'NOT_YET', 'NOT_NEEDED'];
const NEEDS: Project['needs'][number][] = [
  'CENTRES',
  'CO_INVESTIGATORS',
  'STATISTICIAN',
  'RESIDENTS',
  'STUDENTS',
];
const json = { 'Content-Type': 'application/json' };
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);
const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

function isNotVerified(error: unknown): boolean {
  return error instanceof ApiError && error.details.some((d) => d.code === 'membersOnly');
}

function NotVerified() {
  const t = useTranslations('research.list');
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

/** Whether the reader may list projects: a verified physician, not a medical student. */
function useCanList(): boolean {
  const { request } = useSession();
  const [canList, setCanList] = useState(false);
  useEffect(() => {
    let active = true;
    request<Me>('/api/v1/me')
      .then((me) => active && setCanList(me.verified && me.verifiedAs !== 'STUDENT'))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);
  return canList;
}

/** The ways on from the projects. */
function ResearchLinks() {
  const t = useTranslations('research.tabs');
  const m = useTranslations('mobile.research');
  const router = useRouter();
  const canList = useCanList();
  return (
    <Card>
      <Heading>{m('links')}</Heading>
      {canList && (
        <Button
          label={t('mine')}
          variant="secondary"
          onPress={() => router.push('/research/mine')}
        />
      )}
      <Button
        label={t('requests')}
        variant="secondary"
        onPress={() => router.push('/research/requests')}
      />
      {canList && (
        <Button label={t('new')} variant="secondary" onPress={() => router.push('/research/new')} />
      )}
      <Button
        label={m('publications')}
        variant="secondary"
        onPress={() => router.push('/publications')}
      />
    </Card>
  );
}

function PersonLine({ person }: { person: Person }) {
  const name = useLocalName();
  return (
    <View style={styles.tags}>
      <Text style={styles.strong}>
        {[`${person.firstName} ${person.lastName}`, person.hospital && name(person.hospital)]
          .filter(Boolean)
          .join(', ')}
      </Text>
      <PersonMark mark={person.mark} />
    </View>
  );
}

function Flags({ item }: { item: Summary | Project }) {
  const t = useTranslations('research.list');
  return (
    <View style={styles.tags}>
      {item.ended ? (
        <Tag>{t('ended')}</Tag>
      ) : (
        <>
          {!item.open && <Tag>{t('closed')}</Tag>}
          {item.stale && <Tag tone="warning">{t('stale')}</Tag>}
        </>
      )}
    </View>
  );
}

function ProjectCard({ item }: { item: Summary }) {
  const t = useTranslations('research');
  const name = useLocalName();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/research/${encodeURIComponent(item.id)}` as Href)}
      accessibilityRole="link"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.meta}>
        {t(`studyTypes.${item.studyType}`)} · {t(`statuses.${item.status}`)}
      </Text>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.text}>{item.excerpt}</Text>
      {item.needs.length > 0 && (
        <Text style={styles.meta}>
          {t('list.lookingFor', { needs: item.needs.map((n) => t(`needs.${n}`)).join(', ') })}
        </Text>
      )}
      <Text style={styles.meta}>
        {t('list.by', { name: `${item.lead.firstName} ${item.lead.lastName}` })}
      </Text>
      <View style={styles.tags}>
        {item.subspecialties.map((s) => (
          <Tag key={s.id}>{name(s)}</Tag>
        ))}
      </View>
      <Flags item={item} />
    </Pressable>
  );
}

/** The projects, with search; or, with `mine`, the reader's own. */
export function ProjectsScreen({ mine = false }: { mine?: boolean }) {
  const all = useTranslations();
  const t = useTranslations('research.list');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  const [studyType, setStudyType] = useState<Project['studyType'] | ''>('');
  const [need, setNeed] = useState<Project['needs'][number] | ''>('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; data: ProjectList } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${q}:${subspecialty}:${studyType}:${need}`;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      page: String(pages),
      ...(mine ? { mine: 'true' } : {}),
      ...(q ? { q } : {}),
      ...(subspecialty ? { subspecialty } : {}),
      ...(studyType ? { studyType } : {}),
      ...(need ? { need } : {}),
    });
    request<ProjectList>(`/api/v1/research/projects?${query.toString()}`)
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
  }, [request, q, subspecialty, studyType, need, pages, key, mine]);

  if (isNotVerified(error)) return <NotVerified />;
  const shown = list?.key === key ? list.data : null;
  const reset = () => setPages(1);
  return (
    <Screen>
      <Back />
      <Title>{mine ? all('research.tabs.mine') : t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {!mine && (
        <>
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
          <Choices<Project['studyType'] | ''>
            label={t('studyType')}
            value={studyType}
            onChange={(next) => {
              setStudyType(next);
              reset();
            }}
            options={[
              { value: '', label: t('allStudyTypes') },
              ...STUDY_TYPES.map((value) => ({
                value,
                label: all(`research.studyTypes.${value}`),
              })),
            ]}
          />
          <Choices<Project['needs'][number] | ''>
            label={t('need')}
            value={need}
            onChange={(next) => {
              setNeed(next);
              reset();
            }}
            options={[
              { value: '', label: t('allNeeds') },
              ...NEEDS.map((value) => ({ value, label: all(`research.needs.${value}`) })),
            ]}
          />
        </>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && <Body muted>{mine ? t('mineEmpty') : t('empty')}</Body>}
      {shown?.items.map((item) => (
        <ProjectCard key={item.id} item={item} />
      ))}
      {shown && shown.items.length > 0 && (
        <Body muted>{m('news.shown', { shown: shown.items.length, total: shown.total })}</Body>
      )}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
      <ResearchLinks />
    </Screen>
  );
}

/** One project: what it is and looks for, asking to join; its lead edits or ends it. */
export function ProjectScreen({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('research.project');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const router = useRouter();
  const { request } = useSession();
  const [item, setItem] = useState<Project | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [ending, setEnding] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    request<Project>(`/api/v1/research/projects/${encodeURIComponent(id)}`)
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

  const ask = () =>
    run(async () => {
      if (!item) return;
      const made = await request<ResearchRequest>(
        `/api/v1/research/projects/${encodeURIComponent(item.id)}/requests`,
        { method: 'POST', headers: json, body: JSON.stringify({ message: message.trim() }) },
      );
      setItem({ ...item, myRequest: { id: made.id, state: made.state } });
      setAsking(false);
      setSent(true);
    });

  const end = () =>
    run(async () => {
      if (!item) return;
      setItem(
        await request<Project>(`/api/v1/research/projects/${encodeURIComponent(item.id)}/end`, {
          method: 'POST',
        }),
      );
      setEnding(false);
    });

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
  const member = item.myRequest?.state === 'ACCEPTED';
  const waiting = item.myRequest?.state === 'PENDING';
  const canAsk = !item.mine && !member && !waiting && item.open && !item.ended;
  return (
    <Screen>
      <Back />
      <Body muted>
        {all(`research.studyTypes.${item.studyType}`)} · {all(`research.statuses.${item.status}`)}
      </Body>
      <Title>{item.title}</Title>
      <Flags item={item} />
      <Text style={styles.meta}>{t('lead')}</Text>
      <PersonLine person={item.lead} />
      <Body muted>{all(`research.ethics.${item.ethics}`)}</Body>
      {item.needs.length > 0 && (
        <Body muted>
          {all('research.list.lookingFor', {
            needs: item.needs.map((n) => all(`research.needs.${n}`)).join(', '),
          })}
        </Body>
      )}
      {item.subspecialties.length > 0 && (
        <Body muted>{item.subspecialties.map((s) => name(s)).join(', ')}</Body>
      )}
      <Body muted>{t('members', { count: item.members })}</Body>
      <Card>
        <Body>{item.description}</Body>
      </Card>
      {item.funding && <Body>{`${t('funding')}: ${item.funding}`}</Body>}
      {item.contact && <Body>{`${t('contact')}: ${item.contact}`}</Body>}
      <Body muted>{t('noPatientData')}</Body>
      {item.mine && item.stale && !item.ended && <Notice tone="warning">{t('staleNote')}</Notice>}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {sent && <Notice tone="success">{t('sent')}</Notice>}
      {waiting && !sent && <Body muted>{t('waiting')}</Body>}
      {member && !item.mine && <Body>{t('member')}</Body>}
      {item.groupId && (
        <Button
          label={t('openGroup')}
          onPress={() => router.push(`/thread/group/${encodeURIComponent(item.groupId!)}` as Href)}
        />
      )}
      {canAsk && !asking && <Button label={t('ask')} onPress={() => setAsking(true)} />}
      {canAsk && asking && (
        <Card>
          <Field
            label={t('message')}
            hint={t('messageHint')}
            value={message}
            onChangeText={setMessage}
            maxLength={1000}
            multiline
          />
          <Body muted>{t('rules')}</Body>
          <Button
            label={t('send')}
            pending={pending}
            disabled={!message.trim()}
            onPress={() => void ask()}
          />
          <Button label={t('cancel')} variant="secondary" onPress={() => setAsking(false)} />
        </Card>
      )}
      {item.mine && !item.ended && (
        <>
          <Button
            label={t('edit')}
            variant="secondary"
            onPress={() => router.push(`/research/${encodeURIComponent(item.id)}/edit` as Href)}
          />
          {!ending ? (
            <Button label={t('end')} variant="secondary" onPress={() => setEnding(true)} />
          ) : (
            <Card>
              <Body>{t('endConfirm')}</Body>
              <Button
                label={t('end')}
                variant="danger"
                pending={pending}
                onPress={() => void end()}
              />
              <Button label={t('cancel')} variant="secondary" onPress={() => setEnding(false)} />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const EMPTY_PROJECT: ProjectInput = {
  title: '',
  description: '',
  studyType: 'PROSPECTIVE',
  status: 'PLANNING',
  ethics: 'NOT_YET',
  funding: null,
  contact: null,
  needs: [],
  subspecialtyIds: [],
  open: true,
};

/** Lists a new project, or edits one the reader leads (`id`). */
export function ProjectFormScreen({ id }: { id?: string }) {
  const all = useTranslations();
  const t = useTranslations('research.form');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const subspecialties = useSubspecialties();
  const router = useRouter();
  const { request } = useSession();
  const [form, setForm] = useState<ProjectInput | null>(id ? null : EMPTY_PROJECT);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    request<Project>(`/api/v1/research/projects/${encodeURIComponent(id)}`)
      .then((project) => {
        if (!active) return;
        setForm({
          title: project.title,
          description: project.description,
          studyType: project.studyType,
          status: project.status,
          ethics: project.ethics,
          funding: project.funding,
          contact: project.contact,
          needs: project.needs,
          subspecialtyIds: project.subspecialties.map((s) => s.id),
          open: project.open,
        });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, id]);

  const set = (patch: Partial<ProjectInput>) => {
    setSaved(false);
    setForm((current) => current && { ...current, ...patch });
  };

  async function save() {
    if (!form) return;
    setPending(true);
    setError(null);
    const body = JSON.stringify({
      ...form,
      funding: form.funding?.trim() || null,
      contact: form.contact?.trim() || null,
    });
    try {
      if (id) {
        await request<Project>(`/api/v1/research/projects/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: json,
          body,
        });
        setSaved(true);
      } else {
        const created = await request<Project>('/api/v1/research/projects', {
          method: 'POST',
          headers: json,
          body,
        });
        router.replace(`/research/${encodeURIComponent(created.id)}` as Href);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (isNotVerified(error)) return <NotVerified />;
  return (
    <Screen>
      <Back />
      <Title>{id ? t('editTitle') : t('newTitle')}</Title>
      {!form && error === null && <Body muted>{m('loading')}</Body>}
      {form && (
        <>
          <Field
            label={t('title')}
            value={form.title}
            onChangeText={(title) => set({ title })}
            maxLength={200}
          />
          <Field
            label={t('description')}
            hint={t('descriptionHint')}
            value={form.description}
            onChangeText={(description) => set({ description })}
            maxLength={5000}
            multiline
          />
          <Choices<Project['studyType']>
            label={t('studyType')}
            value={form.studyType}
            onChange={(studyType) => set({ studyType })}
            options={STUDY_TYPES.map((value) => ({
              value,
              label: all(`research.studyTypes.${value}`),
            }))}
          />
          <Choices<Project['status']>
            label={t('status')}
            value={form.status}
            onChange={(status) => set({ status })}
            options={STATUSES.map((value) => ({ value, label: all(`research.statuses.${value}`) }))}
          />
          <Choices<Project['ethics']>
            label={t('ethics')}
            value={form.ethics}
            onChange={(ethics) => set({ ethics })}
            options={ETHICS.map((value) => ({
              value,
              label: all(`research.ethicsShort.${value}`),
            }))}
          />
          <Body muted>{t('ethicsHint')}</Body>
          <Card>
            <Heading>{t('needs')}</Heading>
            {NEEDS.map((need) => (
              <Toggle
                key={need}
                label={all(`research.needs.${need}`)}
                value={form.needs.includes(need)}
                onChange={() => set({ needs: toggle(form.needs, need) })}
              />
            ))}
          </Card>
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
            label={t('funding')}
            value={form.funding ?? ''}
            onChangeText={(funding) => set({ funding })}
            maxLength={300}
          />
          <Field
            label={t('contact')}
            value={form.contact ?? ''}
            onChangeText={(contact) => set({ contact })}
            maxLength={300}
          />
          <Toggle label={t('open')} value={form.open} onChange={(value) => set({ open: value })} />
          {saved && <Notice tone="success">{t('saved')}</Notice>}
          <Button
            label={t('save')}
            pending={pending}
            disabled={!form.title.trim() || !form.description.trim()}
            onPress={() => void save()}
          />
        </>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
    </Screen>
  );
}

/** Requests to join the reader's projects, and the reader's own requests. */
export function ResearchRequestsScreen() {
  const all = useTranslations();
  const t = useTranslations('research.requests');
  const m = useTranslations('mobile');
  const { request } = useSession();
  const canList = useCanList();
  const [items, setItems] = useState<ResearchRequest[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    request<{ items: ResearchRequest[] }>('/api/v1/research/requests')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  async function act(item: ResearchRequest, step: Step) {
    setPending(item.id);
    setError(null);
    try {
      const next = await request<ResearchRequest>(
        `/api/v1/research/requests/${encodeURIComponent(item.id)}/${step}`,
        { method: 'POST' },
      );
      setItems((current) => current && current.map((x) => (x.id === next.id ? next : x)));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  if (isNotVerified(error)) return <NotVerified />;
  const section = (role: 'lead' | 'asker') => {
    const mine = items?.filter((item) => item.role === role) ?? [];
    return (
      <Card>
        <Heading>{t(role === 'lead' ? 'toYou' : 'yours')}</Heading>
        {mine.length === 0 && <Body muted>{t(role === 'lead' ? 'emptyToYou' : 'emptyYours')}</Body>}
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
      {items && canList && section('lead')}
      {items && section('asker')}
    </Screen>
  );
}

function RequestItem({
  item,
  pending,
  onStep,
}: {
  item: ResearchRequest;
  pending: boolean;
  onStep: (step: Step) => void;
}) {
  const t = useTranslations('research.requests');
  const format = useFormatter();
  const router = useRouter();
  return (
    <View style={styles.request}>
      <PersonLine person={item.other} />
      <Button
        label={t('project', { title: item.project.title })}
        variant="link"
        onPress={() => router.push(`/research/${encodeURIComponent(item.project.id)}` as Href)}
      />
      <Text style={styles.meta}>
        {t(`states.${item.state}`)} ·{' '}
        {t('sentOn', { date: format.dateTime(new Date(item.createdAt), { dateStyle: 'long' }) })}
      </Text>
      <Text style={styles.text}>{item.message}</Text>
      {item.role === 'lead' && item.state === 'PENDING' && (
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
      {item.role === 'asker' && item.state === 'PENDING' && (
        <Button
          label={t('withdraw')}
          variant="secondary"
          pending={pending}
          onPress={() => onStep('withdraw')}
        />
      )}
    </View>
  );
}

/** The editing form's fields, as typed. */
interface PublicationForm {
  id: string | null;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi: string;
  pmid: string;
  url: string;
  topics: string;
  hidden: boolean;
  source: PublicationInput['source'];
}

const EMPTY_PUBLICATION: PublicationForm = {
  id: null,
  title: '',
  authors: '',
  journal: '',
  year: '',
  doi: '',
  pmid: '',
  url: '',
  topics: '',
  hidden: false,
  source: 'MANUAL',
};

function fromDraft(
  draft: Omit<Draft, 'saved'>,
  source: PublicationInput['source'],
): PublicationForm {
  return {
    ...EMPTY_PUBLICATION,
    title: draft.title,
    authors: draft.authors,
    journal: draft.journal ?? '',
    year: draft.year ? String(draft.year) : '',
    doi: draft.doi ?? '',
    pmid: draft.pmid ?? '',
    url: draft.url ?? '',
    source,
  };
}

function toInput(form: PublicationForm): PublicationInput {
  const year = Number.parseInt(form.year, 10);
  return {
    title: form.title.trim(),
    authors: form.authors.trim(),
    journal: form.journal.trim() || null,
    year: Number.isFinite(year) ? year : null,
    doi: form.doi.trim() || null,
    pmid: form.pmid.trim() || null,
    url: form.url.trim() || null,
    topics: form.topics
      .split(',')
      .map((topic) => topic.trim())
      .filter(Boolean),
    source: form.source,
    hidden: form.hidden,
  };
}

function PublicationLines({ item }: { item: Publication | Draft }) {
  const t = useTranslations('research.publications');
  const where = [item.journal, item.year].filter(Boolean).join(', ');
  return (
    <>
      {item.authors !== '' && <Text style={styles.text}>{item.authors}</Text>}
      {where !== '' && <Text style={styles.meta}>{where}</Text>}
      {item.doi && (
        <Button
          label={`${t('doi')} ${item.doi}`}
          variant="link"
          onPress={() => open(`https://doi.org/${item.doi}`)}
        />
      )}
      {item.pmid && (
        <Button
          label={`PMID ${item.pmid}`}
          variant="link"
          onPress={() => open(`https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`)}
        />
      )}
      {item.url && !item.doi && !item.pmid && (
        <Button label={t('url')} variant="link" onPress={() => open(item.url!)} />
      )}
    </>
  );
}

/** The reader's own publications: typed in, from PubMed or from ORCID; ordered, some hidden. */
export function PublicationsScreen() {
  const all = useTranslations();
  const t = useTranslations('research.publications');
  const m = useTranslations('mobile');
  const { request } = useSession();
  const [items, setItems] = useState<Publication[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [mode, setMode] = useState<'none' | 'pubmed' | 'orcid'>('none');
  const [form, setForm] = useState<PublicationForm | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    request<{ items: Publication[] }>('/api/v1/me/publications')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

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

  const close = () => {
    setMode('none');
    setForm(null);
    setDrafts(null);
    setLookupId('');
  };

  const lookup = () =>
    run(async () => {
      const value = lookupId.trim();
      const body = /^\d+$/.test(value) ? { pmid: value } : { doi: value };
      const result = await request<{ items: Draft[] }>('/api/v1/me/publications/lookup', {
        method: 'POST',
        headers: json,
        body: JSON.stringify(body),
      });
      const first = result.items[0];
      if (first) setForm(fromDraft(first, 'PUBMED'));
    });

  const openOrcid = () => {
    setForm(null);
    setMode('orcid');
    void run(async () => {
      const result = await request<{ items: Draft[] }>('/api/v1/me/publications/orcid');
      setDrafts(result.items);
    });
  };

  const save = () =>
    run(async () => {
      if (!form) return;
      const body = JSON.stringify(toInput(form));
      if (form.id) {
        const saved = await request<Publication>(
          `/api/v1/me/publications/${encodeURIComponent(form.id)}`,
          { method: 'PUT', headers: json, body },
        );
        setItems((current) => current && current.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        const saved = await request<Publication>('/api/v1/me/publications', {
          method: 'POST',
          headers: json,
          body,
        });
        setItems((current) => [...(current ?? []), saved]);
      }
      close();
    });

  const remove = (item: Publication) =>
    run(async () => {
      await request(`/api/v1/me/publications/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      setItems((current) => current && current.filter((p) => p.id !== item.id));
    });

  const move = (index: number, by: -1 | 1) =>
    run(async () => {
      if (!items) return;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(index + by, 0, moved!);
      const result = await request<{ items: Publication[] }>('/api/v1/me/publications/order', {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
      setItems(result.items);
    });

  const field = (key: Exclude<keyof PublicationForm, 'id' | 'hidden' | 'source'>) => ({
    value: form?.[key] ?? '',
    onChangeText: (value: string) => setForm((current) => current && { ...current, [key]: value }),
  });

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!items && error === null && <Body muted>{m('loading')}</Body>}
      {items?.length === 0 && <Body muted>{t('empty')}</Body>}
      {items?.map((item, index) => (
        <Card key={item.id}>
          <Text style={styles.strong}>{item.title}</Text>
          <PublicationLines item={item} />
          <View style={styles.tags}>
            <Tag>{t(`sources.${item.source}`)}</Tag>
            {item.hidden && <Tag tone="warning">{t('hiddenMark')}</Tag>}
          </View>
          <Button
            label={t('up', { title: item.title })}
            variant="secondary"
            disabled={pending || index === 0}
            onPress={() => void move(index, -1)}
          />
          <Button
            label={t('down', { title: item.title })}
            variant="secondary"
            disabled={pending || index === items.length - 1}
            onPress={() => void move(index, 1)}
          />
          <Button
            label={t('edit')}
            variant="secondary"
            disabled={pending}
            onPress={() => {
              setMode('none');
              setDrafts(null);
              setForm({
                ...fromDraft(item, item.source),
                id: item.id,
                topics: item.topics.join(', '),
                hidden: item.hidden,
              });
            }}
          />
          <Button
            label={t('remove')}
            variant="secondary"
            disabled={pending}
            onPress={() => void remove(item)}
          />
        </Card>
      ))}
      {!form && mode === 'none' && (
        <Card>
          <Heading>{t('add')}</Heading>
          <Button
            label={t('byHand')}
            variant="secondary"
            onPress={() => setForm(EMPTY_PUBLICATION)}
          />
          <Button label={t('fromPubmed')} variant="secondary" onPress={() => setMode('pubmed')} />
          <Button label={t('fromOrcid')} variant="secondary" onPress={openOrcid} />
        </Card>
      )}
      {mode === 'pubmed' && !form && (
        <Card>
          <Field
            label={t('pubmedLabel')}
            hint={t('pubmedHint')}
            value={lookupId}
            onChangeText={setLookupId}
            maxLength={300}
            autoCapitalize="none"
          />
          <Button
            label={t('find')}
            pending={pending}
            disabled={!lookupId.trim()}
            onPress={() => void lookup()}
          />
          <Button label={t('cancel')} variant="secondary" onPress={close} />
        </Card>
      )}
      {mode === 'orcid' && !form && (
        <Card>
          <Body muted>{t('orcidHint')}</Body>
          {pending && <Body muted>{m('loading')}</Body>}
          {drafts?.length === 0 && <Body muted>{t('empty')}</Body>}
          {drafts?.map((draft, index) => (
            <View key={`${draft.doi ?? draft.pmid ?? draft.title}-${index}`} style={styles.request}>
              <Text style={styles.strong}>{draft.title}</Text>
              <PublicationLines item={draft} />
              {draft.saved ? (
                <Text style={styles.meta}>{t('already')}</Text>
              ) : (
                <Button
                  label={t('use')}
                  variant="secondary"
                  onPress={() => setForm(fromDraft(draft, 'ORCID'))}
                />
              )}
            </View>
          ))}
          <Button label={t('cancel')} variant="secondary" onPress={close} />
        </Card>
      )}
      {form && (
        <Card>
          <Field label={t('titleLabel')} maxLength={500} {...field('title')} />
          <Field label={t('authors')} maxLength={2000} multiline {...field('authors')} />
          <Field label={t('journal')} maxLength={300} {...field('journal')} />
          <Field label={t('year')} maxLength={4} keyboardType="number-pad" {...field('year')} />
          <Field label={t('doi')} maxLength={200} autoCapitalize="none" {...field('doi')} />
          <Field label={t('pmid')} maxLength={9} keyboardType="number-pad" {...field('pmid')} />
          <Field
            label={t('url')}
            maxLength={500}
            autoCapitalize="none"
            keyboardType="url"
            {...field('url')}
          />
          <Field label={t('topics')} maxLength={700} {...field('topics')} />
          <Toggle
            label={t('hidden')}
            value={form.hidden}
            onChange={(hidden) => setForm((current) => current && { ...current, hidden })}
          />
          <Button
            label={t('save')}
            pending={pending}
            disabled={!form.title.trim()}
            onPress={() => void save()}
          />
          <Button label={t('cancel')} variant="secondary" onPress={close} />
        </Card>
      )}
    </Screen>
  );
}

/** A member's publications on their page, when they show their research interests. */
export function MemberPublications({ userId }: { userId: string }) {
  const t = useTranslations('research.publications');
  const { request } = useSession();
  const [items, setItems] = useState<Publication[]>([]);

  useEffect(() => {
    let active = true;
    request<{ items: Publication[] }>(`/api/v1/members/${encodeURIComponent(userId)}/publications`)
      .then((result) => active && setItems(result.items))
      // Not shown to members, or not reachable: the page simply has no publications.
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [request, userId]);

  if (items.length === 0) return null;
  return (
    <>
      <Heading>{t('title')}</Heading>
      {items.map((item) => (
        <View key={item.id} style={styles.request}>
          <Text style={styles.strong}>{item.title}</Text>
          <PublicationLines item={item} />
        </View>
      ))}
    </>
  );
}

/** The way from the profile to the publications. */
export function PublicationsCard() {
  const t = useTranslations('research.publications');
  const m = useTranslations('mobile.research');
  const router = useRouter();
  return (
    <Card>
      <Heading>{t('title')}</Heading>
      <Body muted>{m('publicationsHint')}</Body>
      <Button
        label={m('publications')}
        variant="secondary"
        onPress={() => router.push('/publications')}
      />
    </Card>
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
  request: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
  },
});
