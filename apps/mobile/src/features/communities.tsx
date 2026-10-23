import { ApiError, type components } from '@medconnect/api-client';
import { REACTIONS, REACTION_EMOJI, type Reaction } from '@medconnect/api-client/chat';
import { type PatientDetail, findPatientDetails } from '@medconnect/shared';
import { colors, semantic } from '@medconnect/ui-tokens';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { PersonMark } from './verification';

/**
 * Communities (M25), as on the site, for verified people: the communities, the feed and saved
 * posts, a community's posts, writing a post, and a post with its comments. The patient-details
 * check stops text before it is sent, and the server refuses it too. Opening communities and
 * appointing moderators stay on the site.
 */

type Schemas = components['schemas'];
type Community = Schemas['CommunityDto'];
type CommunityList = Schemas['CommunityListDto'];
type PostList = Schemas['PostListDto'];
type Summary = PostList['items'][number];
type Post = Schemas['PostDto'];
type Comment = Post['comments'][number];
type Author = Summary['author'];
type Kind = 'QUESTION' | 'DISCUSSION';

const json = { 'Content-Type': 'application/json' };

function useCommunityName() {
  const locale = useLocale();
  return (c: { nameHe: string; nameEn: string }) => (locale === 'en' ? c.nameEn : c.nameHe);
}

/** Communities are for verified people: anyone else is told how to get there. */
function useNotVerified(error: unknown): boolean {
  return error instanceof ApiError && error.details.some((d) => d.code === 'membersOnly');
}

function NotVerified() {
  const t = useTranslations('communities.list');
  const router = useRouter();
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Notice>{t('verifiedOnly')}</Notice>
      <Button label={t('verifyLink')} onPress={() => router.push('/verification')} />
    </Screen>
  );
}

function AuthorLine({ author, at }: { author: Author; at: string }) {
  const t = useTranslations('communities.post');
  const format = useFormatter();
  return (
    <View style={styles.row}>
      <Text style={styles.meta}>
        {author ? t('by', { name: `${author.firstName} ${author.lastName}` }) : t('byGone')} ·{' '}
        {format.dateTime(new Date(at), { dateStyle: 'medium' })}
      </Text>
      {author?.mark && <PersonMark mark={author.mark} />}
    </View>
  );
}

function PostLine({ post, showCommunity = false }: { post: Summary; showCommunity?: boolean }) {
  const t = useTranslations('communities');
  const name = useCommunityName();
  const router = useRouter();
  const title = post.removed
    ? post.removed === 'moderator'
      ? t('post.removedByModerator')
      : t('post.deletedByWriter')
    : (post.title ?? '');
  return (
    <Pressable
      disabled={post.removed !== null}
      onPress={() =>
        router.push(
          `/communities/${encodeURIComponent(post.community.slug)}/${encodeURIComponent(post.id)}` as Href,
        )
      }
      accessibilityRole="link"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Tag>{t(`kinds.${post.kind}`)}</Tag>
        {post.answered && <Tag tone="success">{t('post.answered')}</Tag>}
        {post.locked && <Tag>{t('post.locked')}</Tag>}
        {showCommunity && <Text style={styles.meta}>{name(post.community)}</Text>}
      </View>
      <Text style={post.removed ? styles.meta : styles.cardTitle}>{title}</Text>
      {post.excerpt !== '' && <Text style={styles.text}>{post.excerpt}</Text>}
      <AuthorLine author={post.author} at={post.createdAt} />
      <Text style={styles.meta}>{t('post.comments', { count: post.commentCount })}</Text>
    </Pressable>
  );
}

type Tab = 'all' | 'following' | 'saved';

