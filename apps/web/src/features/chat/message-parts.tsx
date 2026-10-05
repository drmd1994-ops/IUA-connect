'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-errors';
import {
  MESSAGE_MAX_LENGTH,
  type Message,
  REACTIONS,
  REACTION_EMOJI,
  type Reaction,
  mentionAt,
  messageParts,
} from './chat-model';

const TYPING_EVERY_MS = 3000;
/** The room a message's menu needs below its button. */
const MENU_ROOM_PX = 300;

export interface MenuItem {
  key: string;
  text: string;
  run: () => void;
  danger?: boolean;
}

/** A message's text: web addresses become links, and mentions stand out. */
export function MessageText({ message }: { message: Pick<Message, 'body' | 'mentions'> }) {
  const names = message.mentions
    .map((person) => [person.firstName, person.lastName].filter(Boolean).join(' '))
    .filter(Boolean);
  return (
    <p dir="auto" className="whitespace-pre-wrap break-words">
      {messageParts(message.body, names).map((part, index) =>
        part.kind === 'link' ? (
          <a
            key={index}
            href={part.text}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline"
          >
            {part.text}
          </a>
        ) : part.kind === 'mention' ? (
          <span key={index} data-testid="mention" className="font-semibold text-primary">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

/** The reactions somebody used on a message. Pressing one adds or takes back the reader's. */
export function ReactionChips({
  reactions,
  onToggle,
}: {
  reactions: Message['reactions'];
  onToggle: ((reaction: Reaction, on: boolean) => void) | null;
}) {
  const t = useTranslations('rooms.reactions');
  if (reactions.length === 0) return null;
  return (
    <ul aria-label={t('group')} data-testid="reactions" className="mt-1 flex flex-wrap gap-1">
      {reactions.map(({ reaction, count, mine }) => (
        <li key={reaction}>
          <button
            type="button"
            disabled={!onToggle}
            aria-pressed={mine}
            aria-label={t(mine ? 'yours' : 'count', { name: t(reaction), count })}
            data-reaction={reaction}
            onClick={() => onToggle?.(reaction, !mine)}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm ${
              mine ? 'border-primary bg-brand-50' : 'border-border bg-surface'
            }`}
          >
            <span aria-hidden="true">{REACTION_EMOJI[reaction]}</span>
            <span aria-hidden="true">{count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The actions of one message: a row of reactions, then what this reader may do with this
 * message. The caller lists only what is allowed.
 */
export function MessageMenu({
  mine,
  items,
  onReact,
}: {
  /** The reader's own message: the menu opens toward the middle of the page. */
  mine: boolean;
  items: readonly MenuItem[];
  /** Left out where reacting isn't possible (a deleted message). */
  onReact?: ((reaction: Reaction) => void) | undefined;
}) {
  const t = useTranslations('chat.menu');
  const r = useTranslations('rooms.reactions');
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  return (
    <div
      ref={box}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={t('open')}
        aria-expanded={open}
        onClick={(event) => {
          // Near the end of the list the menu opens upward, so the list doesn't cut it off.
          const log = event.currentTarget.closest('[role="log"]');
          if (log) {
            const below =
              log.getBoundingClientRect().bottom -
              event.currentTarget.getBoundingClientRect().bottom;
            setUpward(below < MENU_ROOM_PX);
          }
          setOpen((value) => !value);
        }}
        className="rounded-md p-1 text-text-muted hover:bg-surface-muted"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          data-testid="message-menu"
          className={`absolute z-20 w-52 rounded-md border border-border bg-surface p-1 shadow-raised ${
            upward ? 'bottom-full mb-1' : 'mt-1'
          } ${mine ? 'end-0' : 'start-0'}`}
        >
          {onReact && (
            <div
              role="group"
              aria-label={r('add')}
              className="flex justify-between gap-0.5 border-b border-border px-1 pb-1"
            >
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  aria-label={r(reaction)}
                  data-reaction={reaction}
                  onClick={() => {
                    setOpen(false);
                    onReact(reaction);
                  }}
                  className="rounded p-1 text-lg hover:bg-surface-muted"
                >
                  <span aria-hidden="true">{REACTION_EMOJI[reaction]}</span>
                </button>
              ))}
            </div>
          )}
          <ul>
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  data-action={item.key}
                  onClick={() => {
                    setOpen(false);
                    item.run();
                  }}
                  className={`block w-full rounded px-3 py-2 text-start text-sm hover:bg-surface-muted ${
                    item.danger ? 'text-danger-700' : ''
                  }`}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface Suggestion {
  id: string;
  name: string;
}

/**
 * The message box: Enter sends, Shift+Enter starts a new line. Used for replies and edits
 * too. In a room, typing "@" and the start of a name offers the people in the room.
 */
export function Composer({
  initial,
  banner,
  saving,
  onCancel,
  onSend,
  onTyping,
  suggest,
  extra,
}: {
  initial: string;
  banner: string | null;
  saving: boolean;
  onCancel: () => void;
  /** The text, and the ids of the people mentioned in it (rooms). */
  onSend: (text: string, mentions: string[]) => Promise<void>;
  onTyping: (() => void) | null;
  /** Rooms: the people whose name starts like this. */
  suggest?: ((q: string) => Promise<Suggestion[]>) | undefined;
  /** Shown under the box (a room's "send as an announcement"). */
  extra?: ReactNode;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.composer');
  const r = useTranslations('rooms.composer');
  const [text, setText] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mentioned, setMentioned] = useState<Suggestion[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const lastTyping = useRef(0);
  const asked = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const left = MESSAGE_MAX_LENGTH - text.length;

  // Editing or replying puts the cursor in the box.
  useEffect(() => {
    if (banner) box.current?.focus();
  }, [banner]);

  async function submit() {
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    try {
      // Only the people whose "@name" is still in the text.
      const ids = mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      await onSend(body, [...new Set(ids)]);
      setText('');
      setMentioned([]);
      setSuggestions([]);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
      box.current?.focus();
    }
  }

  function lookUp(value: string, caret: number) {
    if (!suggest) return;
    const token = mentionAt(value, caret);
    const turn = ++asked.current;
    if (!token) {
      setSuggestions([]);
      return;
    }
    suggest(token.query)
      .then((found) => {
        // A slower, older answer never replaces a newer one.
        if (turn === asked.current) setSuggestions(found.slice(0, 6));
      })
      .catch(() => undefined);
  }

  function choose(person: Suggestion) {
    const caret = box.current?.selectionStart ?? text.length;
    const token = mentionAt(text, caret);
    if (!token) return;
    const next = `${text.slice(0, token.start)}@${person.name} ${text.slice(caret)}`;
    setText(next.slice(0, MESSAGE_MAX_LENGTH));
    setMentioned((current) => [...current.filter((p) => p.id !== person.id), person]);
    setSuggestions([]);
    box.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && suggestions.length > 0) {
      setSuggestions([]);
      return;
    }
    if (event.key === 'Escape' && banner) {
      onCancel();
      return;
    }
    // Enter while composing a character (an input method) belongs to the input method.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (suggestions.length > 0) {
      choose(suggestions[0]!);
      return;
    }
    void submit();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-2"
    >
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {banner && (
        <p className="flex items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-1.5 text-sm">
          <span data-testid="composer-banner">{banner}</span>
          <Button type="button" variant="link" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </p>
      )}
      {suggestions.length > 0 && (
        <ul
          aria-label={r('suggestions')}
          data-testid="mention-suggestions"
          className="flex flex-wrap gap-1 rounded-md border border-border bg-surface p-1"
        >
          {suggestions.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                aria-label={r('mention', { name: person.name })}
                onClick={() => choose(person)}
                className="rounded px-2 py-1 text-sm hover:bg-surface-muted"
              >
                {person.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={text}
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          aria-label={t('label')}
          aria-describedby="composer-hint"
          placeholder={t('placeholder')}
          dir="auto"
          onChange={(event) => {
            setText(event.target.value);
            lookUp(event.target.value, event.target.selectionStart);
            const now = Date.now();
            if (onTyping && event.target.value && now - lastTyping.current > TYPING_EVERY_MS) {
              lastTyping.current = now;
              onTyping();
            }
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 resize-none rounded-md border border-neutral-400 bg-surface px-3 py-2 text-base text-text"
        />
        <Button type="submit" pending={pending} disabled={!text.trim()}>
          {saving ? t('save') : t('send')}
        </Button>
      </div>
      {extra}
      <p id="composer-hint" className="text-xs text-text-muted">
        {t('patientNote')} {t('hint')}
        {suggest && ` ${r('mentionHint')}`}
        {left <= 200 && ` ${t('left', { count: left })}`}
      </p>
    </form>
  );
}
