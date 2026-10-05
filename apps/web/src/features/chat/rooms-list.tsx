'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage } from '@/features/content/files';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { ConfirmDialog } from './chat-dialogs';
import { CHAT_CHANGED } from './chat-events';
import { type Room, dayKey } from './chat-model';
import { type Subscribe, chatLink } from './chat-parts';

type Categories = components['schemas']['RoomCategoriesDto']['items'];

/** A room's name and description in the page's language, falling back to Hebrew. */
export function useRoomText() {
  const locale = useLocale();
  return {
    name: (room: { nameHe: string; nameEn: string | null }) =>
      locale === 'he' ? room.nameHe : (room.nameEn ?? room.nameHe),
    description: (room: { descriptionHe: string | null; descriptionEn: string | null }) =>
      (locale === 'he' ? room.descriptionHe : (room.descriptionEn ?? room.descriptionHe)) ?? '',
    category: (category: { nameHe: string; nameEn: string }) =>
      locale === 'he' ? category.nameHe : category.nameEn,
  };
}

/** A room's picture, or a square with the first letter of its name. */
export function RoomPicture({
  room,
  name,
  size = 'size-11',
}: {
  room: { pictureFileId: string | null };
  name: string;
  size?: string;
}) {
  if (room.pictureFileId) {
    return (
      <StoredImage
        fileId={room.pictureFileId}
        variant="thumb"
        alt=""
        placeholder
        className={`${size} shrink-0 rounded-md object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${size} grid shrink-0 place-items-center rounded-md bg-brand-50 text-sm font-semibold text-brand-900`}
    >
      {[...name.trim()][0] ?? ''}
    </span>
  );
}

/** The rooms the reader is in, newest activity first, for the side of the chat page. */
export function RoomList({ current, subscribe }: { current: string | null; subscribe: Subscribe }) {
  const all = useTranslations();
  const t = useTranslations('rooms.list');
  const format = useFormatter();
  const text = useRoomText();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Room[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/chat/rooms/mine'))
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setError(null);
        window.dispatchEvent(new Event(CHAT_CHANGED));
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  // Anything but "is typing" may change the list; several events close together load it once.
  useEffect(() => {
    let timer: number | undefined;
    const stop = subscribe((event) => {
      if (event.type === 'typing') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVersion((value) => value + 1), 300);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [subscribe]);

  async function more() {
    if (!nextCursor) return;
    try {
      const result = await call(() =>
        api.GET('/api/v1/chat/rooms/mine', { params: { query: { cursor: nextCursor } } }),
      );
      setItems((existing) => {
        const known = new Set((existing ?? []).map((item) => item.id));
        return [...(existing ?? []), ...result.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(result.nextCursor);
    } catch (caught) {
      setError(caught);
    }
  }

  const today = dayKey(new Date().toISOString());
  const when = (iso: string) =>
    format.dateTime(
      new Date(iso),
      dayKey(iso) === today ? { timeStyle: 'short' } : { dateStyle: 'short' },
    );

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <h1 className="text-2xl font-semibold text-brand-900">{t('title')}</h1>
        <div>
          <Link
            href="/chat/rooms/browse"
            className="inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            {t('browse')}
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error !== null && (
          <div className="p-4">
            <Alert tone="error">{errorMessage(error, all)}</Alert>
          </div>
        )}
        {!items && error === null && (
          <p role="status" className="p-4">
            {all('membership.common.loading')}
          </p>
        )}
        {items?.length === 0 && <p className="p-4 text-text-muted">{t('empty')}</p>}
        {items && items.length > 0 && (
          <ul data-testid="room-list" className="divide-y divide-border">
            {items.map((item) => {
              const name = text.name(item);
              const unread = item.unreadCount > 0 || item.markedUnread;
              return (
                <li key={item.id}>
                  <Link
                    href={`/chat/rooms/${item.id}`}
                    aria-current={item.id === current ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-muted ${
                      item.id === current ? 'bg-brand-50' : ''
                    }`}
                  >
                    <RoomPicture room={item} name={name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate ${unread ? 'font-semibold' : ''}`}>{name}</span>
                        {item.lastMessageAt && (
                          <span className="shrink-0 text-xs text-text-muted">
                            {when(item.lastMessageAt)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-text-muted">
                          {t('members', { count: item.memberCount })}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
                          {item.archived && <span>{t('archived')}</span>}
                          {item.locked && <span>{t('locked')}</span>}
                          {item.muted && <span>{t('muted')}</span>}
                          {item.unreadCount > 0 ? (
                            <span
                              data-testid="unread-count"
                              className="grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold leading-5 text-on-primary"
                            >
                              <span aria-hidden="true">
                                {item.unreadCount > 99 ? '99+' : item.unreadCount}
                              </span>
                              <span className="sr-only">
                                {t('unread', { count: item.unreadCount })}
                              </span>
                            </span>
                          ) : (
                            item.markedUnread && (
                              <span className="size-2.5 rounded-full bg-primary">
                                <span className="sr-only">{t('markedUnread')}</span>
                              </span>
                            )
                          )}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {nextCursor && (
          <div className="p-4">
            <Button type="button" variant="link" onClick={() => void more()}>
              {t('more')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/** Every open room: search, filter by category, join. */
export function BrowseRooms() {
  const all = useTranslations();
  const t = useTranslations('rooms.browse');
  const j = useTranslations('rooms.join');
  const l = useTranslations('rooms.list');
  const text = useRoomText();
  const router = useRouter();
  const { api, call } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Categories>([]);
  const [items, setItems] = useState<Room[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [joining, setJoining] = useState<Room | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/chat/room-categories'))
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/chat/rooms', {
        params: { query: { ...(q ? { q } : {}), ...(categoryId ? { categoryId } : {}) } },
      }),
    )
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, q, categoryId]);

  async function more() {
    if (!nextCursor) return;
    try {
      const result = await call(() =>
        api.GET('/api/v1/chat/rooms', {
          params: {
            query: {
              cursor: nextCursor,
              ...(q ? { q } : {}),
              ...(categoryId ? { categoryId } : {}),
            },
          },
        }),
      );
      setItems((existing) => [...(existing ?? []), ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (caught) {
      setError(caught);
    }
  }

  function find(event: FormEvent) {
    event.preventDefault();
    setQ(search.trim().length >= 2 ? search.trim() : '');
  }

  if (error !== null && isApiError(error, 'FORBIDDEN')) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold text-brand-900">{t('title')}</h1>
        <Alert>{t('membersOnly')}</Alert>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      data-testid="browse-rooms"
    >
      <div>
        <Link href="/chat/rooms" className={`${chatLink} text-sm md:hidden`}>
          {t('back')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-brand-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('intro')}</p>
      </div>
      <form
        role="search"
        aria-label={t('title')}
        onSubmit={find}
        className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      >
        <TextField
          label={t('search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
        />
        <SelectField
          label={t('category')}
          placeholder={t('allCategories')}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={categories.map((c) => ({ value: c.id, label: text.category(c) }))}
        />
        <div>
          <Button type="submit">{t('searchButton')}</Button>
        </div>
      </form>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {!items && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {items?.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      {items && items.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const name = text.name(item);
            const description = text.description(item);
            return (
              <li
                key={item.id}
                data-testid="room-card"
                className="flex gap-3 rounded-md border border-border bg-surface p-3"
              >
                <RoomPicture room={item} name={name} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate text-lg font-semibold">{name}</h2>
                  {description && (
                    <p dir="auto" className="text-sm text-text-muted">
                      {description}
                    </p>
                  )}
                  <p className="text-xs text-text-muted">
                    {[
                      item.category ? text.category(item.category) : null,
                      l('members', { count: item.memberCount }),
                      item.moderatorsOnly ? t('announcements') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-1">
                    {item.role === 'NONE' ? (
                      <Button
                        type="button"
                        className="text-sm"
                        aria-label={t('joinName', { name })}
                        onClick={() => setJoining(item)}
                      >
                        {t('join')}
                      </Button>
                    ) : (
                      <Link
                        href={`/chat/rooms/${item.id}`}
                        aria-label={t('openName', { name })}
                        className={`${chatLink} text-sm`}
                      >
                        {t('open')}
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {nextCursor && (
        <div>
          <Button type="button" variant="link" onClick={() => void more()}>
            {l('more')}
          </Button>
        </div>
      )}
      {joining && (
        <ConfirmDialog
          title={j('title', { name: text.name(joining) })}
          confirmLabel={j('confirm')}
          tone="primary"
          onClose={() => setJoining(null)}
          onConfirm={async () => {
            await call(() =>
              api.POST('/api/v1/chat/rooms/{id}/join', { params: { path: { id: joining.id } } }),
            );
            router.push(`/chat/rooms/${joining.id}`);
          }}
        >
          {j('text')}
        </ConfirmDialog>
      )}
    </div>
  );
}