/** The communities, the feed, and saved posts. */
export function CommunitiesScreen() {
  const all = useTranslations();
  const t = useTranslations('communities.list');
  const m = useTranslations('mobile');
  const name = useCommunityName();
  const router = useRouter();
  const { request } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [communities, setCommunities] = useState<CommunityList | null>(null);
  const [posts, setPosts] = useState<{ tab: Tab; data: PostList } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    const fail = (caught: unknown) => active && setError(caught);
    if (tab === 'all') {
      request<CommunityList>('/api/v1/communities')
        .then((result) => active && setCommunities(result))
        .catch(fail);
    } else {
      request<PostList>(
        tab === 'following' ? '/api/v1/communities/feed' : '/api/v1/communities/bookmarks',
      )
        .then((result) => active && setPosts({ tab, data: result }))
        .catch(fail);
    }
    return () => {
      active = false;
    };
  }, [request, tab]);

  if (useNotVerified(error)) return <NotVerified />;
  const shown = posts?.tab === tab ? posts.data : null;
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      <Body muted>{t('staffNote')}</Body>
      <Choices<Tab>
        label={t('tabs')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'all', label: t('all') },
          { value: 'following', label: t('feed') },
          { value: 'saved', label: t('bookmarks') },
        ]}
      />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {tab === 'all' &&
        communities?.items.map((community) => (
          <Pressable
            key={community.id}
            onPress={() =>
              router.push(`/communities/${encodeURIComponent(community.slug)}` as Href)
            }
            accessibilityRole="link"
            accessibilityLabel={name(community)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.cardTitle}>{name(community)}</Text>
            <View style={styles.row}>
              <Text style={styles.meta}>{t('posts', { count: community.postCount })}</Text>
              {community.following && <Tag>{t('following')}</Tag>}
              {community.moderating && <Tag>{t('moderating')}</Tag>}
            </View>
          </Pressable>
        ))}
      {tab !== 'all' && !shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && (
        <Body muted>{tab === 'following' ? t('feedEmpty') : t('bookmarksEmpty')}</Body>
      )}
      {tab !== 'all' &&
        shown?.items.map((post) => <PostLine key={post.id} post={post} showCommunity />)}
    </Screen>
  );
}

