'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import {
  PersonLine,
  type Project,
  ProjectFlags,
  ResearchFrame,
  ResearchNav,
  link,
} from './research-parts';

/**
 * One research project (M27): what it is and looks for, and a way to ask to join it. Its lead
 * edits or ends it here; its lead and the people accepted reach its chat group.
 */
export function ProjectView({ id }: { id: string }) {
  return (
    <ResearchFrame>
      <View id={id} />
    </ResearchFrame>
  );
}

function View({ id }: { id: string }) {
  const t = useTranslations();
  const name = useLocalName();
  const { api, call, me } = useAuth();
  const [item, setItem] = useState<Project | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [ending, setEnding] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/research/projects/{id}', { params: { path: { id } } }))
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      const request = await call(() =>
        api.POST('/api/v1/research/projects/{id}/requests', {
          params: { path: { id: item.id } },
          body: { message: message.trim() },
        }),
      );
      setItem({ ...item, myRequest: { id: request.id, state: request.state } });
      setAsking(false);
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function end() {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      setItem(
        await call(() =>
          api.POST('/api/v1/research/projects/{id}/end', { params: { path: { id: item.id } } }),
        ),
      );
      setEnding(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const p = (key: string, values?: Record<string, number>) => t(`research.project.${key}`, values);
  const back = (
    <Link href="/research" className={link}>
      {p('back')}
    </Link>
  );
  if (error !== null && !item) {
    return (
      <PageFrame>
        {back}
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? p('notFound') : errorMessage(error, t)}
        </Alert>
      </PageFrame>
    );
  }
  if (!item) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }

  const member = item.myRequest?.state === 'ACCEPTED';
  const waiting = item.myRequest?.state === 'PENDING';
  const canAsk = !item.mine && !member && !waiting && item.open && !item.ended;
  return (
    <PageFrame>
      <ResearchNav canList={me?.verifiedAs !== 'STUDENT'} />
      {back}
      <article className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">
            {t(`research.studyTypes.${item.studyType}`)} · {t(`research.statuses.${item.status}`)}
          </p>
          <h1 className="text-3xl font-semibold text-brand-900">{item.title}</h1>
          <ProjectFlags item={item} />
          <p>
            <span className="font-semibold">{p('lead')}: </span>
            <PersonLine person={item.lead} />
          </p>
          <p className="text-text-muted">{t(`research.ethics.${item.ethics}`)}</p>
          {item.needs.length > 0 && (
            <p className="text-text-muted">
              {t('research.list.lookingFor', {
                needs: item.needs.map((n) => t(`research.needs.${n}`)).join(', '),
              })}
            </p>
          )}
          {item.subspecialties.length > 0 && (
            <p className="text-text-muted">{item.subspecialties.map((s) => name(s)).join(', ')}</p>
          )}
          <p className="text-sm text-text-muted">{p('members', { count: item.members })}</p>
        </header>
        <p className="whitespace-pre-line">{item.description}</p>
        {(item.funding || item.contact) && (
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            {item.funding && (
              <>
                <dt className="font-semibold">{p('funding')}</dt>
                <dd>{item.funding}</dd>
              </>
            )}
            {item.contact && (
              <>
                <dt className="font-semibold">{p('contact')}</dt>
                <dd>{item.contact}</dd>
              </>
            )}
          </dl>
        )}
        <p className="text-sm text-text-muted">{p('noPatientData')}</p>
        {item.mine && item.stale && !item.ended && <Alert tone="warning">{p('staleNote')}</Alert>}
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {sent && <Alert tone="success">{p('sent')}</Alert>}
        {waiting && !sent && <p role="status">{p('waiting')}</p>}
        {member && !item.mine && <p>{p('member')}</p>}
        {item.groupId && (
          <p>
            <Link href={`/chat/${item.groupId}`} className={link}>
              {p('openGroup')}
            </Link>
          </p>
        )}
        {canAsk && !asking && (
          <div>
            <Button type="button" onClick={() => setAsking(true)}>
              {p('ask')}
            </Button>
          </div>
        )}
        {canAsk && asking && (
          <form
            onSubmit={(event) => void ask(event)}
            className="flex flex-col gap-3 rounded-md border border-border p-5"
          >
            <TextareaField
              label={p('message')}
              hint={p('messageHint')}
              value={message}
              maxLength={1000}
              required
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="text-sm text-text-muted">{p('rules')}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" pending={pending} disabled={!message.trim()}>
                {p('send')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
                {p('cancel')}
              </Button>
            </div>
          </form>
        )}
        {item.mine && !item.ended && (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/research/${item.id}/edit`} className={link}>
              {p('edit')}
            </Link>
            {!ending ? (
              <Button type="button" variant="secondary" onClick={() => setEnding(true)}>
                {p('end')}
              </Button>
            ) : (
              <div
                role="group"
                aria-label={p('end')}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4"
              >
                <p>{p('endConfirm')}</p>
                <Button type="button" variant="danger" pending={pending} onClick={() => void end()}>
                  {p('end')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEnding(false)}>
                  {p('cancel')}
                </Button>
              </div>
            )}
          </div>
        )}
      </article>
    </PageFrame>
  );
}
