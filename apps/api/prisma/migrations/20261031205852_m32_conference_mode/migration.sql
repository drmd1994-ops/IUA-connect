-- CreateEnum
CREATE TYPE "session_staff_role" AS ENUM ('CHAIR', 'MODERATOR');

-- CreateEnum
CREATE TYPE "poll_status" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "session_question_status" AS ENUM ('PENDING', 'VISIBLE', 'ANSWERED', 'HIDDEN');




-- AlterTable
ALTER TABLE "event_sessions" ADD COLUMN     "allow_anonymous_questions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moderate_questions" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "guest_code" VARCHAR(64),
ADD COLUMN     "guest_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guest_entry_from" TIMESTAMPTZ(6),
ADD COLUMN     "guest_entry_until" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "event_guests" (
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_guests_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "session_staff" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "session_staff_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_staff_pkey" PRIMARY KEY ("session_id","user_id","role")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "status" "poll_status" NOT NULL DEFAULT 'DRAFT',
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "votes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_voters" (
    "poll_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "poll_voters_pkey" PRIMARY KEY ("poll_id","user_id")
);

-- CreateTable
CREATE TABLE "session_questions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "author_id" UUID,
    "text" VARCHAR(500) NOT NULL,
    "status" "session_question_status" NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "answered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_question_votes" (
    "question_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "session_question_votes_pkey" PRIMARY KEY ("question_id","user_id")
);

-- CreateTable
CREATE TABLE "session_feedback" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),

    CONSTRAINT "session_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_feedback_given" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "session_feedback_given_pkey" PRIMARY KEY ("session_id","user_id")
);

-- CreateTable
CREATE TABLE "session_reminders" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_reminders_pkey" PRIMARY KEY ("session_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_guests_event_id_number_key" ON "event_guests"("event_id", "number");

-- CreateIndex
CREATE INDEX "session_staff_user_id_idx" ON "session_staff"("user_id");

-- CreateIndex
CREATE INDEX "polls_session_id_status_idx" ON "polls"("session_id", "status");

-- CreateIndex
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options"("poll_id");

-- CreateIndex
CREATE INDEX "poll_voters_user_id_idx" ON "poll_voters"("user_id");

-- CreateIndex
CREATE INDEX "session_questions_session_id_status_idx" ON "session_questions"("session_id", "status");

-- CreateIndex
CREATE INDEX "session_questions_author_id_idx" ON "session_questions"("author_id");

-- CreateIndex
CREATE INDEX "session_question_votes_user_id_idx" ON "session_question_votes"("user_id");

-- CreateIndex
CREATE INDEX "session_feedback_session_id_idx" ON "session_feedback"("session_id");

-- CreateIndex
CREATE INDEX "session_feedback_given_user_id_idx" ON "session_feedback_given"("user_id");

-- CreateIndex
CREATE INDEX "session_reminders_user_id_idx" ON "session_reminders"("user_id");

-- AddForeignKey
ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_staff" ADD CONSTRAINT "session_staff_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_staff" ADD CONSTRAINT "session_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_voters" ADD CONSTRAINT "poll_voters_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_voters" ADD CONSTRAINT "poll_voters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_question_votes" ADD CONSTRAINT "session_question_votes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "session_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_question_votes" ADD CONSTRAINT "session_question_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_feedback_given" ADD CONSTRAINT "session_feedback_given_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_feedback_given" ADD CONSTRAINT "session_feedback_given_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reminders" ADD CONSTRAINT "session_reminders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reminders" ADD CONSTRAINT "session_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
