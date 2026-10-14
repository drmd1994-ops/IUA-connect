'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { conversationPath, personName } from './chat-model';
import { Avatar, chatLink, usePersonLabel } from './chat-parts';
import { Modal } from './modal';

type People = components['schemas']['ChatPeopleDto']['items'];
type Found = components['schemas']['MessageSearchDto']['items'];
type Categories = components['schemas']['ReportCategoriesDto']['items'];

/** Opens the conversation with a person (creating it when there is none) and goes to it. */
export function useStartConversation() {
  const { api, call } = useAuth();
  const router = useRouter();
  return async (userId: string) => {
    const conversation = await call(() =>
      api.POST('/api/v1/chat/conversations', { body: { userId } }),
    );
    router.push(`/chat/${conversation.id}`);
  };
}

/** Finding someone to write to: listed members who accept messages, by name. */
export function NewConversationDialog({ onClose }: { onClose: () => void }) {
  const all = useTranslations();
  const t = useTranslations('chat.start');
  const { api, call } = useAuth();
  const start = useStartConversation();
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<People | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function find(event: FormEvent) {
    event.preventDefault();
    const q = search.trim();
    if (q.length < 2) return;
    setPending(true);
    setError(null);
    try {
      const result = await call(() => api.GET('/api/v1/chat/people', { params: { query: { q } } }));
      setPeople(result.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function write(userId: string) {
    setError(null);
    try {
      await start(userId);
      onClose();
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <Modal title={t('title')} closeLabel={t('close')} onClose={onClose}>
      <p className="text-sm text-text-muted">{t('intro')}</p>
      <form role="search" onSubmit={find} className="flex items-end gap-3">
        <TextField
          label={t('search')}
          hint={t('hint')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          className="flex-1"
        />
        <Button type="submit" pending={pending}>
          {t('searchButton')}
        </Button>
      </form>
      {error !== null && (
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? t('unavailable') : errorMessage(error, all)}
        </Alert>
      )}
      {people?.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      {people && people.length > 0 && (
        <ul data-testid="chat-people" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {people.map((person) => {
            const name = personName(person) ?? '';
            return (
              <li key={person.id}>
                <button
                  type="button"
                  aria-label={t('write', { name })}
                  onClick={() => void write(person.id)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-surface-muted"
                >
                  <Avatar person={{ ...person, listed: true, mark: null }} size="size-9" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{name}</span>
                    {person.title && (
                      <span className="block truncate text-sm text-text-muted">{person.title}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/** Searching the reader's messages: in one conversation, or in all of them. */
export function MessageSearchDialog({
  conversationId,
  onClose,
}: {
  conversationId?: string;
  onClose: () => void;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.search');
  const c = useTranslations('chat.conversation');
  const g = useTranslations('groups.search');
  const locale = useLocale();
  const format = useFormatter();
  const label = usePersonLabel();
  const { api, call, me } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function find(event: FormEvent) {
    event.preventDefault();
    const q = search.trim();
    if (q.length < 2) return;
    setPending(true);
    setError(null);
    try {
      const result = await call(() =>
        api.GET('/api/v1/chat/search', {
          params: {
            query: {
              q,
              ...(conversationId ? { conversationId } : {}),
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
              ...(mine && me ? { senderId: me.id } : {}),
            },
          },
        }),
      );
      setFound(result.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={t('title')} closeLabel={t('close')} onClose={onClose}>
      <form role="search" onSubmit={find} className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <TextField
            label={t('label')}
            hint={t('hint')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            className="flex-1"
          />
          <Button type="submit" pending={pending}>
            {t('button')}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={g('from')}
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <TextField
            label={g('to')}
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={mine}
            onChange={(event) => setMine(event.target.checked)}
          />
          <span>{g('mine')}</span>
        </label>
      </form>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {found?.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      {found && found.length > 0 && (
        <ul
          data-testid="chat-search-results"
          className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto"
        >
          {found.map(({ message, other, room, group }) => (
            <li key={message.id} className="flex flex-col gap-1 py-3">
              <span className="text-xs text-text-muted">
                {message.mine ? c('you') : label(room || group ? message.sender : other)}
                {' · '}
                {format.dateTime(new Date(message.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {!conversationId && (
                  <>
                    {' · '}
                    {room
                      ? locale === 'he'
                        ? room.nameHe
                        : (room.nameEn ?? room.nameHe)
                      : group
                        ? g('inGroup', { name: group.name })
                        : t('with', { name: label(other) })}
                  </>
                )}
              </span>
              <span dir="auto" className="whitespace-pre-wrap break-words">
                {message.body || g('filesOnly')}
              </span>
              <Link
                href={`${conversationPath(
                  room ? 'ROOM' : group ? 'GROUP' : 'DIRECT',
                  message.conversationId,
                )}?at=${message.seq}`}
                onClick={onClose}
                className={`${chatLink} text-sm`}
              >
                {g('goTo')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Reporting a message, or a person, to the association's staff. */
export function ReportDialog({
  target,
  name,
  onClose,
}: {
  target: { messageId: string } | { userId: string } | { roomId: string };
  /** The person's name, or the room's. */
  name: string;
  onClose: () => void;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.report');
  const rooms = useTranslations('rooms.report');
  const locale = useLocale();
  const { api, call } = useAuth();
  const [categories, setCategories] = useState<Categories | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const aboutMessage = 'messageId' in target;
  const aboutRoom = 'roomId' in target;

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/chat/report-categories'))
      .then((result) => active && setCategories(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!categoryId) return;
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/chat/reports', {
          body: {
            ...target,
            categoryId,
            ...(description.trim() ? { description: description.trim() } : {}),
          },
        }),
      );
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      title={
        aboutMessage
          ? t('titleMessage')
          : aboutRoom
            ? rooms('title', { name })
            : t('titlePerson', { name })
      }
      closeLabel={t('close')}
      onClose={onClose}
    >
      {sent ? (
        <>
          <Alert tone="success">{t('sent')}</Alert>
          <div>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={send} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            {aboutMessage ? t('introMessage') : aboutRoom ? rooms('intro') : t('introPerson')}
          </p>
          <SelectField
            label={t('category')}
            placeholder={t('choose')}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={(categories ?? []).map((category) => ({
              value: category.id,
              label: locale === 'he' ? category.nameHe : category.nameEn,
            }))}
          />
          <TextareaField
            label={t('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={3}
          />
          {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={pending} disabled={!categoryId}>
              {t('send')}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** A question with one answer that can't be undone, and a way out. */
export function ConfirmDialog({
  title,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  confirmLabel: string;
  /** "danger" for something that can't be undone; "primary" for an ordinary yes. */
  tone?: 'danger' | 'primary';
  onConfirm: () => Promise<void>;
  onClose: () => void;
  children: ReactNode;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.confirm');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <Modal title={title} closeLabel={t('cancel')} onClose={onClose}>
      <p>{children}</p>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant={tone} pending={pending} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
      </div>
    </Modal>
  );
}
