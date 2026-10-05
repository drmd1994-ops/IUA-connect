'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage, type UploadedFile, formatSize, useFileUrl } from '@/features/content/files';
import { errorMessage, hasErrorDetail } from '@/lib/api-errors';
import {
  type Activity,
  type Attachment,
  MESSAGE_MAX_LENGTH,
  type Message,
  REACTIONS,
  REACTION_EMOJI,
  type Reaction,
  canAttach,
  mentionAt,
  messageParts,
} from './chat-model';
import { Modal } from './modal';

const TYPING_EVERY_MS = 3000;
/** The room a message's menu needs below its button. */
const MENU_ROOM_PX = 300;

export interface MenuItem {
  key: string;
  text: string;
  run: () => void;
  danger?: boolean;
}

/**
 * A message's text and files: web addresses become links, mentions stand out, a forwarded
 * message says so, and pictures, PDF and video follow the text.
 */
export function MessageText({
  message,
}: {
  message: Pick<Message, 'body' | 'mentions' | 'forwarded' | 'attachments'>;
}) {
  const f = useTranslations('groups.forward');
  return (
    <>
      {message.forwarded && (
        <p data-testid="forwarded" className="text-xs italic text-text-muted">
          {f('forwarded')}
        </p>
      )}
      {message.body && <MessageBody message={message} />}
      <Attachments files={message.attachments} />
    </>
  );
}

