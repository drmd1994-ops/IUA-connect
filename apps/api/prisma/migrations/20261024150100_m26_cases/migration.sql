-- M26: clinical cases, their pictures, poll, reports and review history.
-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'RETURNED', 'PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "case_age_range" AS ENUM ('UNDER_18', 'FROM_18_TO_39', 'FROM_40_TO_64', 'FROM_65_TO_79', 'OVER_80');

-- CreateEnum
CREATE TYPE "case_sex" AS ENUM ('FEMALE', 'MALE', 'NOT_STATED');

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "author_id" UUID,
    "subspecialty_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "age_range" "case_age_range" NOT NULL,
    "sex" "case_sex" NOT NULL,
    "history" VARCHAR(5000) NOT NULL,
    "examination" VARCHAR(3000),
    "labs" VARCHAR(3000),
    "imaging" VARCHAR(3000),
    "pathology" VARCHAR(3000),
    "management" VARCHAR(3000),
    "question" VARCHAR(1000) NOT NULL,
    "status" "case_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" VARCHAR(1000),
    "published_at" TIMESTAMPTZ(6),
    "post_id" UUID,
    "week_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_files" (
    "case_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_files_pkey" PRIMARY KEY ("case_id","file_id")
);

-- CreateTable
CREATE TABLE "case_poll_options" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" VARCHAR(200) NOT NULL,

    CONSTRAINT "case_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_votes" (
    "case_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "case_votes_pkey" PRIMARY KEY ("case_id","user_id")
);

-- CreateTable
CREATE TABLE "case_reports" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "reporter_id" UUID,
    "reason" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "case_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_history" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "from_status" "case_status",
    "to_status" "case_status" NOT NULL,
    "actor_user_id" UUID,
    "note" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cases_post_id_key" ON "cases"("post_id");

-- CreateIndex
CREATE INDEX "cases_status_published_at_idx" ON "cases"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "cases_subspecialty_id_status_idx" ON "cases"("subspecialty_id", "status");

-- CreateIndex
CREATE INDEX "cases_author_id_idx" ON "cases"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_files_file_id_key" ON "case_files"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_poll_options_case_id_position_key" ON "case_poll_options"("case_id", "position");

-- CreateIndex
CREATE INDEX "case_reports_case_id_closed_at_idx" ON "case_reports"("case_id", "closed_at");

-- CreateIndex
CREATE INDEX "case_history_case_id_at_idx" ON "case_history"("case_id", "at");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_poll_options" ADD CONSTRAINT "case_poll_options_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_votes" ADD CONSTRAINT "case_votes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_votes" ADD CONSTRAINT "case_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "case_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_votes" ADD CONSTRAINT "case_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_reports" ADD CONSTRAINT "case_reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_reports" ADD CONSTRAINT "case_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: a poll has at most 4 options, in positions 1 to 4.
ALTER TABLE "case_poll_options" ADD CONSTRAINT "case_poll_options_position"
  CHECK ("position" BETWEEN 1 AND 4);
