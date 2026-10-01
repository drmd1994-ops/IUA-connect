-- M5 checkpoint 1: events with categories and translations. See docs/plans/M5-events.md.

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "registration_mode" AS ENUM ('INTERNAL', 'EXTERNAL', 'NONE');



-- CreateTable
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "category_id" UUID,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jerusalem',
    "location_name" VARCHAR(300),
    "address" VARCHAR(500),
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "organizer" VARCHAR(300),
    "image_file_id" UUID,
    "registration_mode" "registration_mode" NOT NULL DEFAULT 'NONE',
    "registration_url" VARCHAR(500),
    "capacity" INTEGER,
    "cme_available" BOOLEAN NOT NULL DEFAULT false,
    "access_tier" "access_tier" NOT NULL DEFAULT 'PUBLIC',
    "source_url" VARCHAR(500),
    "published_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" VARCHAR(1000),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_translations" (
    "event_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" VARCHAR(1000),
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "event_translations_pkey" PRIMARY KEY ("event_id","locale")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_key_key" ON "event_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "events_source_url_key" ON "events"("source_url");

-- CreateIndex
CREATE INDEX "events_status_start_at_idx" ON "events"("status", "start_at");

-- CreateIndex

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
ALTER TABLE "events" ADD CONSTRAINT "events_slug_format"
  CHECK ("slug" ~ '^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$');
-- A published or cancelled event has its dates; only a draft may lack them.
ALTER TABLE "events" ADD CONSTRAINT "events_dates_unless_draft"
  CHECK ("status" = 'DRAFT' OR ("start_at" IS NOT NULL AND "end_at" IS NOT NULL));
ALTER TABLE "events" ADD CONSTRAINT "events_end_after_start"
  CHECK ("start_at" IS NULL OR "end_at" IS NULL OR "end_at" > "start_at");
ALTER TABLE "events" ADD CONSTRAINT "events_capacity_positive"
  CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "events" ADD CONSTRAINT "events_external_has_url"
  CHECK ("registration_mode" <> 'EXTERNAL' OR "registration_url" IS NOT NULL);
ALTER TABLE "events" ADD CONSTRAINT "events_registration_url_http"
  CHECK ("registration_url" IS NULL OR "registration_url" ~ '^https?://');
ALTER TABLE "events" ADD CONSTRAINT "events_coordinates"
  CHECK (("lat" IS NULL) = ("lng" IS NULL)
    AND ("lat" IS NULL OR ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180)));
ALTER TABLE "events" ADD CONSTRAINT "events_published_has_date"
  CHECK ("status" = 'DRAFT' OR "published_at" IS NOT NULL);
ALTER TABLE "events" ADD CONSTRAINT "events_cancelled_has_date"
  CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "events" ADD CONSTRAINT "events_version_positive" CHECK ("version" > 0);
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_description_length"
  CHECK (length("description") <= 50000);
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_key_format"
  CHECK ("key" ~ '^[a-z0-9_]+$');

-- ---------------------------------------------------------------------------
-- Search (DATABASE_DESIGN.md §5), as for news. The search API is M7.
-- ---------------------------------------------------------------------------
ALTER TABLE "event_translations" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION event_translations_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.summary, ''))), 'B') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.description, ''))), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_translations_search_vector
  BEFORE INSERT OR UPDATE OF "title", "summary", "description" ON "event_translations"
  FOR EACH ROW EXECUTE FUNCTION event_translations_search_vector();
CREATE INDEX "event_translations_search_idx" ON "event_translations" USING GIN ("search_vector");
CREATE INDEX "event_translations_title_trgm_idx" ON "event_translations"
  USING GIN (normalize_he("title") gin_trgm_ops);
