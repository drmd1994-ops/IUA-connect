import { Injectable, type OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { FilesService } from '../files';
import {
  type Author,
  CommunitiesService,
  type Standing,
  isCommunityStaff,
} from './communities.service';
import { CommunityNotifier, type PostNotice } from './community-notifier';
import {
  type CommentEditDto,
  type CommentInputDto,
  type PostDto,
  type PostEditDto,
  type PostInputDto,
  type PostListDto,
  type PostListQueryDto,
} from './community.dto';
import {
  COMMENT_EDIT_WINDOW_MS,
  POSTS_PAGE_SIZE,
  POST_EDIT_WINDOW_MS,
  REACTIONS,
  type Reaction,
  refusePatientDetails,
  withinWindow,
} from './community-rules';

const EXCERPT = 240;

const SUMMARY_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  authorId: true,
  answerCommentId: true,
  lockedAt: true,
  removedAt: true,
  removedBy: true,
  commentCount: true,
  createdAt: true,
  activityAt: true,
  community: { select: { id: true, slug: true, nameHe: true, nameEn: true } },
} satisfies Prisma.PostSelect;
type SummaryRow = Prisma.PostGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Posts and comments in communities (M25 plan §2 and §3). Text with what looks like a patient's
 * details is refused (owner answer §10.4). A post's writer changes it for a day and a comment's
 * for 15 minutes; a writer deletes their own, and a moderator removes with a reason, which
 * leaves a marker and goes to the audit log. A locked post takes no more comments.
 */
