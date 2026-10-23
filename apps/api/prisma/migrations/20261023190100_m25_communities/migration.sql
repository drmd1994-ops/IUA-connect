-- M25: professional communities, which replace chat rooms (owner answers §10.1 and §10.6).
-- (Prisma also wanted to drop the hand-written department constraints of positions, profiles and
-- verification_requests; those lines were removed.)

-- CreateEnum
CREATE TYPE "post_kind" AS ENUM ('QUESTION', 'DISCUSSION');

-- AlterTable
ALTER TABLE "chat_reports" ADD COLUMN     "comment_id" UUID,
ADD COLUMN     "post_id" UUID;

-- CreateTable
CREATE TABLE "communities" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "description_he" VARCHAR(1000),
    "description_en" VARCHAR(1000),
    "subspecialty_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_moderators" (
    "community_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_moderators_pkey" PRIMARY KEY ("community_id","user_id")
);

-- CreateTable
CREATE TABLE "community_bans" (
    "community_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "banned_by" UUID,
    "until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_bans_pkey" PRIMARY KEY ("community_id","user_id")
);

-- CreateTable
CREATE TABLE "community_follows" (
    "community_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_follows_pkey" PRIMARY KEY ("community_id","user_id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "community_id" UUID NOT NULL,
    "author_id" UUID,
    "kind" "post_kind" NOT NULL DEFAULT 'DISCUSSION',
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(10000) NOT NULL,
    "answer_comment_id" UUID,
    "edited_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "removed_by" UUID,
    "removed_reason" VARCHAR(1000),
    "activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_files" (
    "post_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "post_files_pkey" PRIMARY KEY ("post_id","position")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "parent_id" UUID,
    "author_id" UUID,
    "body" VARCHAR(4000) NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "removed_by" UUID,
    "removed_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_reactions" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reaction" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reactions_pkey" PRIMARY KEY ("post_id","user_id","reaction")
);

-- CreateTable
CREATE TABLE "comment_reactions" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reaction" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("comment_id","user_id","reaction")
);

-- CreateTable
CREATE TABLE "post_bookmarks" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_bookmarks_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "post_follows" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_follows_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "communities_subspecialty_id_key" ON "communities"("subspecialty_id");

-- CreateIndex
CREATE INDEX "community_moderators_user_id_idx" ON "community_moderators"("user_id");

-- CreateIndex
CREATE INDEX "community_bans_user_id_idx" ON "community_bans"("user_id");

-- CreateIndex
CREATE INDEX "community_follows_user_id_idx" ON "community_follows"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "posts_answer_comment_id_key" ON "posts"("answer_comment_id");

-- CreateIndex
CREATE INDEX "posts_community_id_created_at_idx" ON "posts"("community_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "posts_community_id_activity_at_idx" ON "posts"("community_id", "activity_at" DESC);

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "post_files_file_id_idx" ON "post_files"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_files_post_id_file_id_key" ON "post_files"("post_id", "file_id");

-- CreateIndex
CREATE INDEX "post_comments_post_id_created_at_idx" ON "post_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "post_comments_parent_id_idx" ON "post_comments"("parent_id");

-- CreateIndex
CREATE INDEX "post_comments_author_id_idx" ON "post_comments"("author_id");

-- CreateIndex
CREATE INDEX "post_reactions_user_id_idx" ON "post_reactions"("user_id");

-- CreateIndex
CREATE INDEX "comment_reactions_user_id_idx" ON "comment_reactions"("user_id");

-- CreateIndex
CREATE INDEX "post_bookmarks_user_id_created_at_idx" ON "post_bookmarks"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "post_follows_user_id_idx" ON "post_follows"("user_id");

-- AddForeignKey
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_moderators" ADD CONSTRAINT "community_moderators_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_moderators" ADD CONSTRAINT "community_moderators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_answer_comment_id_fkey" FOREIGN KEY ("answer_comment_id") REFERENCES "post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_files" ADD CONSTRAINT "post_files_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_files" ADD CONSTRAINT "post_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_follows" ADD CONSTRAINT "post_follows_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_follows" ADD CONSTRAINT "post_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Written by hand (Prisma does not model these; keep them out of later generated migrations).

-- Chat's six reactions, on posts and comments.
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_known"
  CHECK ("reaction" IN ('like', 'heart', 'laugh', 'wow', 'thanks', 'check'));
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_known"
  CHECK ("reaction" IN ('like', 'heart', 'laugh', 'wow', 'thanks', 'check'));

-- Communities replace chat rooms: every room is archived, kept for staff, and nothing is deleted.
UPDATE "conversations" SET "archived_at" = now() WHERE "kind" = 'ROOM' AND "archived_at" IS NULL;
