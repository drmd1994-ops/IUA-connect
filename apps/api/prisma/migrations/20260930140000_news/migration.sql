-- M3 checkpoint 4: news with translations, revisions, attachments, tags and history.
-- See docs/plans/M3-content-core.md §2.3, §3 and §5.

-- CreateEnum
CREATE TYPE "news_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "news_categories" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "news_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160),
    "status" "news_status" NOT NULL DEFAULT 'DRAFT',
    "category_id" UUID,
    "author_user_id" UUID,
    "submitted_by" UUID,
    "featured_image_file_id" UUID,
    "access_tier" "access_tier" NOT NULL DEFAULT 'PUBLIC',
    "publish_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "source_url" VARCHAR(500),
    "source_published_at" TIMESTAMPTZ(6),
    "references" JSONB NOT NULL DEFAULT '[]',
    "revision_of_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_translations" (
    "news_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" VARCHAR(1000),
    "body" TEXT NOT NULL DEFAULT '',
    "author" VARCHAR(200),

    CONSTRAINT "news_translations_pkey" PRIMARY KEY ("news_id","locale")
);

-- CreateTable
CREATE TABLE "news_attachments" (
    "news_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "news_attachments_pkey" PRIMARY KEY ("news_id","file_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_tags" (
    "news_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "news_tags_pkey" PRIMARY KEY ("news_id","tag_id")
);

-- CreateTable
CREATE TABLE "news_history" (
    "id" UUID NOT NULL,
    "news_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "from_status" "news_status",
    "to_status" "news_status" NOT NULL,
    "actor_user_id" UUID,
    "comment" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_categories_key_key" ON "news_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "news_revision_of_id_key" ON "news"("revision_of_id");

-- CreateIndex
CREATE INDEX "news_status_published_at_idx" ON "news"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "news_status_publish_at_idx" ON "news"("status", "publish_at");

-- CreateIndex
CREATE INDEX "news_attachments_file_id_idx" ON "news_attachments"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "news_history_news_id_at_idx" ON "news_history"("news_id", "at");

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "news_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_featured_image_file_id_fkey" FOREIGN KEY ("featured_image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_revision_of_id_fkey" FOREIGN KEY ("revision_of_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_translations" ADD CONSTRAINT "news_translations_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_attachments" ADD CONSTRAINT "news_attachments_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_attachments" ADD CONSTRAINT "news_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_tags" ADD CONSTRAINT "news_tags_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_tags" ADD CONSTRAINT "news_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_history" ADD CONSTRAINT "news_history_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma can't express (DATABASE_DESIGN.md §1 "Constraints")
-- ---------------------------------------------------------------------------
-- Slugs: lower-case Latin letters, digits or Hebrew letters, separated by single hyphens.
ALTER TABLE "news" ADD CONSTRAINT "news_slug_format"
  CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$');
-- A live item has a slug; a revision borrows its item's.
ALTER TABLE "news" ADD CONSTRAINT "news_slug_unless_revision"
  CHECK (("revision_of_id" IS NULL) = ("slug" IS NOT NULL));
-- Revisions are only drafted and reviewed; publishing one copies it onto the live item.
ALTER TABLE "news" ADD CONSTRAINT "news_revision_states"
  CHECK ("revision_of_id" IS NULL OR "status" IN ('DRAFT', 'IN_REVIEW'));
ALTER TABLE "news" ADD CONSTRAINT "news_scheduled_has_time"
  CHECK ("status" <> 'SCHEDULED' OR "publish_at" IS NOT NULL);
ALTER TABLE "news" ADD CONSTRAINT "news_published_has_date"
  CHECK ("status" NOT IN ('PUBLISHED', 'ARCHIVED') OR "published_at" IS NOT NULL);
ALTER TABLE "news" ADD CONSTRAINT "news_references_array"
  CHECK (jsonb_typeof("references") = 'array');
ALTER TABLE "news" ADD CONSTRAINT "news_version_positive" CHECK ("version" > 0);
ALTER TABLE "news_translations" ADD CONSTRAINT "news_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');
ALTER TABLE "news_translations" ADD CONSTRAINT "news_translations_body_length"
  CHECK (length("body") <= 50000);
ALTER TABLE "news_categories" ADD CONSTRAINT "news_categories_key_format"
  CHECK ("key" ~ '^[a-z0-9_]+$');

-- ---------------------------------------------------------------------------
-- Search (DATABASE_DESIGN.md §5): a vector per translation, kept current by a trigger, over the
-- Hebrew-normalised text (niqqud stripped, final letters folded); trigram index on titles.
-- The search API arrives in M7.
-- ---------------------------------------------------------------------------
ALTER TABLE "news_translations" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION news_translations_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.summary, ''))), 'B') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.body, ''))), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER news_translations_search_vector
  BEFORE INSERT OR UPDATE OF "title", "summary", "body" ON "news_translations"
  FOR EACH ROW EXECUTE FUNCTION news_translations_search_vector();
CREATE INDEX "news_translations_search_idx" ON "news_translations" USING GIN ("search_vector");
CREATE INDEX "news_translations_title_trgm_idx" ON "news_translations"
  USING GIN (normalize_he("title") gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- news_history is append-only (rows go only with their item, as for membership_history).
-- ---------------------------------------------------------------------------
CREATE TRIGGER news_history_append_only
  BEFORE UPDATE OR DELETE ON "news_history"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER news_history_no_truncate
  BEFORE TRUNCATE ON "news_history"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