@Injectable()
export class PostsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly communities: CommunitiesService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly notices: CommunityNotifier,
  ) {}

  /** A post's files are for whoever reads communities, while the post stands. */
  onModuleInit(): void {
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const used = await this.prisma.postFile.findFirst({
          where: { fileId },
          select: {
            post: { select: { removedAt: true, community: { select: { archivedAt: true } } } },
          },
        });
        if (!used) return null;
        if (!principal) return false;
        if (isCommunityStaff(principal)) return true;
        return (
          principal.verified &&
          used.post.removedAt === null &&
          used.post.community.archivedAt === null
        );
      },
    });
  }

  // --- Lists ------------------------------------------------------------------------------------

  async list(principal: Principal, slug: string, query: PostListQueryDto): Promise<PostListDto> {
    const { community } = await this.communities.standing(principal, { slug });
    return this.page(
      principal,
      { communityId: community.id, ...(query.kind ? { kind: query.kind } : {}) },
      query.sort === 'new' ? { createdAt: 'desc' } : { activityAt: 'desc' },
      query.page,
    );
  }

  /** New posts in the communities the reader follows, newest first. */
  async feed(principal: Principal, page: number): Promise<PostListDto> {
    this.communities.ensureReader(principal);
    return this.page(
      principal,
      {
        removedAt: null,
        community: {
          archivedAt: null,
          follows: { some: { userId: principal.userId } },
        },
      },
      { createdAt: 'desc' },
      page,
    );
  }

  async bookmarks(principal: Principal, page: number): Promise<PostListDto> {
    this.communities.ensureReader(principal);
    return this.page(
      principal,
      { bookmarks: { some: { userId: principal.userId } }, community: { archivedAt: null } },
      { createdAt: 'desc' },
      page,
    );
  }

  private async page(
    principal: Principal,
    where: Prisma.PostWhereInput,
    orderBy: Prisma.PostOrderByWithRelationInput,
    page: number,
  ): Promise<PostListDto> {
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        select: {
          ...SUMMARY_SELECT,
          bookmarks: { where: { userId: principal.userId }, select: { userId: true } },
        },
        orderBy: [orderBy, { id: 'desc' }],
        skip: (page - 1) * POSTS_PAGE_SIZE,
        take: POSTS_PAGE_SIZE,
      }),
      this.prisma.post.count({ where }),
    ]);
    const people = await this.communities.authors(rows.map((row) => row.authorId));
    return {
      items: rows.map((row) => ({
        ...summary(row, people),
        excerpt: row.removedAt ? '' : excerpt(row.body),
        bookmarked: row.bookmarks.length > 0,
      })),
      page,
      pageSize: POSTS_PAGE_SIZE,
      total,
    };
  }

  // --- One post ---------------------------------------------------------------------------------

  async get(principal: Principal, id: string): Promise<PostDto> {
    const { row, standing } = await this.post(principal, id);
    const me = principal.userId;
    const [comments, files, reactions, commentReactions, mine] = await Promise.all([
      this.prisma.postComment.findMany({
        where: { postId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.postFile.findMany({
        where: { postId: id },
        orderBy: { position: 'asc' },
        include: { file: true },
      }),
      this.prisma.postReaction.findMany({ where: { postId: id } }),
      this.prisma.commentReaction.findMany({ where: { comment: { postId: id } } }),
      this.prisma.post.findUniqueOrThrow({
        where: { id },
        select: {
          bookmarks: { where: { userId: me }, select: { userId: true } },
          follows: { where: { userId: me }, select: { userId: true } },
        },
      }),
    ]);
    const people = await this.communities.authors([
      row.authorId,
      ...comments.map((comment) => comment.authorId),
    ]);
    const now = new Date();
    const removed = row.removedAt !== null;
    const byComment = new Map<string, { reaction: string; userId: string }[]>();
    for (const reaction of commentReactions) {
      const list = byComment.get(reaction.commentId) ?? [];
      list.push(reaction);
      byComment.set(reaction.commentId, list);
    }
    return {
      ...summary(row, people),
      body: removed ? '' : row.body,
      removedReason: row.removedBy && row.removedBy !== row.authorId ? row.removedReason : null,
      edited: row.editedAt !== null,
      files: removed
        ? []
        : files.map(({ file }) => ({
            id: file.id,
            kind: file.kind,
            mimeType: file.mimeType,
            originalName: file.originalName,
            sizeBytes: file.sizeBytes,
            width: file.width,
            height: file.height,
            createdAt: file.createdAt.toISOString(),
          })),
      reactions: tally(reactions, me),
      // A removed post takes its comments with it, as far as readers see.
      comments: (removed ? [] : comments).map((comment) => {
        const gone = comment.removedAt !== null;
        return {
          id: comment.id,
          parentId: comment.parentId,
          author: comment.authorId ? (people.get(comment.authorId) ?? null) : null,
          body: gone ? '' : comment.body,
          removed: gone ? (comment.removedBy === comment.authorId ? 'author' : 'moderator') : null,
          removedReason:
            gone && comment.removedBy !== comment.authorId ? comment.removedReason : null,
          edited: comment.editedAt !== null,
          createdAt: comment.createdAt.toISOString(),
          reactions: tally(byComment.get(comment.id) ?? [], me),
          isAnswer: row.answerCommentId === comment.id,
          canEdit:
            !gone &&
            comment.authorId === me &&
            withinWindow(comment.createdAt, COMMENT_EDIT_WINDOW_MS, now),
        };
      }),
      bookmarked: mine.bookmarks.length > 0,
      following: mine.follows.length > 0,
      canEdit:
        !removed && row.authorId === me && withinWindow(row.createdAt, POST_EDIT_WINDOW_MS, now),
      canComment: !removed && row.lockedAt === null && standing.canWrite,
      canModerate: standing.canModerate,
    };
  }

  /** A post the reader may see, with their standing in its community. */
  private async post(principal: Principal, id: string) {
    const row = await this.prisma.post.findUnique({
      where: { id },
      select: { ...SUMMARY_SELECT, editedAt: true, removedReason: true },
    });
    if (!row) throw new AppException('NOT_FOUND');
    const standing = await this.communities.standing(principal, { id: row.community.id });
    return { row, standing };
  }

  // --- Writing ----------------------------------------------------------------------------------

  async create(
    principal: Principal,
    slug: string,
    input: PostInputDto,
    meta: RequestMeta,
  ): Promise<PostDto> {
    const standing = await this.communities.standing(principal, { slug });
    ensureWriter(standing);
    refusePatientDetails({ title: input.title, body: input.body });
    const fileIds = await this.checkFiles(principal, input.fileIds);
    const mentions = await this.checkMentions(input.mentions, principal.userId);
    const id = uuidv7();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.post.create({
        data: {
          id,
          communityId: standing.community.id,
          authorId: principal.userId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          activityAt: now,
          createdAt: now,
          files: { create: fileIds.map((fileId, position) => ({ fileId, position })) },
          // Its writer follows it: comments on it are theirs to know about.
          follows: { create: { userId: principal.userId } },
        },
      });
    });
    for (const fileId of fileIds) await this.files.markAttached(fileId);
    await this.record('community.post.create', id, principal, meta);
    await this.notices.newPost(await this.notice(id, principal.userId), mentions);
    return this.get(principal, id);
  }

  async edit(principal: Principal, id: string, input: PostEditDto, meta: RequestMeta) {
    const { row } = await this.post(principal, id);
    if (row.authorId !== principal.userId || row.removedAt) throw new AppException('NOT_FOUND');
    if (!withinWindow(row.createdAt, POST_EDIT_WINDOW_MS)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'communityEditWindowOver' }]);
    }
    refusePatientDetails({ title: input.title, body: input.body });
    await this.prisma.post.update({
      where: { id },
      data: { title: input.title, body: input.body, editedAt: new Date() },
    });
    await this.record('community.post.edit', id, principal, meta);
    return this.get(principal, id);
  }

  /** The writer deletes their own post: the text goes, a marker stays. */
  async deleteOwn(principal: Principal, id: string, meta: RequestMeta): Promise<void> {
    const { row } = await this.post(principal, id);
    if (row.authorId !== principal.userId || row.removedAt) throw new AppException('NOT_FOUND');
    await this.prisma.post.update({
      where: { id },
      data: { removedAt: new Date(), removedBy: principal.userId, removedReason: null },
    });
    await this.record('community.post.delete', id, principal, meta);
  }

  async comment(
    principal: Principal,
    postId: string,
    input: CommentInputDto,
    meta: RequestMeta,
  ): Promise<PostDto> {
    const { row, standing } = await this.post(principal, postId);
    ensureWriter(standing);
    if (row.removedAt) throw new AppException('NOT_FOUND');
    if (row.lockedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'communityPostLocked' }]);
    }
    refusePatientDetails({ body: input.body });
    let parentWriterId: string | null = null;
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.postComment.findFirst({
        where: { id: input.parentId, postId },
        select: { id: true, parentId: true, authorId: true, removedAt: true },
      });
      if (!parent || parent.removedAt) throw new AppException('NOT_FOUND');
      // One level of replies: a reply to a reply answers the same comment.
      parentId = parent.parentId ?? parent.id;
      parentWriterId = parent.authorId;
    }
    const mentions = await this.checkMentions(input.mentions, principal.userId);
    const id = uuidv7();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.postComment.create({
        data: {
          id,
          postId,
          parentId,
          authorId: principal.userId,
          body: input.body,
          createdAt: now,
        },
      });
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 }, activityAt: now },
      });
      // Commenting follows the post.
      await tx.postFollow.upsert({
        where: { postId_userId: { postId, userId: principal.userId } },
        create: { postId, userId: principal.userId },
        update: {},
      });
    });
    await this.record('community.comment.create', id, principal, meta, { postId });
    await this.notices.newComment(
      await this.notice(postId, principal.userId),
      row.authorId,
      parentWriterId,
      mentions,
    );
    return this.get(principal, postId);
  }

  async editComment(principal: Principal, id: string, input: CommentEditDto, meta: RequestMeta) {
    const comment = await this.ownComment(principal, id);
    if (!withinWindow(comment.createdAt, COMMENT_EDIT_WINDOW_MS)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'communityEditWindowOver' }]);
    }
    refusePatientDetails({ body: input.body });
    await this.prisma.postComment.update({
      where: { id },
      data: { body: input.body, editedAt: new Date() },
    });
    await this.record('community.comment.edit', id, principal, meta);
    return this.get(principal, comment.postId);
  }

  async deleteComment(principal: Principal, id: string, meta: RequestMeta): Promise<PostDto> {
    const comment = await this.ownComment(principal, id);
    await this.prisma.postComment.update({
      where: { id },
      data: { removedAt: new Date(), removedBy: principal.userId, removedReason: null },
    });
    await this.unmarkAnswer(comment.postId, id);
    await this.record('community.comment.delete', id, principal, meta);
    return this.get(principal, comment.postId);
  }

  private async ownComment(principal: Principal, id: string) {
    const comment = await this.prisma.postComment.findUnique({ where: { id } });
    if (!comment || comment.authorId !== principal.userId || comment.removedAt) {
      throw new AppException('NOT_FOUND');
    }
    // The reader must still see the post.
    await this.post(principal, comment.postId);
    return comment;
  }

  // --- Reactions, answers, bookmarks, following ------------------------------------------------

  async react(
    principal: Principal,
    target: 'post' | 'comment',
    id: string,
    reaction: string,
    on: boolean,
  ): Promise<PostDto> {
    if (!(REACTIONS as readonly string[]).includes(reaction)) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'reaction', code: 'unknownReaction' }]);
    }
    const postId =
      target === 'post'
        ? id
        : (
            await this.prisma.postComment.findUnique({
              where: { id },
              select: { postId: true, removedAt: true },
            })
          )?.postId;
    if (!postId) throw new AppException('NOT_FOUND');
    const { standing } = await this.post(principal, postId);
    if (!principal.verified || standing.community.archived) throw new AppException('FORBIDDEN');
    const userId = principal.userId;
    const key = reaction as Reaction;
    if (target === 'post') {
      if (on) {
        await this.prisma.postReaction.upsert({
          where: { postId_userId_reaction: { postId: id, userId, reaction: key } },
          create: { postId: id, userId, reaction: key },
          update: {},
        });
      } else {
        await this.prisma.postReaction.deleteMany({ where: { postId: id, userId, reaction: key } });
      }
    } else if (on) {
      await this.prisma.commentReaction.upsert({
        where: { commentId_userId_reaction: { commentId: id, userId, reaction: key } },
        create: { commentId: id, userId, reaction: key },
        update: {},
      });
    } else {
      await this.prisma.commentReaction.deleteMany({
        where: { commentId: id, userId, reaction: key },
      });
    }
    return this.get(principal, postId);
  }

  /** The question's writer marks one comment as the answer, or none. */
  async setAnswer(principal: Principal, postId: string, commentId: string | null) {
    const { row } = await this.post(principal, postId);
    if (row.authorId !== principal.userId || row.removedAt) throw new AppException('NOT_FOUND');
    if (row.kind !== 'QUESTION') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'communityNotAQuestion' }]);
    }
    if (commentId) {
      const comment = await this.prisma.postComment.findFirst({
        where: { id: commentId, postId, removedAt: null },
        select: { id: true },
      });
      if (!comment) throw new AppException('NOT_FOUND');
    }
    await this.prisma.post.update({ where: { id: postId }, data: { answerCommentId: commentId } });
    return this.get(principal, postId);
  }

  async bookmark(principal: Principal, postId: string, on: boolean): Promise<void> {
    await this.post(principal, postId);
    const userId = principal.userId;
    if (on) {
      await this.prisma.postBookmark.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId },
        update: {},
      });
    } else {
      await this.prisma.postBookmark.deleteMany({ where: { postId, userId } });
    }
  }

  async follow(principal: Principal, postId: string, on: boolean): Promise<void> {
    await this.post(principal, postId);
    const userId = principal.userId;
    if (on) {
      await this.prisma.postFollow.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId },
        update: {},
      });
    } else {
      await this.prisma.postFollow.deleteMany({ where: { postId, userId } });
    }
  }

  // --- Moderation -------------------------------------------------------------------------------

  async removePost(principal: Principal, id: string, reason: string, meta: RequestMeta) {
    const { row, standing } = await this.post(principal, id);
    ensureModerator(standing);
    if (row.removedAt) throw new AppException('NOT_FOUND');
    await this.prisma.post.update({
      where: { id },
      data: { removedAt: new Date(), removedBy: principal.userId, removedReason: reason },
    });
    await this.record('community.post.remove', id, principal, meta, { reason });
    return this.get(principal, id);
  }

  async removeComment(principal: Principal, id: string, reason: string, meta: RequestMeta) {
    const comment = await this.prisma.postComment.findUnique({ where: { id } });
    if (!comment || comment.removedAt) throw new AppException('NOT_FOUND');
    const { standing } = await this.post(principal, comment.postId);
    ensureModerator(standing);
    await this.prisma.postComment.update({
      where: { id },
      data: { removedAt: new Date(), removedBy: principal.userId, removedReason: reason },
    });
    await this.unmarkAnswer(comment.postId, id);
    await this.record('community.comment.remove', id, principal, meta, {
      postId: comment.postId,
      reason,
    });
    return this.get(principal, comment.postId);
  }

  async lock(principal: Principal, id: string, locked: boolean, meta: RequestMeta) {
    const { standing } = await this.post(principal, id);
    ensureModerator(standing);
    await this.prisma.post.update({
      where: { id },
      data: { lockedAt: locked ? new Date() : null },
    });
    await this.record(
      locked ? 'community.post.lock' : 'community.post.unlock',
      id,
      principal,
      meta,
    );
    return this.get(principal, id);
  }

  // --- internals --------------------------------------------------------------------------------

  /** The reader's own uploads, sent as for chat: pictures and PDF, not yet used. */
  private async checkFiles(principal: Principal, fileIds: readonly string[]): Promise<string[]> {
    const ids = [...new Set(fileIds)];
    if (ids.length === 0) return [];
    const found = await this.prisma.storedFile.findMany({
      where: {
        id: { in: ids },
        ownerUserId: principal.userId,
        purpose: 'CHAT',
        attachedAt: null,
        kind: { in: ['IMAGE', 'DOCUMENT'] },
      },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'fileIds', code: 'unknownFile' }]);
    }
    return ids;
  }

  /** Mentioned people who exist and are verified; others are left out quietly. */
  private async checkMentions(ids: readonly string[], me: string): Promise<string[]> {
    const wanted = [...new Set(ids)].filter((id) => id !== me);
    if (wanted.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: wanted }, status: 'ACTIVE', verifiedAt: { not: null } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async unmarkAnswer(postId: string, commentId: string): Promise<void> {
    await this.prisma.post.updateMany({
      where: { id: postId, answerCommentId: commentId },
      data: { answerCommentId: null },
    });
  }

  private async notice(postId: string, writerId: string): Promise<PostNotice> {
    const [post, writer] = await Promise.all([
      this.prisma.post.findUniqueOrThrow({
        where: { id: postId },
        select: { title: true, community: { select: { id: true, slug: true } } },
      }),
      this.communities.authors([writerId]),
    ]);
    const person = writer.get(writerId);
    return {
      postId,
      title: post.title,
      communityId: post.community.id,
      communitySlug: post.community.slug,
      writerId,
      writerName: person ? `${person.firstName} ${person.lastName}`.trim() : '',
    };
  }

  private record(
    action: string,
    id: string,
    principal: Principal,
    meta: RequestMeta,
    changes?: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: action.startsWith('community.comment') ? 'post_comment' : 'post',
      entityId: id,
      ...(changes ? { changes } : {}),
    });
  }
}

