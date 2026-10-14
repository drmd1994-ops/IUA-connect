'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Schemas = components['schemas'];
type Mine = Schemas['MyVerificationDto'];
type Request = Schemas['VerificationRequestDto'];
type Kind = Request['kind'];
type School = Schemas['MedicalSchoolListDto']['items'][number];

const KINDS: Kind[] = ['SPECIALIST', 'RESIDENT', 'PHYSICIAN', 'STUDENT'];

/** Dates in the reader's language; calendar dates without shifting them by time zone. */
export function useDates() {
  const format = useFormatter();
  return {
    day: (value: string) =>
      format.dateTime(new Date(`${value.slice(0, 10)}T00:00:00Z`), {
        dateStyle: 'long',
        timeZone: 'UTC',
      }),
    long: (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long' }),
  };
}

/**
 * The person's verification by the platform (M17): where they stand, their latest request, and
 * the form to ask (or renew, or answer a refusal). The API decides what may be asked.
 */
export function VerificationPage() {
  return <RequireSignIn>{() => <VerificationView />}</RequireSignIn>;
}

function VerificationView() {
  const t = useTranslations('verification');
  const all = useTranslations();
  const { api, call, reloadMe } = useAuth();
  const [data, setData] = useState<{ mine: Mine; profileComplete: boolean } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/me/verification')),
      call(() => api.GET('/api/v1/me/profile')),
    ])
      .then(([mine, profile]) => {
        if (active) setData({ mine, profileComplete: !!profile.firstName && !!profile.lastName });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  const reload = () => {
    setVersion((v) => v + 1);
    void reloadMe();
  };

  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{t('page.title')}</h1>
      <p className="text-text-muted">{t('page.intro')}</p>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {!data && error === null && <p role="status">{t('page.loading')}</p>}
      {data && (
        <>
          <Standing mine={data.mine} />
          {sent && <Alert tone="success">{t('form.submitted')}</Alert>}
          {data.mine.latest && <LatestRequest request={data.mine.latest} onChanged={reload} />}
          {data.mine.canAsk &&
            (data.profileComplete ? (
              <AskForm
                mine={data.mine}
                onSent={() => {
                  setSent(true);
                  reload();
                }}
              />
            ) : (
              <section className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">{t('form.title')}</h2>
                <Alert>{t('page.profileFirst')}</Alert>
                <Link
                  href="/account/profile"
                  className="self-start font-semibold text-primary underline underline-offset-4"
                >
                  {t('page.goToProfile')}
                </Link>
              </section>
            ))}
        </>
      )}
    </PageFrame>
  );
}

function Standing({ mine }: { mine: Mine }) {
  const t = useTranslations('verification');
  const { long } = useDates();
  const verified = mine.status === 'VERIFIED';
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-border p-5"
      data-testid="verification-status"
    >
      <p className="text-lg font-semibold">
        {verified && mine.verifiedAs
          ? t('page.statuses.VERIFIED', { as: t(`kinds.${mine.verifiedAs}`) })
          : t(`page.statuses.${mine.status}`)}
      </p>
      {verified && mine.verifiedUntil && (
        <p className="text-text-muted">{t('page.until', { date: long(mine.verifiedUntil) })}</p>
      )}
      {mine.byOrganisation && <p className="text-text-muted">{t('page.byOrganisation')}</p>}
      {verified && mine.canAsk && <Alert tone="warning">{t('page.renewNow')}</Alert>}
      {!verified && <p className="text-sm text-text-muted">{t('page.whatOpens')}</p>}
    </section>
  );
}

