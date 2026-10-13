'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api-errors';
import { personName } from './chat-model';
import { Avatar, usePersonLabel } from './chat-parts';

type People = components['schemas']['ChatPeopleDto']['items'];
type Sent = components['schemas']['SentInvitationsDto']['items'];

/**
 * Inviting people to a group or to a room by invitation: find someone by name, invite them,
 * and see who was invited and has not answered yet. For whoever may invite there.
 */
export function InvitePanel({
  conversationId,
  kind,
  title,
}: {
  conversationId: string;
  kind: 'groups' | 'rooms';
  title: string;
}) {
  const all = useTranslations();
  const t = useTranslations('groups');
  const label = usePersonLabel();
  const { api, call } = useAuth();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<People | null>(null);
  const [waiting, setWaiting] = useState<Sent | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const path = { id: conversationId };

  const [version, setVersion] = useState(0);
  /** Asks again for the invitations that wait for an answer. */
  const loadWaiting = () => setVersion((value) => value + 1);

  useEffect(() => {
    let active = true;
    const params = { path: { id: conversationId } };
    (kind === 'groups'
      ? call(() => api.GET('/api/v1/chat/groups/{id}/invitations', { params }))
      : call(() => api.GET('/api/v1/chat/rooms/{id}/invitations', { params }))
    )
      .then((result) => active && setWaiting(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, conversationId, kind, version]);

  async function find(event: FormEvent) {
    event.preventDefault();
    const q = search.trim();
    if (q.length < 2) return;
    setPending(true);
    setError(null);
    try {
      const result = await call(() =>
        api.GET('/api/v1/chat/invitable', { params: { query: { q, conversationId } } }),
      );
      setFound(result.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function invite(userId: string) {
    setPending(true);
    setError(null);
    try {
      const body = { userIds: [userId] };
      if (kind === 'groups') {
        await call(() =>
          api.POST('/api/v1/chat/groups/{id}/invitations', { params: { path }, body }),
        );
      } else {
        await call(() =>
          api.POST('/api/v1/chat/rooms/{id}/invitations', { params: { path }, body }),
        );
      }
      setFound((current) => current?.filter((person) => person.id !== userId) ?? null);
      loadWaiting();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function withdraw(invitationId: string) {
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.DELETE('/api/v1/chat/invitations/{id}', { params: { path: { id: invitationId } } }),
      );
      loadWaiting();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-testid="invite-panel" className="flex flex-col gap-3">
      <form onSubmit={find} className="flex items-end gap-3">
        <TextField
          label={title}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" pending={pending}>
          {t('create.searchButton')}
        </Button>
      </form>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {found?.length === 0 && <p className="text-sm text-text-muted">{t('create.noResults')}</p>}
      {found && found.length > 0 && (
        <ul className="flex flex-col gap-1">
          {found.map((person) => {
            const name = personName(person) ?? '';
            return (
              <li key={person.id} className="flex items-center gap-3">
                <Avatar person={{ ...person, listed: true }} size="size-8" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="text-sm"
                  disabled={pending}
                  aria-label={t('create.addName', { name })}
                  onClick={() => void invite(person.id)}
                >
                  {t('create.add')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <h4 className="text-sm font-semibold">{t('details.waiting')}</h4>
        {waiting?.length ? (
          <ul data-testid="waiting-invitations" className="mt-1 flex flex-col gap-1 text-sm">
            {waiting.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{label(item.user)}</span>
                <Button
                  type="button"
                  variant="link"
                  disabled={pending}
                  aria-label={t('details.withdrawName', { name: label(item.user) })}
                  onClick={() => void withdraw(item.id)}
                >
                  {t('details.withdraw')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">{t('details.noWaiting')}</p>
        )}
      </div>
    </div>
  );
}
