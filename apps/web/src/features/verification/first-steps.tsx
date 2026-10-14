'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { sectionHref } from '@/features/organisations/organisations';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

const link = 'font-semibold text-primary underline underline-offset-4';
const card = 'flex flex-col gap-3 rounded-lg border border-border bg-surface p-6 shadow-card';

interface Facts {
  named: boolean;
  photo: boolean;
  listed: boolean;
  organisation: { slug: string } | null;
}

/**
 * The top of a signed-in person's home (M17 step 6). Not verified: where they stand, and the way
 * to ask. Verified: a short start (profile, the directory, colleagues, their organisation's
 * section), each step ticked when done, and inviting a colleague.
 */
export function FirstSteps() {
  const { me } = useAuth();
  if (!me) return null;
  return me.verified ? <Steps /> : <AskFirst />;
}

function AskFirst() {
  const t = useTranslations('verification.start');
  const { api, call } = useAuth();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/verification'))
      .then((mine) => active && setStatus(mine.status))
      .catch(() => active && setStatus('NOT_ASKED'));
    return () => {
      active = false;
    };
  }, [api, call]);

  if (!status) return null;
  return (
    <section className={card} aria-labelledby="start-ask" data-testid="first-steps">
      <h2 id="start-ask" className="text-xl font-semibold">
        {t('askTitle')}
      </h2>
      <p>{status === 'WAITING' ? t('waiting') : t('ask')}</p>
      <Link href="/account/verification" className={`${link} self-start`}>
        {status === 'WAITING' ? t('follow') : t('askLink')}
      </Link>
    </section>
  );
}

function Steps() {
  const t = useTranslations('verification.start');
  const { api, call } = useAuth();
  const [facts, setFacts] = useState<Facts | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/me/profile')),
      call(() => api.GET('/api/v1/me/consents')),
      call(() => api.GET('/api/v1/me/memberships')),
    ])
      .then(([profile, consents, memberships]) => {
        if (!active) return;
        const held = memberships.items.find((item) => item.status === 'ACTIVE');
        setFacts({
          named: !!profile.firstName && !!profile.lastName && !!profile.title,
          photo: !!profile.photoFileId,
          listed: consents.directory.granted,
          organisation: held ? { slug: held.organisation.slug } : null,
        });
      })
      .catch(() => active && setFacts(null));
    return () => {
      active = false;
    };
  }, [api, call]);

  if (!facts) return null;
  const steps = [
    { key: 'profile', done: facts.named && facts.photo, href: '/account/profile' },
    { key: 'directory', done: facts.listed, href: '/account/profile' },
    { key: 'colleagues', done: false, href: '/members' },
    ...(facts.organisation
      ? [{ key: 'organisation', done: false, href: sectionHref(facts.organisation.slug) }]
      : []),
  ] as const;
  return (
    <section className={card} aria-labelledby="start-steps" data-testid="first-steps">
      <h2 id="start-steps" className="text-xl font-semibold">
        {t('stepsTitle')}
      </h2>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-2">
            <span aria-hidden="true" className="w-5 shrink-0 text-center">
              {step.done ? '✓' : '•'}
            </span>
            <span className="min-w-0">
              <Link href={step.href} className={link}>
                {t(`steps.${step.key}`)}
              </Link>
              {step.done && <span className="sr-only"> ({t('done')})</span>}
            </span>
          </li>
        ))}
      </ul>
      <InviteForm />
    </section>
  );
}

function InviteForm() {
  const t = useTranslations('verification.start');
  const all = useTranslations();
  const { api, call } = useAuth();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSent(false);
    try {
      await call(() => api.POST('/api/v1/me/invitations', { body: { email: email.trim() } }));
      setSent(true);
      setEmail('');
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-2 flex flex-col gap-3 border-t border-border pt-4"
    >
      <h3 className="font-semibold">{t('inviteTitle')}</h3>
      <p className="text-sm text-text-muted">{t('inviteIntro')}</p>
      <TextField
        label={t('inviteEmail')}
        type="email"
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        maxLength={254}
        required
      />
      {sent && <Alert tone="success">{t('inviteSent')}</Alert>}
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      <div>
        <Button type="submit" variant="secondary" pending={pending} disabled={!email.trim()}>
          {t('inviteSubmit')}
        </Button>
      </div>
    </form>
  );
}