function LatestRequest({ request, onChanged }: { request: Request; onChanged: () => void }) {
  const t = useTranslations('verification');
  const all = useTranslations();
  const name = useLocalName();
  const { day, long } = useDates();
  const { api, call } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function withdraw() {
    setPending(true);
    setError(null);
    try {
      await call(() => api.POST('/api/v1/me/verification/withdraw'));
      onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-border p-5"
      data-testid="verification-request"
    >
      <h2 className="text-xl font-semibold">{t('page.latestTitle')}</h2>
      <p>
        <span className="font-semibold">{t(`kinds.${request.kind}`)}</span>
        {' · '}
        {t(`page.states.${request.state}`)}
      </p>
      <p className="text-sm text-text-muted">
        {t('page.sentOn', { date: long(request.createdAt) })}
      </p>
      {request.school && (
        <p className="text-sm">
          {name(request.school)}
          {request.expectedGraduation && ` · ${day(request.expectedGraduation)}`}
        </p>
      )}
      {request.documentHeld && <p className="text-sm text-text-muted">{t('page.documentHeld')}</p>}
      {request.decisions.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {request.decisions.map((decision) => (
            <li key={decision.at}>
              {t('page.decisionLine', {
                decision: t(`page.decisions.${decision.decision}`),
                date: long(decision.at),
              })}
              {decision.reason && (
                <span className="block text-text-muted">
                  {t('page.reason', { reason: decision.reason })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {request.state === 'PENDING' && (
        <div>
          <Button
            type="button"
            variant="secondary"
            pending={pending}
            onClick={() => void withdraw()}
          >
            {t('page.withdraw')}
          </Button>
        </div>
      )}
    </section>
  );
}

function AskForm({ mine, onSent }: { mine: Mine; onSent: () => void }) {
  const t = useTranslations('verification');
  const all = useTranslations();
  const name = useLocalName();
  const { api, call } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [kind, setKind] = useState<Kind | ''>(mine.latest?.kind ?? '');
  const [licence, setLicence] = useState('');
  const [certificate, setCertificate] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [graduation, setGraduation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const student = kind === 'STUDENT';
  const refused = mine.status === 'REFUSED';

  useEffect(() => {
    let active = true;
    void api.GET('/api/v1/medical-schools').then((result) => {
      if (active && result.data) setSchools(result.data.items);
    });
    return () => {
      active = false;
    };
  }, [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!kind) return;
    setPending(true);
    setError(null);
    try {
      let documentFileId: string | undefined;
      if (student && file) {
        const uploaded = await call(() =>
          api.POST('/api/v1/me/verification/document', {
            body: { file: '' },
            bodySerializer: () => {
              const data = new FormData();
              data.append('file', file);
              return data;
            },
          }),
        );
        documentFileId = uploaded.id;
      }
      await call(() =>
        api.POST('/api/v1/me/verification', {
          body: {
            kind,
            ...(student
              ? {
                  ...(schoolId ? { schoolId } : {}),
                  ...(graduation ? { expectedGraduation: graduation } : {}),
                  ...(documentFileId ? { documentFileId } : {}),
                }
              : {
                  licence,
                  ...(kind === 'SPECIALIST' ? { certificate } : {}),
                }),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        }),
      );
      onSent();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const title =
    mine.status === 'VERIFIED' || mine.status === 'EXPIRED'
      ? t('form.renewTitle')
      : refused
        ? t('form.answerTitle')
        : t('form.title');

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ask-title">
      <h2 id="ask-title" className="text-xl font-semibold">
        {title}
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <SelectField
          label={t('form.kind')}
          placeholder={t('form.chooseKind')}
          value={kind}
          required
          onChange={(event) => setKind(event.target.value as Kind)}
          options={KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }))}
        />
        {kind && !student && (
          <TextField
            label={t('form.licence')}
            hint={t('form.licenceHint')}
            value={licence}
            onChange={(event) => setLicence(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={40}
            required
          />
        )}
        {kind === 'SPECIALIST' && (
          <TextField
            label={t('form.certificate')}
            value={certificate}
            onChange={(event) => setCertificate(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={40}
            required
          />
        )}
        {student && (
          <>
            <SelectField
              label={t('form.school')}
              placeholder={t('form.chooseSchool')}
              value={schoolId}
              required
              onChange={(event) => setSchoolId(event.target.value)}
              options={schools.map((school) => ({ value: school.id, label: name(school) }))}
            />
            <TextField
              label={t('form.graduation')}
              hint={t('form.graduationHint')}
              type="date"
              value={graduation}
              onChange={(event) => setGraduation(event.target.value)}
              required
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="verification-document" className="font-semibold">
                {t('form.document')}
              </label>
              <p id="verification-document-hint" className="text-sm text-text-muted">
                {t('form.documentHint')}
              </p>
              <input
                id="verification-document"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                aria-describedby="verification-document-hint"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="max-w-full text-sm"
              />
            </div>
          </>
        )}
        <TextareaField
          label={t('form.note')}
          hint={refused ? t('form.answerHint') : undefined}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          rows={3}
        />
        {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
        <div>
          <Button
            type="submit"
            pending={pending}
            pendingLabel={all('auth.pending')}
            disabled={!kind}
          >
            {t('form.submit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
