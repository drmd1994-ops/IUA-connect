'use client';

import type { components } from '@medconnect/api-client';
import { REACTIONS, REACTION_EMOJI, type Reaction } from '@medconnect/api-client/chat';
import { ApiError } from '@medconnect/api-client';
import { type PatientDetail, findPatientDetails } from '@medconnect/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PersonMark } from '@/features/verification/person-mark';
import { Link, usePathname } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Schemas = components['schemas'];
export type PostSummary = Schemas['PostListDto']['items'][number];
export type Post = Schemas['PostDto'];
export type Author = NonNullable<PostSummary['author']>;
export type Reactions = Post['reactions'];

export const link = 'font-semibold text-primary underline underline-offset-4';

/** The community's name in the page's language. */
export function useCommunityName() {
  const locale = useLocale();
  return (c: { nameHe: string; nameEn: string }) => (locale === 'he' ? c.nameHe : c.nameEn);
}

/** "Name Surname", with the student or resident mark. */
export function AuthorName({ author }: { author: Author | null }) {
  const t = useTranslations('communities.post');
  if (!author) return <span>{t('byGone')}</span>;
  return (
    <span>
      {t('by', { name: `${author.firstName} ${author.lastName}` })}
      {author.mark && (
        <>
          {' '}
          <PersonMark mark={author.mark} />
        </>
      )}
    </span>
  );
}

/** The tabs of the communities section: all of them, the feed, saved posts. */
export function CommunitiesNav() {
  const t = useTranslations('communities.list');
  const pathname = usePathname();
  const tabs = [
    { href: '/communities', label: t('all') },
    { href: '/communities/following', label: t('feed') },
    { href: '/communities/saved', label: t('bookmarks') },
  ];
  return (
    <nav aria-label={t('tabs')} className="border-b border-border">
      <ul className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`inline-block rounded-t-md px-4 py-2 text-sm font-semibold ${
                  current
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A post in a list. */
export function PostCard({
  post,
  showCommunity = false,
}: {
  post: PostSummary;
  showCommunity?: boolean;
}) {
  const t = useTranslations('communities');
  const format = useFormatter();
  const name = useCommunityName();
  const href = `/communities/${post.community.slug}/${post.id}`;
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5">
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <span className="font-semibold text-primary">{t(`kinds.${post.kind}`)}</span>
        {post.answered && (
          <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs font-semibold text-success-700">
            {t('post.answered')}
          </span>
        )}
        {post.locked && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold">
            {t('post.locked')}
          </span>
        )}
        {showCommunity && <span>{name(post.community)}</span>}
      </p>
      <h2 className="text-lg font-semibold" dir="auto">
        {post.removed ? (
          <span className="text-text-muted">
            {post.removed === 'moderator'
              ? t('post.removedByModerator')
              : t('post.deletedByWriter')}
          </span>
        ) : (
          <Link href={href} className={link}>
            {post.title}
          </Link>
        )}
      </h2>
      {post.excerpt && (
        <p className="text-text" dir="auto">
          {post.excerpt}
        </p>
      )}
      <p className="text-sm text-text-muted">
        <AuthorName author={post.author} /> ·{' '}
        <time dateTime={post.createdAt}>
          {format.dateTime(new Date(post.createdAt), { dateStyle: 'medium' })}
        </time>{' '}
        · {t('post.comments', { count: post.commentCount })}
      </p>
    </article>
  );
}

/** The six reactions: those used, and the reader's own to add or take back. */
export function ReactionRow({
  reactions,
  onToggle,
  label,
}: {
  reactions: Reactions;
  onToggle: ((reaction: Reaction, on: boolean) => void) | null;
  label: string;
}) {
  const t = useTranslations('rooms.reactions');
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1" data-testid="reactions">
      {REACTIONS.map((reaction) => {
        const used = reactions.find((r) => r.reaction === reaction);
        const mine = used?.mine ?? false;
        const count = used?.count ?? 0;
        return (
          <li key={reaction}>
            <button
              type="button"
              disabled={!onToggle}
              aria-pressed={mine}
              aria-label={
                count ? t(mine ? 'yours' : 'count', { name: t(reaction), count }) : t(reaction)
              }
              onClick={() => onToggle?.(reaction, !mine)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm disabled:opacity-60 ${
                mine ? 'border-primary bg-brand-50' : 'border-border bg-surface'
              }`}
            >
              <span aria-hidden="true">{REACTION_EMOJI[reaction]}</span>
              {count > 0 && <span aria-hidden="true">{count}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The standing note about patients, and what the check found in the text before it is sent
 * (owner answer §10.4: the server refuses it too).
 */
export function PatientCheck({ found }: { found: readonly PatientDetail[] }) {
  const t = useTranslations('communities.write');
  return (
    <>
      <p className="text-sm text-text-muted">{t('patientNote')}</p>
      {found.length > 0 && (
        <Alert tone="error">
          <p>{t('found')}</p>
          <ul className="mt-2 list-disc ps-5">
            {found.map((detail, index) => (
              <li key={index}>
                {t('foundItem', { text: detail.text, what: t(`what.${detail.kind}`) })}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </>
  );
}

/** What the check finds in some texts, together. */
export function checkTexts(...texts: string[]): PatientDetail[] {
  return texts.flatMap((text) => findPatientDetails(text));
}

/** The server's refusal turned into the same list, when the text got past the page's check. */
export function refusedDetails(error: unknown): PatientDetail[] {
  if (!(error instanceof ApiError)) return [];
  const kinds: Record<string, PatientDetail['kind']> = {
    patientIdNumber: 'idNumber',
    patientPhone: 'phone',
    patientDate: 'date',
    patientRecordNumber: 'recordNumber',
    patientName: 'patientName',
    patientEmail: 'email',
  };
  return error.details.flatMap((detail) =>
    kinds[detail.code] ? [{ kind: kinds[detail.code]!, text: detail.value ?? '' }] : [],
  );
}

/** Reporting a post or a comment to the staff, with chat's reasons. */
export function ReportForm({
  target,
  onDone,
}: {
  target: { postId: string } | { commentId: string };
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { api, call } = useAuth();
  const [categories, setCategories] = useState<{ id: string; nameHe: string; nameEn: string }[]>(
    [],
  );
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/chat/report-categories'))
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, call]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/chat/reports', {
          body: { ...target, categoryId, ...(description.trim() ? { description } : {}) },
        }),
      );
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const p = (key: string) => t(`communities.post.${key}`);
  if (sent) return <Alert tone="success">{p('reported')}</Alert>;
  return (
    <form
      noValidate
      onSubmit={(event) => void send(event)}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <h3 className="font-semibold">{p('reportTitle')}</h3>
      <SelectField
        label={p('reportReason')}
        placeholder=""
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        options={categories.map((c) => ({
          value: c.id,
          label: locale === 'he' ? c.nameHe : c.nameEn,
        }))}
      />
      <TextareaField
        label={p('reportDetails')}
        value={description}
        maxLength={2000}
        rows={2}
        onChange={(event) => setDescription(event.target.value)}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending} disabled={!categoryId}>
          {p('reportSend')}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          {p('cancel')}
        </Button>
      </div>
    </form>
  );
}
