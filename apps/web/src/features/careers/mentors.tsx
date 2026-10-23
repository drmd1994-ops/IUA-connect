'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { CareersNav, MENTOR_LANGUAGES, useDisplayNames } from './careers-parts';

type Schemas = components['schemas'];
type List = Schemas['MentorListDto'];
type Mentor = List['items'][number];

const PAGE_SIZE = 12;
const link = 'font-semibold text-primary underline underline-offset-4';

interface Filters {
  q: string;
  subspecialty: string;
  hospital: string;
  language: string;
}

/**
 * The mentors (M28), for verified people (owner answer §10.3): open mentors only, with what
 * they offer, and a request to each.
 */
export function Mentors() {
  return <RequireSignIn>{(me) => (me.verified ? <MentorList /> : <NotVerified />)}</RequireSignIn>;
}

function NotVerified() {
  const t = useTranslations('careers');
  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{t('mentors.title')}</h1>
      <CareersNav />
      <Alert>{t('mentors.verifiedOnly')}</Alert>
      <Link href="/account/verification" className={link}>
        {t('mentors.verifyLink')}
      </Link>
    </PageFrame>
  );
}

function MentorList() {
  const t = useTranslations();
  const name = useLocalName();
  const names = useDisplayNames();
  const reference = useReference();
  const { api, call } = useAuth();
  const [typed, setTyped] = useState('');
  const [filters, setFilters] = useState<Filters>({
    q: '',
    subspecialty: '',
    hospital: '',
    language: '',
  });
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  const change = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/mentorship/mentors', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(filters.q ? { q: filters.q } : {}),
            ...(filters.subspecialty ? { subspecialty: filters.subspecialty } : {}),
            ...(filters.hospital ? { hospital: filters.hospital } : {}),
            ...(filters.language ? { language: filters.language } : {}),
          },
        },
      }),
    )
      .then((result) => {
        if (!active) return;
        setList(result);
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, filters, version]);

  const m = (key: string) => t(`careers.mentors.${key}`);
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{m('title')}</h1>
        <p className="mt-2 text-text-muted">{m('intro')}</p>
      </div>
      <CareersNav />
      <form
        role="search"
        noValidate
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          change({ q: typed.trim() });
        }}
      >
        <TextField
          className="min-w-56 flex-1"
          label={m('search')}
          hint={m('searchHint')}
          type="search"
          value={typed}
          maxLength={100}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {m('search')}
        </Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label={m('subspecialty')}
          placeholder={m('allSubspecialties')}
          value={filters.subspecialty}
          onChange={(event) => change({ subspecialty: event.target.value })}
          options={(reference?.subspecialties ?? []).map((s) => ({ value: s.key, label: name(s) }))}
        />
        <SelectField
          label={m('hospital')}
          placeholder={m('allHospitals')}
          value={filters.hospital}
          onChange={(event) => change({ hospital: event.target.value })}
          options={(reference?.hospitals ?? []).map((h) => ({ value: h.id, label: name(h) }))}
        />
        <SelectField
          label={m('language')}
          placeholder={m('allLanguages')}
          value={filters.language}
          onChange={(event) => change({ language: event.target.value })}
          options={MENTOR_LANGUAGES.map((code) => ({
            value: code,
            label: names.language.of(code) ?? code,
          }))}
        />
      </div>
      <p className="text-sm text-text-muted">{m('rules')}</p>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && <p className="text-text-muted">{m('empty')}</p>}
      {list && list.items.length > 0 && (
        <ul className="grid gap-6 md:grid-cols-2" data-testid="mentors-list">
          {list.items.map((mentor) => (
            <li key={mentor.person.id}>
              <MentorCard mentor={mentor} onAsked={() => setVersion((v) => v + 1)} />
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}

function MentorCard({ mentor, onAsked }: { mentor: Mentor; onAsked: () => void }) {
  const t = useTranslations();
  const name = useLocalName();
  const names = useDisplayNames();
  const { api, call } = useAuth();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const headingId = useId();
  const person = mentor.person;
  const fullName = `${person.firstName} ${person.lastName}`;
  const m = (key: string) => t(`careers.mentors.${key}`);

  async function send(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/mentorship/requests', {
          body: { mentorId: person.id, message: message.trim() },
        }),
      );
      setSent(true);
      setAsking(false);
      onAsked();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const place = [
    person.department ? name(person.department) : null,
    person.hospital ? name(person.hospital) : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-card"
    >
      <div>
        <h2 id={headingId} className="text-lg font-semibold text-brand-900">
          {fullName}
        </h2>
        {place && <p className="text-text">{place}</p>}
        {mentor.subspecialties.length > 0 && (
          <p className="text-sm text-text-muted">
            {mentor.subspecialties.map((s) => name(s)).join(', ')}
          </p>
        )}
      </div>
      <dl className="grid gap-2 text-sm">
        {mentor.academicInterests && (
          <div>
            <dt className="font-semibold">{m('academic')}</dt>
            <dd>{mentor.academicInterests}</dd>
          </div>
        )}
        {mentor.careerInterests && (
          <div>
            <dt className="font-semibold">{m('career')}</dt>
            <dd>{mentor.careerInterests}</dd>
          </div>
        )}
        {mentor.availability && (
          <div>
            <dt className="font-semibold">{m('availability')}</dt>
            <dd>{mentor.availability}</dd>
          </div>
        )}
        {mentor.languages.length > 0 && (
          <div>
            <dt className="font-semibold">{m('languages')}</dt>
            <dd>{mentor.languages.map((code) => names.language.of(code) ?? code).join(', ')}</dd>
          </div>
        )}
      </dl>
      <div className="mt-auto flex flex-col gap-3">
        {sent && <Alert tone="success">{t('careers.mentors.sent', { name: fullName })}</Alert>}
        {!sent && mentor.mine?.state === 'PENDING' && <Alert>{m('waiting')}</Alert>}
        {mentor.mine?.state === 'ACCEPTED' && (
          <p className="font-semibold text-primary">{m('yourMentor')}</p>
        )}
        {!mentor.mine && !mentor.taking && (
          <p className="text-sm font-semibold text-text-muted">{m('notTaking')}</p>
        )}
        {!mentor.mine && mentor.taking && !asking && !sent && (
          <div>
            <Button
              type="button"
              variant="secondary"
              aria-label={t('careers.mentors.askLabel', { name: fullName })}
              onClick={() => setAsking(true)}
            >
              {m('ask')}
            </Button>
          </div>
        )}
        {asking && (
          <form noValidate onSubmit={(event) => void send(event)} className="flex flex-col gap-3">
            <TextareaField
              label={t('careers.mentors.message', { name: fullName })}
              hint={m('messageHint')}
              value={message}
              maxLength={1000}
              rows={4}
              onChange={(event) => setMessage(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" pending={pending} disabled={!message.trim()}>
                {m('send')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
                {m('cancel')}
              </Button>
            </div>
          </form>
        )}
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      </div>
    </article>
  );
}
