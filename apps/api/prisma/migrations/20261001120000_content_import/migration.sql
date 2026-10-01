-- M4: content import. See docs/plans/M4-content-import.md §5 and §11.7.

-- The source states only a year for some documents: show the year, not an invented day and month.
ALTER TABLE "guideline_versions" ADD COLUMN     "year_only" BOOLEAN NOT NULL DEFAULT false;

-- Imported guideline entries: the page of the source site the entry was read from.
ALTER TABLE "guidelines" ADD COLUMN     "source_url" VARCHAR(500);

-- One document of one source page is one entry (makes the import idempotent).
CREATE UNIQUE INDEX "guidelines_source_url_official_url_key" ON "guidelines"("source_url", "official_url");

-- One source page is one news item.
CREATE UNIQUE INDEX "news_source_url_key" ON "news"("source_url");

ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_source_url_http"
  CHECK ("source_url" IS NULL OR "source_url" ~ '^https?://');
