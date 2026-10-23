'use client';

import { type Reaction } from '@medconnect/api-client/chat';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { type ApiResult, useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Attachments } from '@/features/chat/message-parts';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { CommunitiesFrame } from './communities-home';
import {
  AuthorName,
  PatientCheck,
  type Post,
  ReactionRow,
  ReportForm,
  checkTexts,
  link,
  refusedDetails,
  useCommunityName,
} from './community-parts';

type Comment = Post['comments'][number];

/** One post with its comments (M25). */
export function PostPage({ slug, id }: { slug: string; id: string }) {
  return (
    <CommunitiesFrame>
      <View slug={slug} id={id} />
    </CommunitiesFrame>
  );
}

function View({ slug, id }: { slug: string; id: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const name = useCommunityName();
  const router = useRouter();
  const { api, call } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const path = { params: { path: { id } } };

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/posts/{id}', { params: { path: { id } } }))
      .then((result) => active && setPost(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  /** Runs a change that answers with the post as it is now. */
  async function act(work: () => Promise<ApiResult<Post>>) {
    setPending(true);
    setError(null);
    try {
      setPost(await call(work));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function toggle(kind: 'bookmark' | 'follow', on: boolean) {
    if (!post) return;
    setPending(true);
    try {
      if (kind === 'bookmark') {
        await call(() =>
          on
            ? api.PUT('/api/v1/posts/{id}/bookmark', path)
            : api.DELETE('/api/v1/posts/{id}/bookmark', path),
        );
        setPost({ ...post, bookmarked: on });
      } else {
        await call(() =>
          on
            ? api.PUT('/api/v1/posts/{id}/follow', path)
            : api.DELETE('/api/v1/posts/{id}/follow', path),
        );
        setPost({ ...post, following: on });
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const p = (key: string) => t(`communities.post.${key}`);
  const back = (
    <Link href={`/communities/${slug}`} className={link}>
      {post ? name(post.community) : t('communities.community.back')}
    </Link>
  );
  if (error !== null && !post) {
    return (
      <PageFrame>
        {back}
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND')
            ? t('content.common.notFoundTitle')
            : errorMessage(error, t)}
        </Alert>
      </PageFrame>
    );
  }
  if (!post) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }
  const react = (reaction: Reaction, on: boolean) =>
    void act(() =>
      on
        ? api.PUT('/api/v1/posts/{id}/reactions/{reaction}', {
            params: { path: { id, reaction } },
          })
        : api.DELETE('/api/v1/posts/{id}/reactions/{reaction}', {
            params: { path: { id, reaction } },
          }),
    );
  const isQuestion = post.kind === 'QUESTION';
  const top = post.comments.filter((c) => c.parentId === null);
  const repliesOf = (commentId: string) => post.comments.filter((c) => c.parentId === commentId);

  return (
    <PageFrame>
      {back}
      <article className="flex flex-col gap-4" aria-labelledby="post-title">
        <header className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-primary">
              {t(`communities.kinds.${post.kind}`)}
            </span>
            {post.answered && (
              <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs font-semibold text-success-700">
                {p('answered')}
              </span>
            )}
            {post.locked && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold">
                {p('locked')}
              </span>
            )}
          </p>
          {post.removed ? (
            <h1 id="post-title" className="text-2xl font-semibold text-text-muted">
              {post.removed === 'author'
                ? p('deletedByWriter')
                : post.removedReason
                  ? t('communities.post.removedReason', { reason: post.removedReason })
                  : p('removedByModerator')}
            </h1>
          ) : (
            <h1 id="post-title" className="text-3xl font-semibold text-brand-900" dir="auto">
              {post.title}
            </h1>
          )}
          <p className="text-sm text-text-muted">
            <AuthorName author={post.author} /> ·{' '}
            <time dateTime={post.createdAt}>
              {format.dateTime(new Date(post.createdAt), { dateStyle: 'long', timeStyle: 'short' })}
            </time>
            {post.edited && ` · ${p('edited')}`}
          </p>
        </header>
        {!post.removed &&
          (editing ? (
            <EditPost
              post={post}
              onDone={(next) => {
                if (next) setPost(next);
                setEditing(false);
              }}
            />
          ) : (
            <p className="whitespace-pre-line text-text" dir="auto" data-testid="post-body">
              {post.body}
            </p>
          ))}
        {post.files.length > 0 && (
          <Attachments
            files={post.files.map(({ originalName, createdAt: _, ...file }) => ({
              ...file,
              name: originalName,
            }))}
          />
        )}
        {!post.removed && (
          <ReactionRow
            reactions={post.reactions}
            label={t('rooms.reactions.group')}
            onToggle={post.canComment || post.canModerate ? react : null}
          />
        )}
        {!post.removed && (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              aria-pressed={post.bookmarked}
              onClick={() => void toggle('bookmark', !post.bookmarked)}
            >
              {post.bookmarked ? p('unbookmark') : p('bookmark')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              aria-pressed={post.following}
              onClick={() => void toggle('follow', !post.following)}
            >
              {post.following ? p('unfollowPost') : p('followPost')}
            </Button>
            {post.canEdit && !editing && (
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                {p('edit')}
              </Button>
            )}
            {post.canEdit && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(p('deleteConfirm'))) return;
                  void call(() => api.DELETE('/api/v1/posts/{id}', path)).then(
                    () => router.push(`/communities/${slug}`),
                    (caught: unknown) => setError(caught),
                  );
                }}
              >
                {p('delete')}
              </Button>
            )}
            {!post.canEdit && post.author && (
              <Button type="button" variant="link" onClick={() => setReporting(true)}>
                {p('report')}
              </Button>
            )}
          </div>
        )}
        {reporting && (
          <ReportForm target={{ postId: post.id }} onDone={() => setReporting(false)} />
        )}
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {post.canModerate && !post.removed && (
          <Moderation
            onRemove={(reason) =>
              void act(() => api.POST('/api/v1/posts/{id}/remove', { ...path, body: { reason } }))
            }
            locked={post.locked}
            onLock={(locked) =>
              void act(() =>
                locked
                  ? api.POST('/api/v1/posts/{id}/lock', path)
                  : api.POST('/api/v1/posts/{id}/unlock', path),
              )
            }
            slug={slug}
            author={post.author}
          />
        )}
      </article>

      {!post.removed && (
        <section aria-labelledby="post-comments" className="flex flex-col gap-4">
          <h2 id="post-comments" className="text-xl font-semibold">
            {t('communities.post.comments', { count: post.commentCount })}
          </h2>
          <ol className="flex flex-col gap-4" data-testid="comments">
            {top.map((comment) => (
              <li key={comment.id} className="flex flex-col gap-3">
                <CommentItem
                  comment={comment}
                  post={post}
                  answerable={isQuestion}
                  onChange={setPost}
                />
                {repliesOf(comment.id).length > 0 && (
                  <ol className="flex flex-col gap-3 border-s-2 border-border ps-4">
                    {repliesOf(comment.id).map((reply) => (
                      <li key={reply.id}>
                        <CommentItem
                          comment={reply}
                          post={post}
                          answerable={isQuestion}
                          onChange={setPost}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
          {post.locked && <Alert>{p('lockedNote')}</Alert>}
          {post.canComment && <CommentForm postId={post.id} onSent={setPost} />}
        </section>
      )}
    </PageFrame>
  );
}

function EditPost({ post, onDone }: { post: Post; onDone: (post: Post | null) => void }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [title, setTitle] = useState(post.title ?? '');
  const [body, setBody] = useState(post.body);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const found = checkTexts(title, body);
  const [refused, setRefused] = useState<ReturnType<typeof refusedDetails>>([]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (found.length) return;
    setPending(true);
    setError(null);
    try {
      onDone(
        await call(() =>
          api.PATCH('/api/v1/posts/{id}', {
            params: { path: { id: post.id } },
            body: { title: title.trim(), body: body.trim() },
          }),
        ),
      );
    } catch (caught) {
      const details = refusedDetails(caught);
      if (details.length) setRefused(details);
      else setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
      <TextField
        label={t('communities.write.titleLabel')}
        value={title}
        maxLength={200}
        dir="auto"
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextareaField
        label={t('communities.write.body')}
        value={body}
        maxLength={10000}
        rows={6}
        dir="auto"
        onChange={(event) => setBody(event.target.value)}
      />
      <PatientCheck found={found.length ? found : refused} />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" pending={pending} disabled={found.length > 0}>
          {t('communities.post.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone(null)}>
          {t('communities.post.cancel')}
        </Button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  post,
  answerable,
  onChange,
}: {
  comment: Comment;
  post: Post;
  answerable: boolean;
  onChange: (post: Post) => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const { api, call, me } = useAuth();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const p = (key: string) => t(`communities.post.${key}`);
  const id = comment.id;

  async function act(work: () => Promise<ApiResult<Post>>) {
    setError(null);
    try {
      onChange(await call(work));
    } catch (caught) {
      setError(caught);
    }
  }

  if (comment.removed) {
    return (
      <p className="rounded-md bg-surface-muted p-3 text-sm text-text-muted">
        {comment.removed === 'author'
          ? p('deletedByWriter')
          : comment.removedReason
            ? t('communities.post.removedReason', { reason: comment.removedReason })
            : p('removedByModerator')}
      </p>
    );
  }
  const authorName = comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : '';
  const questionWriter = answerable && post.author?.id === me?.id;
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 ${comment.isAnswer ? 'border-success-700' : 'border-border'}`}
      data-testid="comment"
    >
      <p className="text-sm text-text-muted">
        <AuthorName author={comment.author} /> ·{' '}
        <time dateTime={comment.createdAt}>
          {format.dateTime(new Date(comment.createdAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </time>
        {comment.edited && ` · ${p('edited')}`}
        {comment.isAnswer && (
          <span className="ms-2 rounded-full bg-success-100 px-2 py-0.5 text-xs font-semibold text-success-700">
            {p('theAnswer')}
          </span>
        )}
      </p>
      {editing ? (
        <CommentForm
          postId={post.id}
          editing={comment}
          onSent={(next) => {
            onChange(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="whitespace-pre-line" dir="auto">
          {comment.body}
        </p>
      )}
      <ReactionRow
        reactions={comment.reactions}
        label={t('rooms.reactions.group')}
        onToggle={
          post.canComment || post.canModerate
            ? (reaction, on) =>
                void act(() =>
                  on
                    ? api.PUT('/api/v1/post-comments/{id}/reactions/{reaction}', {
                        params: { path: { id, reaction } },
                      })
                    : api.DELETE('/api/v1/post-comments/{id}/reactions/{reaction}', {
                        params: { path: { id, reaction } },
                      }),
                )
            : null
        }
      />
      <div className="flex flex-wrap gap-3">
        {post.canComment && comment.parentId === null && (
          <Button type="button" variant="link" onClick={() => setReplying((v) => !v)}>
            {t('communities.post.replyTo', { name: authorName })}
          </Button>
        )}
        {questionWriter && (
          <Button
            type="button"
            variant="link"
            onClick={() =>
              void act(() =>
                api.PUT('/api/v1/posts/{id}/answer', {
                  params: { path: { id: post.id } },
                  body: { commentId: comment.isAnswer ? null : comment.id },
                }),
              )
            }
          >
            {comment.isAnswer ? p('unmarkAnswer') : p('markAnswer')}
          </Button>
        )}
        {comment.canEdit && !editing && (
          <Button type="button" variant="link" onClick={() => setEditing(true)}>
            {p('edit')}
          </Button>
        )}
        {comment.author?.id === me?.id && (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              if (!window.confirm(p('deleteConfirm'))) return;
              void act(() =>
                api.DELETE('/api/v1/post-comments/{id}', { params: { path: { id } } }),
              );
            }}
          >
            {p('delete')}
          </Button>
        )}
        {comment.author && comment.author.id !== me?.id && (
          <Button type="button" variant="link" onClick={() => setReporting(true)}>
            {p('report')}
          </Button>
        )}
        {post.canModerate && (
          <RemoveButton
            onRemove={(reason) =>
              void act(() =>
                api.POST('/api/v1/post-comments/{id}/remove', {
                  params: { path: { id } },
                  body: { reason },
                }),
              )
            }
          />
        )}
      </div>
      {reporting && (
        <ReportForm target={{ commentId: comment.id }} onDone={() => setReporting(false)} />
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {replying && (
        <CommentForm
          postId={post.id}
          parentId={comment.id}
          onSent={(next) => {
            onChange(next);
            setReplying(false);
          }}
          onCancel={() => setReplying(false)}
        />
      )}
    </div>
  );
}

/** A new comment, a reply, or a change to one's own comment. */
function CommentForm({
  postId,
  parentId,
  editing,
  onSent,
  onCancel,
}: {
  postId: string;
  parentId?: string;
  editing?: Comment;
  onSent: (post: Post) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [body, setBody] = useState(editing?.body ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const found = checkTexts(body);
  const [refused, setRefused] = useState<ReturnType<typeof refusedDetails>>([]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (found.length || !body.trim()) return;
    setPending(true);
    setError(null);
    setRefused([]);
    try {
      const next = await call(() =>
        editing
          ? api.PATCH('/api/v1/post-comments/{id}', {
              params: { path: { id: editing.id } },
              body: { body: body.trim() },
            })
          : api.POST('/api/v1/posts/{id}/comments', {
              params: { path: { id: postId } },
              body: { body: body.trim(), mentions: [], ...(parentId ? { parentId } : {}) },
            }),
      );
      setBody('');
      onSent(next);
    } catch (caught) {
      const details = refusedDetails(caught);
      if (details.length) setRefused(details);
      else setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void send(event)} className="flex flex-col gap-3">
      <TextareaField
        label={t('communities.post.writeComment')}
        value={body}
        maxLength={4000}
        rows={3}
        dir="auto"
        onChange={(event) => setBody(event.target.value)}
      />
      <PatientCheck found={found.length ? found : refused} />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" pending={pending} disabled={!body.trim() || found.length > 0}>
          {editing ? t('communities.post.save') : t('communities.post.send')}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('communities.post.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

function RemoveButton({ onRemove }: { onRemove: (reason: string) => void }) {
  const t = useTranslations('communities.post');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button type="button" variant="link" onClick={() => setOpen(true)}>
        {t('remove')}
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-end gap-2">
      <TextField
        label={t('removeReason')}
        value={reason}
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        type="button"
        variant="danger"
        disabled={!reason.trim()}
        onClick={() => onRemove(reason.trim())}
      >
        {t('remove')}
      </Button>
      <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
        {t('cancel')}
      </Button>
    </span>
  );
}

/** A moderator's tools for the post: remove it, lock it, stop its writer writing here. */
function Moderation({
  onRemove,
  locked,
  onLock,
  slug,
  author,
}: {
  onRemove: (reason: string) => void;
  locked: boolean;
  onLock: (locked: boolean) => void;
  slug: string;
  author: Post['author'];
}) {
  const t = useTranslations();
  const { api, call, me } = useAuth();
  const [banning, setBanning] = useState(false);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const p = (key: string) => t(`communities.post.${key}`);
  const who = author ? `${author.firstName} ${author.lastName}` : '';

  async function ban(event: FormEvent) {
    event.preventDefault();
    if (!author) return;
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/communities/{slug}/bans', {
          params: { path: { slug } },
          body: {
            userId: author.id,
            reason: reason.trim(),
            ...(days.trim() ? { days: Number(days) } : {}),
          },
        }),
      );
      setDone(true);
      setBanning(false);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section
      aria-labelledby="post-moderation"
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <h2 id="post-moderation" className="font-semibold">
        {p('moderation')}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <RemoveButton onRemove={onRemove} />
        <Button type="button" variant="secondary" onClick={() => onLock(!locked)}>
          {locked ? p('unlock') : p('lock')}
        </Button>
        {author && author.id !== me?.id && !banning && (
          <Button type="button" variant="secondary" onClick={() => setBanning(true)}>
            {t('communities.post.ban', { name: who })}
          </Button>
        )}
      </div>
      {banning && (
        <form
          noValidate
          onSubmit={(event) => void ban(event)}
          className="flex flex-wrap items-end gap-3"
        >
          <TextField
            label={p('banReason')}
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
          />
          <TextField
            label={p('banDays')}
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
          <Button type="submit" variant="danger" disabled={!reason.trim()}>
            {t('communities.post.ban', { name: who })}
          </Button>
        </form>
      )}
      {done && <Alert tone="success">{t('communities.post.banned', { name: who })}</Alert>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
    </section>
  );
}
