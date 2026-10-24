-- M31: the journal club: entries, their anonymous poll and their review history.

-- CreateEnum
CREATE TYPE "journal_club_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "journal_club_answer" AS ENUM ('YES', 'PERHAPS', 'NO');

-- CreateTable
CREATE TABLE "journal_club_entries" (
    "id" UUID NOT NULL,
    "subspecialty_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "article_title" VARCHAR(500) NOT NULL,
    "article_authors" VARCHAR(2000) NOT NULL DEFAULT '',
    "journal" VARCHAR(300),
    "year" INTEGER,
    "doi" VARCHAR(200),
    "pmid" VARCHAR(12),
    "summary" VARCHAR(5000) NOT NULL,
    "summary_author_id" UUID,
    "commentary" VARCHAR(5000),
    "commentary_author_id" UUID,
    "key_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "journal_club_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "submitted_by" UUID,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "post_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "journal_club_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_club_votes" (
    "entry_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answer" "journal_club_answer" NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "journal_club_votes_pkey" PRIMARY KEY ("entry_id","user_id")
);

-- CreateTable
CREATE TABLE "journal_club_history" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "from_status" "journal_club_status",
    "to_status" "journal_club_status" NOT NULL,
    "actor_user_id" UUID,
    "comment" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_club_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_club_entries_post_id_key" ON "journal_club_entries"("post_id");

-- CreateIndex
CREATE INDEX "journal_club_entries_status_month_idx" ON "journal_club_entries"("status", "month" DESC);

-- CreateIndex
CREATE INDEX "journal_club_entries_subspecialty_id_month_idx" ON "journal_club_entries"("subspecialty_id", "month" DESC);

-- CreateIndex
CREATE INDEX "journal_club_history_entry_id_at_idx" ON "journal_club_history"("entry_id", "at");

-- AddForeignKey
ALTER TABLE "journal_club_entries" ADD CONSTRAINT "journal_club_entries_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_club_entries" ADD CONSTRAINT "journal_club_entries_summary_author_id_fkey" FOREIGN KEY ("summary_author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_club_entries" ADD CONSTRAINT "journal_club_entries_commentary_author_id_fkey" FOREIGN KEY ("commentary_author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_club_entries" ADD CONSTRAINT "journal_club_entries_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_club_votes" ADD CONSTRAINT "journal_club_votes_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_club_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_club_votes" ADD CONSTRAINT "journal_club_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_club_history" ADD CONSTRAINT "journal_club_history_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_club_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: a sensible year, a known language, a month written as its first day.
ALTER TABLE "journal_club_entries" ADD CONSTRAINT "journal_club_entries_year"
  CHECK ("year" IS NULL OR "year" BETWEEN 1900 AND 2100);
ALTER TABLE "journal_club_entries" ADD CONSTRAINT "journal_club_entries_locale"
  CHECK ("locale" IN ('he', 'en'));
ALTER TABLE "journal_club_entries" ADD CONSTRAINT "journal_club_entries_month"
  CHECK (EXTRACT(DAY FROM "month") = 1);
