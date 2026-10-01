-- M6 checkpoint 4: the exam question demo. See docs/plans/M6-education.md §2.10.



-- CreateTable
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL,
    "status" "education_status" NOT NULL DEFAULT 'DRAFT',
    "level" "education_level",
    "subspecialty_id" UUID,
    "access_tier" "access_tier" NOT NULL DEFAULT 'PUBLIC',
    "author_user_id" UUID,
    "submitted_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_translations" (
    "question_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "stem" VARCHAR(4000) NOT NULL,
    "summary" VARCHAR(4000) NOT NULL,

    CONSTRAINT "exam_question_translations_pkey" PRIMARY KEY ("question_id","locale")
);

-- CreateTable
CREATE TABLE "exam_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exam_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_option_translations" (
    "option_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "explanation" VARCHAR(4000) NOT NULL,

    CONSTRAINT "exam_option_translations_pkey" PRIMARY KEY ("option_id","locale")
);

-- CreateTable
CREATE TABLE "exam_question_history" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "from_status" "education_status",
    "to_status" "education_status" NOT NULL,
    "actor_user_id" UUID,
    "comment" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_question_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "counts" BOOLEAN NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_questions_status_level_subspecialty_id_idx" ON "exam_questions"("status", "level", "subspecialty_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_options_question_id_position_key" ON "exam_options"("question_id", "position");

-- CreateIndex
CREATE INDEX "exam_question_history_question_id_at_idx" ON "exam_question_history"("question_id", "at");

-- CreateIndex
CREATE INDEX "exam_answers_user_id_at_idx" ON "exam_answers"("user_id", "at" DESC);

-- CreateIndex
CREATE INDEX "exam_answers_question_id_idx" ON "exam_answers"("question_id");

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_translations" ADD CONSTRAINT "exam_question_translations_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_options" ADD CONSTRAINT "exam_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_option_translations" ADD CONSTRAINT "exam_option_translations_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "exam_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_history" ADD CONSTRAINT "exam_question_history_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- Exactly one right option per question: at most one by this index; "at least one" is checked
-- before a question is submitted for review.
CREATE UNIQUE INDEX "exam_options_one_correct" ON "exam_options" ("question_id")
  WHERE "is_correct";
ALTER TABLE "exam_options" ADD CONSTRAINT "exam_options_position"
  CHECK ("position" BETWEEN 1 AND 6);
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_published_has_date"
  CHECK ("status" NOT IN ('PUBLISHED', 'ARCHIVED') OR "published_at" IS NOT NULL);
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_version_positive"
  CHECK ("version" > 0);
ALTER TABLE "exam_question_translations" ADD CONSTRAINT "exam_question_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');
ALTER TABLE "exam_option_translations" ADD CONSTRAINT "exam_option_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_position"
  CHECK ("position" BETWEEN 1 AND 6);
-- One answer per person per question counts for the score: the first.
CREATE UNIQUE INDEX "exam_answers_one_counts" ON "exam_answers" ("user_id", "question_id")
  WHERE "counts";

-- exam_question_history is append-only (rows go only with their question).
CREATE TRIGGER exam_question_history_append_only
  BEFORE UPDATE OR DELETE ON "exam_question_history"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER exam_question_history_no_truncate
  BEFORE TRUNCATE ON "exam_question_history"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