/** One community: following it, its posts, and the way to write. */
export function CommunityScreen({ slug }: { slug: string }) {
  const all = useTranslations();
  const t = useTranslations('communities.community');
  const m = useTranslations('mobile');
  const format = useFormatter();
  const name = useCommunityName();
  const router = useRouter();
  const { request } = useSession();
  const [community, setCommunity] = useState<Community | null>(null);
  const [sort, setSort] = useState<'active' | 'new'>('active');
  const [posts, setPosts] = useState<PostList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const path = `/api/v1/communities/${encodeURIComponent(slug)}`;

  useEffect(() => {
    let active = true;
    request<Community>(path)
      .then((result) => active && setCommunity(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, path]);

  useEffect(() => {
    let active = true;
    request<PostList>(`${path}/posts?sort=${sort}`)
      .then((result) => active && setPosts(result))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, path, sort]);

  async function toggleFollow() {
    if (!community) return;
    setPending(true);
    try {
      await request(`${path}/follow`, { method: community.following ? 'DELETE' : 'PUT' });
      setCommunity({ ...community, following: !community.following });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (useNotVerified(error)) return <NotVerified />;
  if (!community) {
    return (
      <Screen>
        <Back />
        {error !== null ? (
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        ) : (
          <Body muted>{m('loading')}</Body>
        )}
      </Screen>
    );
  }
  return (
    <Screen>
      <Back />
      <Title>{name(community)}</Title>
      <Body muted>
        {`${t('moderators')}: ${
          community.moderators.length
            ? community.moderators.map((p) => `${p.firstName} ${p.lastName}`).join(', ')
            : t('noModerators')
        }`}
      </Body>
      <Button
        label={community.following ? t('unfollow') : t('follow')}
        hint={t('followHint')}
        variant="secondary"
        pending={pending}
        onPress={() => void toggleFollow()}
      />
      {community.archived && <Notice tone="warning">{t('archived')}</Notice>}
      {community.banned && (
        <Notice tone="warning">
          {community.banned.until
            ? t('bannedUntil', {
                reason: community.banned.reason,
                date: format.dateTime(new Date(community.banned.until), { dateStyle: 'long' }),
              })
            : t('banned', { reason: community.banned.reason })}
        </Notice>
      )}
      {community.canWrite && (
        <Button
          label={t('write')}
          onPress={() => router.push(`/communities/${encodeURIComponent(slug)}/write` as Href)}
        />
      )}
      <Choices<'active' | 'new'>
        label={t('sort')}
        value={sort}
        onChange={setSort}
        options={[
          { value: 'active', label: t('sortActive') },
          { value: 'new', label: t('sortNew') },
        ]}
      />
      {posts?.items.length === 0 && <Body muted>{t('empty')}</Body>}
      {posts?.items.map((post) => (
        <PostLine key={post.id} post={post} />
      ))}
    </Screen>
  );
}

/** What the check found, and the standing note. */
function PatientCheck({ found }: { found: readonly PatientDetail[] }) {
  const t = useTranslations('communities.write');
  return (
    <>
      <Body muted>{t('patientNote')}</Body>
      {found.length > 0 && (
        <Notice tone="error">
          {[
            t('found'),
            ...found.map((d) => t('foundItem', { text: d.text, what: t(`what.${d.kind}`) })),
          ].join('\n')}
        </Notice>
      )}
    </>
  );
}

const DETAIL_CODES: Record<string, PatientDetail['kind']> = {
  patientIdNumber: 'idNumber',
  patientPhone: 'phone',
  patientDate: 'date',
  patientRecordNumber: 'recordNumber',
  patientName: 'patientName',
  patientEmail: 'email',
};

/** The server's refusal as the same list, when the text got past the phone's check. */
function refused(error: unknown): PatientDetail[] {
  if (!(error instanceof ApiError)) return [];
  return error.details.flatMap((d) =>
    DETAIL_CODES[d.code] ? [{ kind: DETAIL_CODES[d.code]!, text: d.value ?? '' }] : [],
  );
}

/** A new post in a community. */
export function WritePostScreen({ slug }: { slug: string }) {
  const all = useTranslations();
  const t = useTranslations('communities.write');
  const router = useRouter();
  const { request } = useSession();
  const [kind, setKind] = useState<Kind>('DISCUSSION');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const found = [...findPatientDetails(title), ...findPatientDetails(body)];
  const blocked = found.length ? found : refused(error);

  async function send() {
    setPending(true);
    setError(null);
    try {
      const post = await request<Post>(`/api/v1/communities/${encodeURIComponent(slug)}/posts`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          kind,
          title: title.trim(),
          body: body.trim(),
          fileIds: [],
          mentions: [],
        }),
      });
      router.replace(
        `/communities/${encodeURIComponent(slug)}/${encodeURIComponent(post.id)}` as Href,
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Choices<Kind>
        label={t('kind')}
        value={kind}
        onChange={setKind}
        options={(['DISCUSSION', 'QUESTION'] as const).map((value) => ({
          value,
          label: all(`communities.kinds.${value}`),
        }))}
      />
      <Field label={t('titleLabel')} value={title} onChangeText={setTitle} maxLength={200} />
      <Field label={t('body')} value={body} onChangeText={setBody} maxLength={10000} multiline />
      <PatientCheck found={blocked} />
      {error !== null && refused(error).length === 0 && (
        <Notice tone="error">{errorMessage(error, all)}</Notice>
      )}
      <Button
        label={t('send')}
        pending={pending}
        disabled={!title.trim() || !body.trim() || found.length > 0}
        onPress={() => void send()}
      />
    </Screen>
  );
}

function ReactionRow({
  reactions,
  onToggle,
}: {
  reactions: Post['reactions'];
  onToggle: ((reaction: Reaction, on: boolean) => void) | null;
}) {
  const t = useTranslations('rooms.reactions');
  return (
    <View style={styles.row} accessibilityLabel={t('group')}>
      {REACTIONS.map((reaction) => {
        const used = reactions.find((r) => r.reaction === reaction);
        const mine = used?.mine ?? false;
        const count = used?.count ?? 0;
        return (
          <Pressable
            key={reaction}
            disabled={!onToggle}
            onPress={() => onToggle?.(reaction, !mine)}
            accessibilityRole="button"
            accessibilityLabel={
              count ? t(mine ? 'yours' : 'count', { name: t(reaction), count }) : t(reaction)
            }
            accessibilityState={{ selected: mine, disabled: !onToggle }}
            style={[styles.chip, mine && styles.chipOn]}
          >
            <Text style={styles.text}>
              {REACTION_EMOJI[reaction]}
              {count > 0 ? ` ${count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One post with its comments, and what the reader may do with them. */
export function PostScreen({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('communities.post');
  const m = useTranslations('mobile');
  const { request } = useSession();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [pending, setPending] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const path = `/api/v1/posts/${encodeURIComponent(id)}`;

  useEffect(() => {
    let active = true;
    request<Post>(path)
      .then((result) => active && setPost(result))
      .catch((caught: unknown) => active && setError(caught));
    request<{ id: string }>('/api/v1/me')
      .then((result) => active && setMe(result.id))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, path]);

  async function act(target: string, init: RequestInit) {
    setPending(true);
    setError(null);
    try {
      setPost(await request<Post>(target, init));
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function toggle(what: 'bookmark' | 'follow', on: boolean) {
    if (!post) return;
    try {
      await request(`${path}/${what}`, { method: on ? 'PUT' : 'DELETE' });
      setPost({ ...post, ...(what === 'bookmark' ? { bookmarked: on } : { following: on }) });
    } catch (caught) {
      setError(caught);
    }
  }

  if (useNotVerified(error)) return <NotVerified />;
  if (!post) {
    return (
      <Screen>
        <Back />
        {error !== null ? (
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        ) : (
          <Body muted>{m('loading')}</Body>
        )}
      </Screen>
    );
  }
  const found = findPatientDetails(body);
  const blocked = found.length ? found : refused(error);
  const removedText =
    post.removed === 'author'
      ? t('deletedByWriter')
      : post.removedReason
        ? t('removedReason', { reason: post.removedReason })
        : t('removedByModerator');
  const sendComment = async () => {
    const ok = await act(`${path}/comments`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        body: body.trim(),
        mentions: [],
        ...(replyTo ? { parentId: replyTo.id } : {}),
      }),
    });
    if (ok) {
      setBody('');
      setReplyTo(null);
    }
  };
  const asQuestionWriter = post.kind === 'QUESTION' && post.author?.id === me;

  return (
    <Screen>
      <Back />
      <View style={styles.row}>
        <Tag>{all(`communities.kinds.${post.kind}`)}</Tag>
        {post.answered && <Tag tone="success">{t('answered')}</Tag>}
        {post.locked && <Tag>{t('locked')}</Tag>}
      </View>
      {post.removed ? <Notice>{removedText}</Notice> : <Title>{post.title ?? ''}</Title>}
      <AuthorLine author={post.author} at={post.createdAt} />
      {!post.removed && <Body>{post.body}</Body>}
      {!post.removed && (
        <>
          <ReactionRow
            reactions={post.reactions}
            onToggle={
              post.canComment || post.canModerate
                ? (reaction, on) =>
                    void act(`${path}/reactions/${reaction}`, { method: on ? 'PUT' : 'DELETE' })
                : null
            }
          />
          <Button
            label={post.bookmarked ? t('unbookmark') : t('bookmark')}
            variant="secondary"
            onPress={() => void toggle('bookmark', !post.bookmarked)}
          />
          <Button
            label={post.following ? t('unfollowPost') : t('followPost')}
            hint={t('followPostHint')}
            variant="secondary"
            onPress={() => void toggle('follow', !post.following)}
          />
        </>
      )}
      {post.canModerate && !post.removed && (
        <Button
          label={post.locked ? t('unlock') : t('lock')}
          variant="secondary"
          onPress={() => void act(`${path}/${post.locked ? 'unlock' : 'lock'}`, { method: 'POST' })}
        />
      )}
      {error !== null && refused(error).length === 0 && (
        <Notice tone="error">{errorMessage(error, all)}</Notice>
      )}
      {!post.removed && (
        <Card>
          <Heading>{t('comments', { count: post.commentCount })}</Heading>
          {post.comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              canReply={post.canComment && comment.parentId === null}
              canReact={post.canComment || post.canModerate}
              canAnswer={asQuestionWriter}
              onReply={() => setReplyTo(comment)}
              onReact={(reaction, on) =>
                void act(
                  `/api/v1/post-comments/${encodeURIComponent(comment.id)}/reactions/${reaction}`,
                  { method: on ? 'PUT' : 'DELETE' },
                )
              }
              onAnswer={() =>
                void act(`${path}/answer`, {
                  method: 'PUT',
                  headers: json,
                  body: JSON.stringify({ commentId: comment.isAnswer ? null : comment.id }),
                })
              }
            />
          ))}
          {post.locked && <Body muted>{t('lockedNote')}</Body>}
          {post.canComment && (
            <>
              {replyTo && (
                <Notice>
                  {t('replyTo', {
                    name: replyTo.author
                      ? `${replyTo.author.firstName} ${replyTo.author.lastName}`
                      : '',
                  })}
                </Notice>
              )}
              <Field
                label={t('writeComment')}
                value={body}
                onChangeText={setBody}
                maxLength={4000}
                multiline
              />
              <PatientCheck found={blocked} />
              <Button
                label={t('send')}
                pending={pending}
                disabled={!body.trim() || found.length > 0}
                onPress={() => void sendComment()}
              />
              {replyTo && (
                <Button label={t('cancel')} variant="link" onPress={() => setReplyTo(null)} />
              )}
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

function CommentItem({
  comment,
  canReply,
  canReact,
  canAnswer,
  onReply,
  onReact,
  onAnswer,
}: {
  comment: Comment;
  canReply: boolean;
  canReact: boolean;
  canAnswer: boolean;
  onReply: () => void;
  onReact: (reaction: Reaction, on: boolean) => void;
  onAnswer: () => void;
}) {
  const t = useTranslations('communities.post');
  if (comment.removed) {
    return (
      <View style={[styles.comment, comment.parentId !== null && styles.reply]}>
        <Text style={styles.meta}>
          {comment.removed === 'author'
            ? t('deletedByWriter')
            : comment.removedReason
              ? t('removedReason', { reason: comment.removedReason })
              : t('removedByModerator')}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.comment,
        comment.parentId !== null && styles.reply,
        comment.isAnswer && styles.answer,
      ]}
    >
      <AuthorLine author={comment.author} at={comment.createdAt} />
      {comment.isAnswer && <Tag tone="success">{t('theAnswer')}</Tag>}
      <Text style={styles.text}>{comment.body}</Text>
      <ReactionRow reactions={comment.reactions} onToggle={canReact ? onReact : null} />
      {canReply && <Button label={t('reply')} variant="link" onPress={onReply} />}
      {canAnswer && (
        <Button
          label={comment.isAnswer ? t('unmarkAnswer') : t('markAnswer')}
          variant="link"
          onPress={onAnswer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: 14,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 12,
  },
  pressed: { opacity: 0.8 },
  cardTitle: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    color: semantic.primary,
    textDecorationLine: 'underline',
  },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  text: { fontSize: 16, lineHeight: 24, color: semantic.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.neutral[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipOn: { borderColor: semantic.primary, backgroundColor: colors.brand[50] },
  comment: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: semantic.border },
  reply: { marginStart: 16 },
  answer: { borderTopColor: colors.success[700], borderTopWidth: 2 },
});