function MessageBody({ message }: { message: Pick<Message, 'body' | 'mentions'> }) {
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

/** The files of a message: a picture opens large, a PDF downloads, a video plays in place. */
export function Attachments({ files }: { files: readonly Attachment[] }) {
  if (files.length === 0) return null;
  return (
    <ul data-testid="attachments" className="mt-1 flex flex-col gap-2">
      {files.map((file) => (
        <li key={file.id}>
          {file.kind === 'IMAGE' ? (
            <Picture file={file} />
          ) : file.kind === 'VIDEO' ? (
            <Video file={file} />
          ) : (
            <Document file={file} />
          )}
        </li>
      ))}
    </ul>
  );
}

function Picture({ file }: { file: Attachment }) {
  const t = useTranslations('groups.files');
  const [open, setOpen] = useState(false);
  // The box has the picture's shape before it arrives, so the list doesn't jump.
  const ratio = file.width && file.height ? `${file.width} / ${file.height}` : '4 / 3';
  return (
    <>
      <button
        type="button"
        aria-label={t('openName', { name: file.name })}
        onClick={() => setOpen(true)}
        className="block w-56 max-w-full overflow-hidden rounded-md border border-border"
        style={{ aspectRatio: ratio }}
      >
        <StoredImage
          fileId={file.id}
          variant="thumb"
          alt=""
          placeholder
          className="size-full object-cover"
        />
      </button>
      {open && (
        <Modal title={file.name} closeLabel={t('close')} onClose={() => setOpen(false)}>
          <StoredImage
            fileId={file.id}
            alt={t('pictureAlt', { name: file.name })}
            placeholder
            className="max-h-[70dvh] w-full object-contain"
          />
        </Modal>
      )}
    </>
  );
}

function Video({ file }: { file: Attachment }) {
  const t = useTranslations('groups.files');
  const locale = useLocale();
  const url = useFileUrl(file.id);
  return (
    <figure className="flex flex-col gap-1">
      {url ? (
        // The browser's own player; it asks for the video in parts. No captions exist for a
        // video a member filmed.
        <video
          controls
          preload="metadata"
          src={url}
          aria-label={t('videoName', { name: file.name })}
          className="max-h-80 w-72 max-w-full rounded-md border border-border bg-neutral-900"
        />
      ) : (
        <div aria-hidden="true" className="h-40 w-72 max-w-full rounded-md bg-surface-muted" />
      )}
      <figcaption dir="auto" className="text-xs text-text-muted">
        {file.name}
        {' · '}
        {formatSize(file.sizeBytes, locale)}
      </figcaption>
    </figure>
  );
}

function Document({ file }: { file: Attachment }) {
  const t = useTranslations('groups.files');
  const locale = useLocale();
  const url = useFileUrl(file.id);
  const label = (
    <span dir="auto">
      {file.name}
      {' · '}
      {formatSize(file.sizeBytes, locale)}
    </span>
  );
  return url ? (
    <a
      href={url}
      aria-label={t('downloadName', { name: file.name })}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-primary underline"
    >
      {label}
    </a>
  ) : (
    <span className="inline-flex rounded-md border border-border px-3 py-2 text-sm text-text-muted">
      {label}
    </span>
  );
}

/** A dot beside a person who is active now, with a text for everyone; otherwise the text alone. */
export function ActivityMark({ activity }: { activity: Activity | undefined }) {
  const t = useTranslations('groups.activity');
  if (!activity) return null;
  return (
    <span
      data-testid="activity"
      data-activity={activity}
      className="inline-flex items-center gap-1 text-xs text-text-muted"
    >
      {activity === 'online' && (
        <span aria-hidden="true" className="size-2 rounded-full bg-success-700" />
      )}
      {t(activity)}
    </span>
  );
}

/**
 * What the reader may know about when these people were last around, kept current by the
 * page's events. Empty for people who don't show it, and when the reader doesn't show theirs.
 */
export function useActivity(
  userIds: readonly string[],
  subscribe: (listener: (event: { type: string; userId?: string }) => void) => () => void,
): Map<string, Activity> {
  const { api, call } = useAuth();
  const [known, setKnown] = useState<Map<string, Activity>>(new Map());
  const [version, setVersion] = useState(0);
  const key = [...new Set(userIds)].sort().join(',');

  useEffect(() => {
    if (!key) return;
    let active = true;
    call(() => api.GET('/api/v1/chat/activity', { params: { query: { userIds: key } } }))
      .then((result) => {
        if (active) setKnown(new Map(result.items.map((item) => [item.userId, item.activity])));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call, key, version]);

  useEffect(() => {
    if (!key) return;
    const ids = new Set(key.split(','));
    return subscribe((event) => {
      if (event.type === 'refresh' || (event.type === 'activity' && ids.has(event.userId ?? ''))) {
        setVersion((value) => value + 1);
      }
    });
  }, [subscribe, key]);

  return key ? known : EMPTY_ACTIVITY;
}
const EMPTY_ACTIVITY = new Map<string, Activity>();

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
  attach = false,
}: {
  initial: string;
  banner: string | null;
  saving: boolean;
  onCancel: () => void;
  /** The text, the ids of the people mentioned in it (rooms), and the files to send with it. */
  onSend: (text: string, mentions: string[], attachmentIds: string[]) => Promise<void>;
  /** Files can be sent with the message (not while editing one). */
  attach?: boolean;
  onTyping: (() => void) | null;
  /** Rooms: the people whose name starts like this. */
  suggest?: ((q: string) => Promise<Suggestion[]>) | undefined;
  /** Shown under the box (a room's "send as an announcement"). */
  extra?: ReactNode;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.composer');
  const r = useTranslations('rooms.composer');
  const f = useTranslations('groups.files');
  const { api, call } = useAuth();
  const fileId = useId();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
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

  async function addFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(file.name);
    try {
      const stored = await call(() =>
        api.POST('/api/v1/chat/attachments', {
          body: { file: '' },
          bodySerializer: () => {
            const form = new FormData();
            form.append('file', file);
            return form;
          },
        }),
      );
      setFiles((current) => (canAttach(current, stored.kind) ? [...current, stored] : current));
      if (!canAttach(files, stored.kind)) setError(new Error('tooMany'));
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    const body = text.trim();
    if ((!body && files.length === 0) || pending || uploading) return;
    setPending(true);
    setError(null);
    try {
      // Only the people whose "@name" is still in the text.
      const ids = mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      await onSend(
        body,
        [...new Set(ids)],
        files.map((file) => file.id),
      );
      setText('');
      setFiles([]);
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
      {error !== null && (
        <Alert tone="error">
          {error instanceof Error && error.message === 'tooMany'
            ? f('tooMany')
            : hasErrorDetail(error, 'fileTypeNotAllowed')
              ? f('typeNotAllowed')
              : errorMessage(error, all)}
        </Alert>
      )}
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
        <Button
          type="submit"
          pending={pending}
          disabled={(!text.trim() && files.length === 0) || uploading !== null}
        >
          {saving ? t('save') : t('send')}
        </Button>
      </div>
      {attach && (
        <div className="flex flex-col gap-1.5 text-sm">
          {files.length > 0 && (
            <ul
              aria-label={f('chosen')}
              data-testid="chosen-files"
              className="flex flex-wrap gap-2"
            >
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-2 rounded-full bg-surface-muted py-1 pe-1 ps-3"
                >
                  <span dir="auto" className="max-w-40 truncate">
                    {file.originalName}
                  </span>
                  <button
                    type="button"
                    aria-label={f('removeName', { name: file.originalName })}
                    onClick={() => setFiles((current) => current.filter((x) => x.id !== file.id))}
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
              ))}
            </ul>
          )}
          {uploading && <p role="status">{f('uploading', { name: uploading })}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={fileId} className="font-semibold">
              {f('attach')}
            </label>
            <input
              id={fileId}
              type="file"
              accept="image/jpeg,image/png,application/pdf,video/mp4"
              aria-describedby={`${fileId}-hint`}
              disabled={uploading !== null || files.length >= 3}
              onChange={(event) => void addFile(event)}
              className="max-w-full text-sm"
            />
          </div>
          <p id={`${fileId}-hint`} className="text-xs text-text-muted">
            {f('patientNote')} {f('hint')} {f('videoNote')}
          </p>
        </div>
      )}
      {extra}
      <p id="composer-hint" className="text-xs text-text-muted">
        {t('patientNote')} {t('hint')}
        {suggest && ` ${r('mentionHint')}`}
        {left <= 200 && ` ${t('left', { count: left })}`}
      </p>
    </form>
  );
}
