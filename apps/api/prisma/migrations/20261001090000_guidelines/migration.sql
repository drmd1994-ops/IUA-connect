-- M3 checkpoint 6: guidelines (metadata, official links, versions, IUA summaries).
-- See docs/plans/M3-content-core.md §2.6 and §11.7. Third-party documents are never copied.

-- CreateEnum
CREATE TYPE "guideline_status" AS ENUM ('CURRENT', 'SUPERSEDED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "guidelines" (
    "id" UUID NOT NULL,
    "source_org" VARCHAR(200) NOT NULL,
    "official_url" VARCHAR(500) NOT NULL,
    "evidence_level" VARCHAR(100),
    "status" "guideline_status" NOT NULL DEFAULT 'CURRENT',
    "subspecialty_id" UUID,
    "access_tier" "access_tier" NOT NULL DEFAULT 'PUBLIC',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guidelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guideline_translations" (
    "guideline_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" VARCHAR(4000),

    CONSTRAINT "guideline_translations_pkey" PRIMARY KEY ("guideline_id","locale")
);

-- CreateTable
CREATE TABLE "guideline_versions" (
    "id" UUID NOT NULL,
    "guideline_id" UUID NOT NULL,
    "version" VARCHAR(60) NOT NULL,
    "published_on" DATE NOT NULL,
    "url" VARCHAR(500),
    "license_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guideline_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guidelines_status_idx" ON "guidelines"("status");

-- CreateIndex
CREATE INDEX "guidelines_subspecialty_id_idx" ON "guidelines"("subspecialty_id");

-- CreateIndex
CREATE INDEX "guideline_versions_guideline_id_published_on_idx" ON "guideline_versions"("guideline_id", "published_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "guideline_versions_guideline_id_version_key" ON "guideline_versions"("guideline_id", "version");

-- AddForeignKey
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guideline_translations" ADD CONSTRAINT "guideline_translations_guideline_id_fkey" FOREIGN KEY ("guideline_id") REFERENCES "guidelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guideline_versions" ADD CONSTRAINT "guideline_versions_guideline_id_fkey" FOREIGN KEY ("guideline_id") REFERENCES "guidelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_official_url_http"
  CHECK ("official_url" ~ '^https?://');
ALTER TABLE "guideline_versions" ADD CONSTRAINT "guideline_versions_url_http"
  CHECK ("url" IS NULL OR "url" ~ '^https?://');
ALTER TABLE "guideline_translations" ADD CONSTRAINT "guideline_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');

-- ---------------------------------------------------------------------------
-- Search (DATABASE_DESIGN.md §5), as for news: a vector per translation kept current by a
-- trigger over the Hebrew-normalised text; trigram index on titles. The search API is M7.
-- ---------------------------------------------------------------------------
ALTER TABLE "guideline_translations" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION guideline_translations_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.summary, ''))), 'B');
  RETURN NEW;
END;
$$;
CREATE TRIGGER guideline_translations_search_vector
  BEFORE INSERT OR UPDATE OF "title", "summary" ON "guideline_translations"
  FOR EACH ROW EXECUTE FUNCTION guideline_translations_search_vector();
CREATE INDEX "guideline_translations_search_idx" ON "guideline_translations" USING GIN ("search_vector");
CREATE INDEX "guideline_translations_title_trgm_idx" ON "guideline_translations"
  USING GIN (normalize_he("title") gin_trgm_ops);
