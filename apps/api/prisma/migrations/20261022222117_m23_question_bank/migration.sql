-- M23: the question bank. Difficulty, references, where a question comes from and who reviewed it;
-- mock exams, bookmarks and reports. (Prisma also wanted to drop the hand-written department
-- constraints of profiles and verification_requests; those lines were removed.)

-- CreateEnum
CREATE TYPE "exam_difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "exam_report_reason" AS ENUM ('WRONG_ANSWER', 'UNCLEAR', 'OUTDATED', 'TYPO', 'OTHER');

-- CreateEnum
CREATE TYPE "exam_report_status" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "exam_answers" ADD COLUMN     "mock_exam_id" UUID;

-- AlterTable
ALTER TABLE "exam_questions" ADD COLUMN     "difficulty" "exam_difficulty",
ADD COLUMN     "references" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by" UUID,
ADD COLUMN     "reviewer_name_en" VARCHAR(200),
ADD COLUMN     "reviewer_name_he" VARCHAR(200),
ADD COLUMN     "source" VARCHAR(500);

-- CreateTable
CREATE TABLE "mock_exams" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "level" "education_level",
    "subspecialty_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "correct" INTEGER,

    CONSTRAINT "mock_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_exam_questions" (
    "exam_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question_id" UUID NOT NULL,
    "chosen_position" INTEGER,
    "answered_at" TIMESTAMPTZ(6),

    CONSTRAINT "mock_exam_questions_pkey" PRIMARY KEY ("exam_id","position")
);

-- CreateTable
CREATE TABLE "exam_bookmarks" (
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_bookmarks_pkey" PRIMARY KEY ("user_id","question_id")
);

-- CreateTable
CREATE TABLE "exam_reports" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" "exam_report_reason" NOT NULL,
    "text" VARCHAR(1000) NOT NULL DEFAULT '',
    "status" "exam_report_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMPTZ(6),
    "handled_by" UUID,
    "response" VARCHAR(1000),

    CONSTRAINT "exam_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mock_exams_user_id_started_at_idx" ON "mock_exams"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "mock_exam_questions_question_id_idx" ON "mock_exam_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "mock_exam_questions_exam_id_question_id_key" ON "mock_exam_questions"("exam_id", "question_id");

-- CreateIndex
CREATE INDEX "exam_bookmarks_question_id_idx" ON "exam_bookmarks"("question_id");

-- CreateIndex
CREATE INDEX "exam_reports_status_created_at_idx" ON "exam_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "exam_reports_question_id_idx" ON "exam_reports"("question_id");

-- CreateIndex
CREATE INDEX "exam_reports_user_id_idx" ON "exam_reports"("user_id");

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_mock_exam_id_fkey" FOREIGN KEY ("mock_exam_id") REFERENCES "mock_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_questions" ADD CONSTRAINT "mock_exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "mock_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_questions" ADD CONSTRAINT "mock_exam_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_bookmarks" ADD CONSTRAINT "exam_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_bookmarks" ADD CONSTRAINT "exam_bookmarks_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_reports" ADD CONSTRAINT "exam_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_reports" ADD CONSTRAINT "exam_reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
