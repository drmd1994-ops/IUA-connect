'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { type Conversation, type Message, type Room } from './chat-model';
import { Avatar, chatLink, usePersonLabel } from './chat-parts';
import { type MenuItem } from './message-parts';
import { Modal } from './modal';
import { RoomPicture, useRoomText } from './rooms-list';

/**
 * The message a page was asked to open at (`?at=<number>`, from "Go to this message"), or
 * null. While it is set the page shows the messages around it and doesn't follow new ones.
 */
export function useAt(): number | null {
  const value = useSearchParams().get('at');
  return value && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
}

/** Brings the message a page was opened at into view, once it has been loaded. */
export function useJumpTo(
  at: number | null,
  loaded: boolean,
  scroller: RefObject<HTMLDivElement | null>,
): void {
  const jumped = useRef<number | null>(null);
  useEffect(() => {
    if (at === null) {
      jumped.current = null;
      return;
    }
    if (!loaded || jumped.current === at) return;
    const target = scroller.current?.querySelector(`[data-seq="${at}"]`);
    if (!target) return;
    jumped.current = at;
    target.scrollIntoView({ block: 'center' });
  }, [at, loaded, scroller]);
}

/** Shown while a page is opened at an earlier message: the way back to the newest ones. */
export function NewestLink({ href }: { href: string }) {
  const t = useTranslations('groups.search');
  return (
    <p className="border-t border-border bg-surface-muted px-4 py-2 text-center text-sm">
      <Link href={href} className={chatLink} data-testid="newest-link">
        {t('newest')}
      </Link>
    </p>
  );
}

/** The "Forward" line of a message's menu: any message that is not deleted. */
export function forwardItem(message: Message, text: string, run: () => void): MenuItem[] {
  return message.deleted ? [] : [{ key: 'forward', text, run }];
}

type Target = { id: string; name: string } & (
  { kind: 'conversation'; item: Conversation } | { kind: 'room'; item: Room }
);

/**
 * Forwarding a message: the reader picks one of their conversations, groups or rooms, and a
 * copy of the text and its files is sent there. The copy doesn't say whose it was.
 */
export function ForwardDialog({ message, onClose }: { message: Message; onClose: () => void }) {
  const all = useTranslations();
  const t = useTranslations('groups.forward');
  const label = usePersonLabel();
  const text = useRoomText();
  const { api, call } = useAuth();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/chat/conversations', { params: { query: { limit: 50 } } })),
      // Someone without an active membership has no rooms to list.
      call(() => api.GET('/api/v1/chat/rooms/mine', { params: { query: { limit: 50 } } })).catch(
        () => ({ items: [] as Room[] }),
      ),
    ])
      .then(([conversations, rooms]) => {
        if (!active) return;
        setTargets([
          ...conversations.items.map((item): Target => ({
            kind: 'conversation',
            id: item.id,
            name: item.group ? item.group.name : label(item.other),
            item,
          })),
          ...rooms.items
            .filter((item) => !item.archived)
            .map((item): Target => ({ kind: 'room', id: item.id, name: text.name(item), item })),
        ]);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
    // The labels are stable for the life of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, call]);

  async function forward(target: Target) {
    setPending(target.id);
    setError(null);
    setSentTo(null);
    try {
      await call(() =>
        api.POST('/api/v1/chat/messages/{id}/forward', {
          params: { path: { id: message.id } },
          body: { conversationId: target.id },
        }),
      );
      setSentTo(target.name);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  const section = (kind: Target['kind'], title: string) => {
    const items = (targets ?? []).filter((target) => target.kind === kind);
    if (items.length === 0) return null;
    return (
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-text-muted">{title}</h3>
        <ul className="flex flex-col gap-1">
          {items.map((target) => (
            <li key={target.id}>
              <button
                type="button"
                disabled={pending !== null}
                aria-label={t('toName', { name: target.name })}
                onClick={() => void forward(target)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-surface-muted disabled:opacity-60"
              >
                {target.kind === 'room' ? (
                  <RoomPicture room={target.item} name={target.name} size="size-9" />
                ) : target.item.group ? (
                  <GroupMark name={target.name} size="size-9" />
                ) : (
                  <Avatar person={target.item.other} size="size-9" />
                )}
                <span className="min-w-0 flex-1 truncate font-semibold">{target.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <Modal title={t('title')} closeLabel={t('close')} onClose={onClose}>
      <p className="text-sm text-text-muted">{t('intro')}</p>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {sentTo !== null && <Alert tone="success">{t('sent', { name: sentTo })}</Alert>}
      {!targets && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {targets?.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      <div data-testid="forward-targets" className="flex max-h-80 flex-col gap-3 overflow-y-auto">
        {section('conversation', t('conversations'))}
        {section('room', t('rooms'))}
      </div>
    </Modal>
  );
}

/** A group's mark in a list: a rounded square with the first letter of its name. */
export function GroupMark({ name, size = 'size-11' }: { name: string; size?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${size} grid shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-900`}
    >
      {[...name.trim()][0] ?? ''}
    </span>
  );
}
