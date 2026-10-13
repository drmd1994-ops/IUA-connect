'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { EDUCATION_LEVELS, type EducationLevel } from '@/features/education/education-list';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import {
  EDUCATION_STATUSES,
  type EducationAction,
  type EducationStatus,
  HistoryList,
  ReviewPanel,
  useCanEdit,
} from './education-review';
import { type Tier, TierFields, platformTier } from './tier-fields';

type Schemas = components['schemas'];
type List = Schemas['AdminExamQuestionListDto'];
type Question = Schemas['AdminExamQuestionDto'];
type History = Schemas['EducationHistoryDto']['items'];
type Lang = 'he' | 'en';

const PAGE_SIZE = 25;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const LANGS: Lang[] = ['he', 'en'];
const link = 'font-semibold text-primary underline underline-offset-4';

/** Every exam question with its state. "Waiting for review" is the reviewers' queue. */
export function ExamQuestionsPage() {
  const t = useTranslations();
  const a = (key: string, values?: Record<string, string | number>) =>
    t(`education.admin.${key}`, values);
  const locale = useLocale();
  const format = useFormatter();
  const { api, call, me } = useAuth();
  const [status, setStatus] = useState<EducationStatus | ''>(
    me?.permissions.some((p) => p === 'education.review') ? 'IN_REVIEW' : '',
  );
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/exam-questions', {
        params: {
          query: { page, pageSize: PAGE_SIZE, ...(status ? { status } : {}), ...(q ? { q } : {}) },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, status, q]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/education" className={link}>
          {a('back')}
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-brand-900">{a('questions.title')}</h1>
          <Link
            href="/admin/education/questions/new"
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
          >
            {a('questions.new')}
          </Link>
        </div>
        <p className="mt-2 text-text-muted">{a('questions.draftNote')}</p>
      </div>
      <form
        role="search"
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <TextField
          label={a('questions.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={a('status')}
          placeholder={a('allStatuses')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as EducationStatus | '');
            setPage(1);
          }}
          options={EDUCATION_STATUSES.map((s) => ({ value: s, label: a(`statuses.${s}`) }))}
        />
        <div>
          <Button type="submit">{a('searchButton')}</Button>
        </div>
      </form>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {a('questions.total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{a('questions.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="questions-table">
                <thead className="bg-surface-muted">
                  <tr>
                    {(
                      ['questions.colQuestion', 'colStatus', 'colAccess', 'colUpdated'] as const
                    ).map((column) => (
                      <th key={column} scope="col" className="p-3 text-start">
                        {a(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <Link href={`/admin/education/questions/${item.id}`} className={link}>
                          {(locale === 'he'
                            ? (item.stemHe ?? item.stemEn)
                            : (item.stemEn ?? item.stemHe)) ?? a('untitled')}
                        </Link>
                      </td>
                      <td className="p-3">{a(`statuses.${item.status}`)}</td>
                      <td className="p-3">{t(`content.common.tiers.${item.accessTier}`)}</td>
                      <td className="p-3">
                        {format.dateTime(new Date(item.updatedAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

interface OptionDraft {
  correct: boolean;
  text: Record<Lang, { text: string; explanation: string }>;
}
interface Draft {
  level: EducationLevel | '';
  subspecialtyId: string;
  tier: Tier;
  typeIds: string[];
  text: Record<Lang, { stem: string; summary: string }>;
  options: OptionDraft[];
}

const emptyOption = (): OptionDraft => ({
  correct: false,
  text: { he: { text: '', explanation: '' }, en: { text: '', explanation: '' } },
});

function toDraft(question: Question | null): Draft {
  const text = (lang: Lang) => {
    const t = question?.translations[lang];
    return { stem: t?.stem ?? '', summary: t?.summary ?? '' };
  };
  return {
    level: question?.level ?? '',
    subspecialtyId: question?.subspecialtyId ?? '',
    tier: question?.accessTier ?? 'PUBLIC',
    typeIds: question?.typeIds ?? [],
    text: { he: text('he'), en: text('en') },
    options: question
      ? question.options.map((option) => ({
          correct: option.correct,
          text: {
            he: {
              text: option.translations.he?.text ?? '',
              explanation: option.translations.he?.explanation ?? '',
            },
            en: {
              text: option.translations.en?.text ?? '',
              explanation: option.translations.en?.explanation ?? '',
            },
          },
        }))
      : // A new question starts with four options, the usual number.
        [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
  };
}

function toBody(draft: Draft) {
  const questionText = (lang: Lang) => {
    const t = draft.text[lang];
    return t.stem.trim() ? { stem: t.stem.trim(), summary: t.summary.trim() } : undefined;
  };
  return {
    level: draft.level || null,
    subspecialtyId: draft.subspecialtyId || null,
    accessTier: platformTier(draft.tier),
    typeIds: draft.tier === 'TYPES' ? draft.typeIds : [],
    translations: { he: questionText('he'), en: questionText('en') },
    options: draft.options.map((option) => {
      const optionText = (lang: Lang) => {
        const t = option.text[lang];
        return t.text.trim()
          ? { text: t.text.trim(), explanation: t.explanation.trim() }
          : undefined;
      };
      return {
        correct: option.correct,
        translations: { he: optionText('he'), en: optionText('en') },
      };
    }),
  };
}

/** Loads a question (or starts a new one) and shows the editor. */
export function ExamQuestionEditor({ id }: { id: string | null }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [question, setQuestion] = useState<Question | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    call(() => api.GET('/api/v1/admin/exam-questions/{id}', { params: { path: { id } } }))
      .then((result) => active && setQuestion(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  if (error !== null) return <Alert tone="error">{errorMessage(error, t)}</Alert>;
  if (id && !question) return <p role="status">{t('membership.common.loading')}</p>;
  return <QuestionForm key={question?.id ?? 'new'} initial={question} />;
}

function QuestionForm({ initial }: { initial: Question | null }) {
  const t = useTranslations();
  const q = (key: string, values?: Record<string, string | number>) =>
    t(`education.admin.questions.${key}`, values);
  const e = (key: string) => t(`education.admin.editor.${key}`);
  const name = useLocalName();
  const reference = useReference();
  const router = useRouter();
  const { api, call } = useAuth();
  const [question, setQuestion] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [lang, setLang] = useState<Lang>('he');
  const [history, setHistory] = useState<History | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const tabsId = useId();
  const groupId = useId();
  const editable = useCanEdit(question?.status ?? null);
  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setOption = (index: number, change: (option: OptionDraft) => OptionDraft) =>
    set({ options: draft.options.map((option, i) => (i === index ? change(option) : option)) });
  const questionId = question?.id;
  const version = question?.version;

  useEffect(() => {
    if (!questionId) return;
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/exam-questions/{id}/history', {
        params: { path: { id: questionId } },
      }),
    )
      .then((result) => active && setHistory(result.items))
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
    // Reloaded when the question changes (its version increases on every change).
  }, [api, call, questionId, version]);

  async function attempt(work: () => Promise<Question | null>) {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await work();
      if (!result) {
        router.push('/admin/education/questions');
        return;
      }
      if (result.id !== question?.id) {
        router.replace(`/admin/education/questions/${result.id}`);
        return;
      }
      setQuestion(result);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  /** Creates the question, or saves it with the version it was loaded with (If-Match). */
  const save = () => {
    const body = toBody(draft);
    if (!question) return call(() => api.POST('/api/v1/admin/exam-questions', { body }));
    return call(() =>
      api.PUT('/api/v1/admin/exam-questions/{id}', {
        params: { path: { id: question.id }, header: { 'If-Match': `"${question.version}"` } },
        body,
      }),
    );
  };

  const transition = (action: EducationAction, comment?: string) =>
    attempt(async () => {
      // Submitting, and a reviewer's publishing, send what is on the screen: save first.
      const saveFirst = action === 'SUBMIT' || (action === 'PUBLISH' && editable);
      const current = saveFirst ? await save() : question!;
      return call(() =>
        api.POST('/api/v1/admin/exam-questions/{id}/transitions', {
          params: { path: { id: current.id } },
          body: { action, ...(comment ? { comment } : {}) },
        }),
      );
    });

  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const text = draft.text[lang];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/education/questions" className={link}>
          {q('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">
          {question ? q('editTitle') : q('newTitle')}
        </h1>
        {question && (
          <p className="mt-2 text-text-muted" data-testid="question-status">
            {t(`education.admin.statuses.${question.status}`)}
          </p>
        )}
      </div>
      {!editable && <Alert>{e('readOnly')}</Alert>}
      <Alert tone="warning">{e('privacy')}</Alert>

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void attempt(save);
        }}
      >
        <fieldset disabled={!editable || pending} className="flex flex-col gap-6">
          <div role="tablist" aria-label={e('language')} className="flex gap-1">
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                id={`${tabsId}-${code}`}
                aria-selected={lang === code}
                aria-controls={`${tabsId}-panel`}
                onClick={() => setLang(code)}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${
                  lang === code
                    ? 'bg-primary text-on-primary'
                    : 'border border-border text-text hover:bg-surface-muted'
                }`}
              >
                {e(code === 'he' ? 'hebrew' : 'english')}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-${lang}`}
            className="flex flex-col gap-6"
          >
            <TextareaField
              label={q('stem')}
              value={text.stem}
              onChange={(event) =>
                set({ text: { ...draft.text, [lang]: { ...text, stem: event.target.value } } })
              }
              maxLength={4000}
              rows={3}
              lang={lang}
              dir={dir}
            />

            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 text-xl font-semibold">{q('options')}</legend>
              <p className="text-sm text-text-muted">{q('optionsHint')}</p>
              {draft.options.map((option, index) => {
                const number = index + 1;
                return (
                  <div
                    key={index}
                    className="flex flex-col gap-3 rounded-md border border-border p-4"
                    data-testid={`option-${number}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 font-semibold">
                        <input
                          type="radio"
                          name={groupId}
                          className="size-4"
                          checked={option.correct}
                          onChange={() =>
                            set({
                              options: draft.options.map((o, i) => ({
                                ...o,
                                correct: i === index,
                              })),
                            })
                          }
                        />
                        {q('correct', { number })}
                      </label>
                      {draft.options.length > MIN_OPTIONS && (
                        <Button
                          type="button"
                          variant="link"
                          onClick={() =>
                            set({ options: draft.options.filter((_, i) => i !== index) })
                          }
                        >
                          {q('removeOption', { number })}
                        </Button>
                      )}
                    </div>
                    <TextField
                      label={q('optionText', { number })}
                      value={option.text[lang].text}
                      onChange={(event) =>
                        setOption(index, (current) => ({
                          ...current,
                          text: {
                            ...current.text,
                            [lang]: { ...current.text[lang], text: event.target.value },
                          },
                        }))
                      }
                      maxLength={1000}
                      lang={lang}
                      dir={dir}
                    />
                    <TextareaField
                      label={q('explanation', { number })}
                      value={option.text[lang].explanation}
                      onChange={(event) =>
                        setOption(index, (current) => ({
                          ...current,
                          text: {
                            ...current.text,
                            [lang]: { ...current.text[lang], explanation: event.target.value },
                          },
                        }))
                      }
                      maxLength={4000}
                      rows={2}
                      lang={lang}
                      dir={dir}
                    />
                  </div>
                );
              })}
              {draft.options.length < MAX_OPTIONS && (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => set({ options: [...draft.options, emptyOption()] })}
                  >
                    {q('addOption')}
                  </Button>
                </div>
              )}
            </fieldset>

            <TextareaField
              label={q('summary')}
              hint={q('summaryHint')}
              value={text.summary}
              onChange={(event) =>
                set({ text: { ...draft.text, [lang]: { ...text, summary: event.target.value } } })
              }
              maxLength={4000}
              rows={4}
              lang={lang}
              dir={dir}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label={e('level')}
              placeholder={t('education.levels.all')}
              value={draft.level}
              onChange={(event) => set({ level: event.target.value as EducationLevel | '' })}
              options={EDUCATION_LEVELS.map((value) => ({
                value,
                label: t(`education.levels.${value}`),
              }))}
            />
            <SelectField
              label={e('subspecialty')}
              placeholder={e('noSubspecialty')}
              value={draft.subspecialtyId}
              onChange={(event) => set({ subspecialtyId: event.target.value })}
              options={(reference?.subspecialties ?? []).map((s) => ({
                value: s.id,
                label: name(s),
              }))}
            />
            <TierFields
              label={e('tier')}
              typesLabel={e('types')}
              tier={draft.tier}
              typeIds={draft.typeIds}
              owner={null}
              onChange={(tier, typeIds) => set({ tier, typeIds })}
            />
          </div>
        </fieldset>

        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {saved && <Alert tone="success">{e('saved')}</Alert>}
        {editable && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={pending}>
              {e('save')}
            </Button>
            {question?.status === 'DRAFT' && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => void transition('SUBMIT')}
              >
                {t('education.admin.actions.SUBMIT')}
              </Button>
            )}
          </div>
        )}
      </form>

      {question && (
        <ReviewPanel
          status={question.status}
          everPublished={question.publishedAt !== null}
          publicHref="/education/exam"
          pending={pending}
          onAction={(action, comment) => void transition(action, comment)}
          onDelete={() =>
            void attempt(async () => {
              await call(() =>
                api.DELETE('/api/v1/admin/exam-questions/{id}', {
                  params: { path: { id: question.id } },
                }),
              );
              return null;
            })
          }
        />
      )}
      <HistoryList history={history} />
    </div>
  );
}
