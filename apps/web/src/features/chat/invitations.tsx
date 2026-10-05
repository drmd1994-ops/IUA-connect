'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { CHAT_CHANGED } from './chat-events';
import { type Invitation, conversationPath, personName } from './chat-model';
import { Avatar, type Subscribe, chatLink } from './chat-parts';
import { Modal } from './modal';

type People = components['schemas']['ChatPeopleDto']['items'];

/** How many invitations wait for the reader, kept current by the page's events. */
export function useInvitationCount(subscribe: Subscribe): number {
  const { api, call } = useAuth();
  const [count, setCount] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/chat/invitations'))
      .then((result) => active && setCount(result.items.length))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call, version]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'invitation' || event.type === 'refresh') {
          setVersion((value) => value + 1);
        }
      }),
    [subscribe],
  );
  return count;
}

/**
 * The reader's invitations to groups and to rooms by invitation. Until one is accepted the
 * reader is in none of them: the page shows who invited, and for a group who is in it, and
 * nothing that was written there.
 */
export function Invitations({ subscribe }: { subscribe: Subscribe }) {
  const all = useTranslations();
  const t = useTranslations('groups.invitations');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/chat/invitations'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'invitation' || event.type === 'refresh') {
          setVersion((value) => value + 1);
        }
      }),
    [subscribe],
  );

  async function answer(item: Invitation, how: 'accept' | 'decline' | 'block') {
    setPending(item.id);
    setError(null);
    try {
      const path = { id: item.id };
      if (how === 'accept') {
        const accepted = await call(() =>
          api.POST('/api/v1/chat/invitations/{id}/accept', { params: { path } }),
        );
        window.dispatchEvent(new Event(CHAT_CHANGED));
        router.push(conversationPath(accepted.kind, accepted.conversationId));
        return;
      }
      if (how === 'block' && item.invitedBy.id) {
        // Blocking the person declines what they sent.
        await call(() => api.POST('/api/v1/chat/blocks', { body: { userId: item.invitedBy.id! } }));
      } else {
        await call(() => api.POST('/api/v1/chat/invitations/{id}/decline', { params: { path } }));
      }
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      data-testid="invitations"
    >
      <div>
        <Link href="/chat" className={`${chatLink} text-sm md:hidden`}>
          {t('back')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-brand-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('intro')}</p>
      </div>
      {error !== null && (
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? t('empty') : errorMessage(error, all)}
        </Alert>
      )}
      {!items && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {items?.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const group = item.kind === 'GROUP';
            const name = group || locale === 'he' ? item.name : (item.nameEn ?? item.name);
            const inviter = personName(item.invitedBy);
            return (
              <li
                key={item.id}
                data-testid="invitation"
                className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4"
              >
                <p className="text-xs font-semibold text-text-muted">
                  {group ? t('group') : t('room')}
                  {' · '}
                  {t('people', { count: item.memberCount })}
                </p>
                <h2 dir="auto" className="text-lg font-semibold">
                  {name}
                </h2>
                <p className="text-sm">
                  {inviter ? t('from', { name: inviter }) : t('fromUnknown')}
                </p>
                {group && item.members.length > 0 && (
                  <div className="text-sm">
                    <p className="text-text-muted">{t('inGroup')}</p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {item.members.map((person) => (
                        <li
                          key={person.id}
                          className="flex items-center gap-1.5 rounded-full bg-surface-muted py-0.5 pe-3 ps-0.5"
                        >
                          <Avatar person={person} size="size-6" />
                          <span>{personName(person)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-text-muted">
                  {group ? t('groupNote') : t('roomNote')}{' '}
                  {t('expires', {
                    when: format.dateTime(new Date(item.expiresAt), { dateStyle: 'medium' }),
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    pending={pending === item.id}
                    disabled={pending !== null}
                    aria-label={t('acceptName', { name })}
                    onClick={() => void answer(item, 'accept')}
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending !== null}
                    aria-label={t('declineName', { name })}
                    onClick={() => void answer(item, 'decline')}
                  >
                    {t('decline')}
                  </Button>
                  {inviter && item.invitedBy.id && (
                    <Button
                      type="button"
                      variant="link"
                      disabled={pending !== null}
                      onClick={() => void answer(item, 'block')}
                    >
                      {t('block', { name: inviter })}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items && items.length > 0 && <p className="text-sm text-text-muted">{t('declineNote')}</p>}
    </div>
  );
}

/** Making a group: a name, and the people to invite. Nobody is in it until they accept. */
export function NewGroupDialog({ onClose }: { onClose: () => void }) {
  const all = useTranslations();
  const t = useTranslations('groups.create');
  const router = useRouter();
  const { api, call } = useAuth();
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<People | null>(null);
  const [chosen, setChosen] = useState<People>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function find() {
    const q = search.trim();
    if (q.length < 2) return;
    setError(null);
    try {
      const result = await call(() =>
        api.GET('/api/v1/chat/invitable', { params: { query: { q } } }),
      );
      setFound(result.items);
    } catch (caught) {
      setError(caught);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const group = await call(() =>
        api.POST('/api/v1/chat/groups', {
          body: { name: name.trim(), userIds: chosen.map((person) => person.id) },
        }),
      );
      window.dispatchEvent(new Event(CHAT_CHANGED));
      router.push(`/chat/groups/${group.id}`);
      onClose();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  const picked = new Set(chosen.map((person) => person.id));
  return (
    <Modal title={t('title')} closeLabel={t('cancel')} onClose={onClose}>
      <form onSubmit={create} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
        <div className="flex items-end gap-3">
          <TextField
            label={t('people')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              // Enter here searches; it doesn't make the group.
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void find();
            }}
            maxLength={100}
            className="flex-1"
          />
          <Button type="button" variant="secondary" onClick={() => void find()}>
            {t('searchButton')}
          </Button>
        </div>
        {found?.length === 0 && <p className="text-sm text-text-muted">{t('noResults')}</p>}
        {found && found.length > 0 && (
          <ul
            data-testid="group-candidates"
            className="flex max-h-40 flex-col gap-1 overflow-y-auto"
          >
            {found
              .filter((person) => !picked.has(person.id))
              .map((person) => {
                const label = personName(person) ?? '';
                return (
                  <li key={person.id} className="flex items-center gap-3">
                    <Avatar person={{ ...person, listed: true }} size="size-8" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-sm"
                      aria-label={t('addName', { name: label })}
                      onClick={() => setChosen((current) => [...current, person])}
                    >
                      {t('add')}
                    </Button>
                  </li>
                );
              })}
          </ul>
        )}
        <div>
          <h3 className="text-sm font-semibold">{t('chosen')}</h3>
          {chosen.length === 0 ? (
            <p className="text-sm text-text-muted">{t('none')}</p>
          ) : (
            <ul data-testid="group-chosen" className="mt-1 flex flex-wrap gap-2 text-sm">
              {chosen.map((person) => {
                const label = personName(person) ?? '';
                return (
                  <li
                    key={person.id}
                    className="flex items-center gap-2 rounded-full bg-surface-muted py-1 pe-1 ps-3"
                  >
                    <span>{label}</span>
                    <button
                      type="button"
                      aria-label={t('removeName', { name: label })}
                      onClick={() =>
                        setChosen((current) => current.filter((x) => x.id !== person.id))
                      }
                      className="grid size-6 place-items-center rounded-full hover:bg-surface"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-sm text-text-muted">{t('note')}</p>
        {error !== null && (
          <Alert tone="error">
            {isApiError(error, 'NOT_FOUND') ? t('noResults') : errorMessage(error, all)}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" pending={pending} disabled={name.trim().length < 2}>
            {t('create')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
