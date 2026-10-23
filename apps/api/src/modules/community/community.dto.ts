import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import {
  COMMENT_MAX,
  MAX_MENTIONS,
  MAX_POST_FILES,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  REACTIONS,
} from './community-rules';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = ['QUESTION', 'DISCUSSION'] as const;

const nameRef = z.strictObject({ id: z.uuid(), nameHe: z.string(), nameEn: z.string() });

/** A person as the readers of a community see them: the name, the mark, and nothing else. */
export const authorSchema = z.strictObject({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  mark: z.enum(['STUDENT', 'RESIDENT']).nullable(),
});

const reactionsSchema = z.array(
  z.strictObject({ reaction: z.enum(REACTIONS), count: z.number().int(), mine: z.boolean() }),
);

// --- Communities --------------------------------------------------------------------------------

const communityFields = {
  id: z.uuid(),
  slug: z.string(),
  nameHe: z.string(),
  nameEn: z.string(),
  descriptionHe: nullableString(),
  descriptionEn: nullableString(),
  subspecialty: nameRef.extend({ key: z.string() }).nullable(),
};

export class CommunityListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        ...communityFields,
        postCount: z.number().int(),
        following: z.boolean(),
        /** The reader moderates it. */
        moderating: z.boolean(),
      }),
    ),
  }),
) {}

export class CommunityDto extends createZodDto(
  z.strictObject({
    ...communityFields,
    postCount: z.number().int(),
    following: z.boolean(),
    moderators: z.array(authorSchema),
    /** What the reader may do here. */
    canWrite: z.boolean(),
    canModerate: z.boolean(),
    /** Banned from writing here, until then (null: until lifted). */
    banned: z.strictObject({ reason: z.string(), until: z.iso.datetime().nullable() }).nullable(),
    archived: z.boolean(),
  }),
) {}

// --- Posts --------------------------------------------------------------------------------------

const fileView = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['IMAGE', 'DOCUMENT', 'VIDEO']),
  mimeType: z.string(),
  originalName: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});

const postSummaryFields = {
  id: z.uuid(),
  community: z.strictObject({
    id: z.uuid(),
    slug: z.string(),
    nameHe: z.string(),
    nameEn: z.string(),
  }),
  kind: z.enum(KINDS),
  /** Null once removed. */
  title: nullableString(),
  author: authorSchema.nullable(),
  /** "Removed by a moderator" or "deleted by its writer". */
  removed: z.enum(['moderator', 'author']).nullable(),
  answered: z.boolean(),
  locked: z.boolean(),
  commentCount: z.number().int(),
  createdAt: z.iso.datetime(),
  activityAt: z.iso.datetime(),
};

export class PostListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        ...postSummaryFields,
        /** The start of the text. */
        excerpt: z.string(),
        bookmarked: z.boolean(),
      }),
    ),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
) {}

export class PostListQueryDto extends createZodDto(
  z.strictObject({
    sort: z.enum(['new', 'active']).default('active'),
    kind: z.enum(KINDS).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  }),
) {}

export class PagedQueryDto extends createZodDto(
  z.strictObject({ page: z.coerce.number().int().min(1).max(10_000).default(1) }),
) {}

const commentSchema = z.strictObject({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  author: authorSchema.nullable(),
  /** Empty once removed. */
  body: z.string(),
  removed: z.enum(['moderator', 'author']).nullable(),
  /** The moderator's reason, shown with the marker. */
  removedReason: nullableString(),
  edited: z.boolean(),
  createdAt: z.iso.datetime(),
  reactions: reactionsSchema,
  /** Marked by the question's writer as the answer. */
  isAnswer: z.boolean(),
  canEdit: z.boolean(),
});

export class PostDto extends createZodDto(
  z.strictObject({
    ...postSummaryFields,
    /** Empty once removed. */
    body: z.string(),
    removedReason: nullableString(),
    edited: z.boolean(),
    files: z.array(fileView),
    reactions: reactionsSchema,
    comments: z.array(commentSchema),
    bookmarked: z.boolean(),
    following: z.boolean(),
    canEdit: z.boolean(),
    canComment: z.boolean(),
    canModerate: z.boolean(),
  }),
) {}

export class PostInputDto extends createZodDto(
  z.strictObject({
    kind: z.enum(KINDS).default('DISCUSSION'),
    title: z.string().trim().min(1).max(POST_TITLE_MAX),
    body: z.string().trim().min(1).max(POST_BODY_MAX),
    /** Pictures or PDF uploaded as for chat (no video). */
    fileIds: z.array(z.uuid()).max(MAX_POST_FILES).default([]),
    /** People mentioned in the text; they are told. */
    mentions: z.array(z.uuid()).max(MAX_MENTIONS).default([]),
  }),
) {}

export class PostEditDto extends createZodDto(
  z.strictObject({
    title: z.string().trim().min(1).max(POST_TITLE_MAX),
    body: z.string().trim().min(1).max(POST_BODY_MAX),
  }),
) {}

export class CommentInputDto extends createZodDto(
  z.strictObject({
    body: z.string().trim().min(1).max(COMMENT_MAX),
    /** The comment this one replies to; one level only. */
    parentId: z.uuid().optional(),
    mentions: z.array(z.uuid()).max(MAX_MENTIONS).default([]),
  }),
) {}

export class CommentEditDto extends createZodDto(
  z.strictObject({ body: z.string().trim().min(1).max(COMMENT_MAX) }),
) {}

export class AnswerInputDto extends createZodDto(
  z.strictObject({ commentId: z.uuid().nullable() }),
) {}

export class ReasonDto extends createZodDto(
  z.strictObject({ reason: z.string().trim().min(1).max(1000) }),
) {}

export class BanInputDto extends createZodDto(
  z.strictObject({
    userId: z.uuid(),
    reason: z.string().trim().min(1).max(1000),
    /** How long; left out: until lifted. */
    days: z.number().int().min(1).max(365).optional(),
  }),
) {}

export class BanListDto extends createZodDto(
  z.strictObject({
    items: z.array(
      z.strictObject({
        person: authorSchema,
        reason: z.string(),
        until: z.iso.datetime().nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
  }),
) {}

// --- Staff --------------------------------------------------------------------------------------

export class AdminCommunityInputDto extends createZodDto(
  z.strictObject({
    slug: z.string().trim().min(2).max(64).regex(SLUG),
    nameHe: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    descriptionHe: z.string().trim().max(1000).nullable().default(null),
    descriptionEn: z.string().trim().max(1000).nullable().default(null),
    sortOrder: z.number().int().min(0).max(1000).default(100),
  }),
) {}

export class AdminCommunityDto extends createZodDto(
  z.strictObject({
    ...communityFields,
    sortOrder: z.number().int(),
    archived: z.boolean(),
    postCount: z.number().int(),
    moderators: z.array(authorSchema),
  }),
) {}

export class AdminCommunityListDto extends createZodDto(
  z.strictObject({ items: z.array(AdminCommunityDto.schema) }),
) {}

export class ModeratorInputDto extends createZodDto(z.strictObject({ userId: z.uuid() })) {}
