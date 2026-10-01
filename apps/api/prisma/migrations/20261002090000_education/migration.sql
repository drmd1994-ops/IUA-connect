-- M6 checkpoint 1: education items, courses and their history. See docs/plans/M6-education.md.

-- CreateEnum
CREATE TYPE "education_type" AS ENUM ('VIDEO', 'ARTICLE', 'PDF', 'PRESENTATION', 'PODCAST', 'WEBINAR', 'SURGICAL_VIDEO', 'CASE', 'COURSE');

-- CreateEnum
CREATE TYPE "education_level" AS ENUM ('STUDENT', 'RESIDENT', 'FELLOW', 'SPECIALIST', 'EXPERT');

-- CreateEnum
CREATE TYPE "education_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "video_status" AS ENUM ('NONE', 'EXTERNAL', 'PENDING_PROVIDER');



-- CreateTable
CREATE TABLE "education_items" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "type" "education_type" NOT NULL,
    "status" "education_status" NOT NULL DEFAULT 'DRAFT',
    "level" "education_level",
    "subspecialty_id" UUID,
    "duration_minutes" INTEGER,
    "cme_points" DECIMAL(5,2),
    "external_url" VARCHAR(500),
    "video_status" "video_status" NOT NULL DEFAULT 'NONE',
    "access_tier" "access_tier" NOT NULL DEFAULT 'PUBLIC',
    "cover_file_id" UUID,
    "references" JSONB NOT NULL DEFAULT '[]',
    "author_user_id" UUID,
    "submitted_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "education_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_translations" (
    "item_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "author" VARCHAR(200),

    CONSTRAINT "education_translations_pkey" PRIMARY KEY ("item_id","locale")
);

-- CreateTable
CREATE TABLE "education_files" (
    "item_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "education_files_pkey" PRIMARY KEY ("item_id","file_id")
);

-- CreateTable
CREATE TABLE "course_items" (
    "course_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "course_items_pkey" PRIMARY KEY ("course_id","item_id")
);

-- CreateTable
CREATE TABLE "education_history" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "from_status" "education_status",
    "to_status" "education_status" NOT NULL,
    "actor_user_id" UUID,
    "comment" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "education_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "education_items_slug_key" ON "education_items"("slug");

-- CreateIndex
CREATE INDEX "education_items_status_published_at_idx" ON "education_items"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "education_items_type_level_subspecialty_id_idx" ON "education_items"("type", "level", "subspecialty_id");

-- CreateIndex

-- CreateIndex
CREATE INDEX "education_files_file_id_idx" ON "education_files"("file_id");

-- CreateIndex
CREATE INDEX "course_items_item_id_idx" ON "course_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_items_course_id_position_key" ON "course_items"("course_id", "position");

-- CreateIndex
CREATE INDEX "education_history_item_id_at_idx" ON "education_history"("item_id", "at");

-- AddForeignKey
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_cover_file_id_fkey" FOREIGN KEY ("cover_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_translations" ADD CONSTRAINT "education_translations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "education_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_files" ADD CONSTRAINT "education_files_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "education_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_files" ADD CONSTRAINT "education_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_items" ADD CONSTRAINT "course_items_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "education_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_items" ADD CONSTRAINT "course_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "education_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_history" ADD CONSTRAINT "education_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "education_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_slug_format"
  CHECK ("slug" ~ '^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$');
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_published_has_date"
  CHECK ("status" NOT IN ('PUBLISHED', 'ARCHIVED') OR "published_at" IS NOT NULL);
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_duration"
  CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0);
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_cme_points"
  CHECK ("cme_points" IS NULL OR "cme_points" >= 0);
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_external_url_http"
  CHECK ("external_url" IS NULL OR "external_url" ~ '^https?://');
-- EXTERNAL means there is a link; the other two mean there is none.
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_video_status"
  CHECK (("video_status" = 'EXTERNAL') = ("external_url" IS NOT NULL));
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_references_array"
  CHECK (jsonb_typeof("references") = 'array');
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_version_positive"
  CHECK ("version" > 0);
ALTER TABLE "education_translations" ADD CONSTRAINT "education_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');
ALTER TABLE "education_translations" ADD CONSTRAINT "education_translations_description_length"
  CHECK (length("description") <= 50000);
ALTER TABLE "course_items" ADD CONSTRAINT "course_items_position"
  CHECK ("position" >= 1);
ALTER TABLE "course_items" ADD CONSTRAINT "course_items_not_itself"
  CHECK ("course_id" <> "item_id");

-- A course holds lessons, and a lesson is never a course.
CREATE FUNCTION course_items_check_types() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "type" FROM "education_items" WHERE "id" = NEW.course_id) <> 'COURSE' THEN
    RAISE EXCEPTION 'course_items: % is not a course', NEW.course_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT "type" FROM "education_items" WHERE "id" = NEW.item_id) = 'COURSE' THEN
    RAISE EXCEPTION 'course_items: a course cannot be a lesson'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER course_items_check_types
  BEFORE INSERT OR UPDATE ON "course_items"
  FOR EACH ROW EXECUTE FUNCTION course_items_check_types();

-- ---------------------------------------------------------------------------
-- Search (DATABASE_DESIGN.md §5), as for news. The search API is M7.
-- ---------------------------------------------------------------------------
ALTER TABLE "education_translations" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION education_translations_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.description, ''))), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER education_translations_search_vector
  BEFORE INSERT OR UPDATE OF "title", "description" ON "education_translations"
  FOR EACH ROW EXECUTE FUNCTION education_translations_search_vector();
CREATE INDEX "education_translations_search_idx" ON "education_translations"
  USING GIN ("search_vector");
CREATE INDEX "education_translations_title_trgm_idx" ON "education_translations"
  USING GIN (normalize_he("title") gin_trgm_ops);

-- education_history is append-only (rows go only with their item).
CREATE TRIGGER education_history_append_only
  BEFORE UPDATE OR DELETE ON "education_history"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER education_history_no_truncate
  BEFORE TRUNCATE ON "education_history"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