function ensureWriter(standing: Standing): void {
  if (standing.banned) {
    throw new AppException('FORBIDDEN', [{ code: 'communityBanned' }]);
  }
  if (!standing.canWrite) throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
}

function ensureModerator(standing: Standing): void {
  if (!standing.canModerate) {
    throw new AppException('FORBIDDEN', [{ code: 'communityModeratorsOnly' }]);
  }
}

function summary(row: SummaryRow, people: Map<string, Author>) {
  const removed = row.removedAt !== null;
  return {
    id: row.id,
    community: row.community,
    kind: row.kind,
    title: removed ? null : row.title,
    author: row.authorId ? (people.get(row.authorId) ?? null) : null,
    removed: removed
      ? row.removedBy === row.authorId
        ? ('author' as const)
        : ('moderator' as const)
      : null,
    answered: row.answerCommentId !== null,
    locked: row.lockedAt !== null,
    commentCount: row.commentCount,
    createdAt: row.createdAt.toISOString(),
    activityAt: row.activityAt.toISOString(),
  };
}

function excerpt(body: string): string {
  const line = body.replace(/\s+/g, ' ').trim();
  const chars = [...line];
  return chars.length <= EXCERPT ? line : `${chars.slice(0, EXCERPT).join('').trimEnd()}…`;
}

function tally(rows: readonly { reaction: string; userId: string }[], me: string) {
  return REACTIONS.flatMap((reaction) => {
    const of = rows.filter((row) => row.reaction === reaction);
    return of.length
      ? [{ reaction, count: of.length, mine: of.some((row) => row.userId === me) }]
      : [];
  });
}
