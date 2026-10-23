-- M28: jobs, fellowships and research posts, with their review and saving; mentors and mentorship
-- requests. (Prisma also wanted to drop the hand-written department constraints of profiles and
-- verification_requests; those lines were removed.)

-- CreateEnum
CREATE TYPE "position_kind" AS ENUM ('JOB', 'FELLOWSHIP', 'RESEARCH');

-- CreateEnum
CREATE TYPE "position_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "position_audience" AS ENUM ('ANYONE', 'SPECIALISTS', 'RESIDENTS', 'STUDENTS');

-- CreateEnum
CREATE TYPE "mentorship_state" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'ENDED');

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "kind" "position_kind" NOT NULL,
    "status" "position_status" NOT NULL DEFAULT 'DRAFT',
    "organisation_id" UUID,
    "hospital_id" UUID,
    "department_id" UUID,
    "institution_name" VARCHAR(200),
    "city" VARCHAR(100),
    "country" CHAR(2) NOT NULL DEFAULT 'IL',
    "audience" "position_audience" NOT NULL DEFAULT 'ANYONE',
    "apply_url" VARCHAR(500),
    "apply_email" CITEXT,
    "closes_on" DATE NOT NULL,
    "author_user_id" UUID,
    "submitted_by" UUID,
    "reviewed_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_translations" (
    "position_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "position_translations_pkey" PRIMARY KEY ("position_id","locale")
);

-- CreateTable
CREATE TABLE "position_subspecialties" (
    "position_id" UUID NOT NULL,
    "subspecialty_id" UUID NOT NULL,

    CONSTRAINT "position_subspecialties_pkey" PRIMARY KEY ("position_id","subspecialty_id")
);

-- CreateTable
CREATE TABLE "position_history" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "from_status" "position_status",
    "to_status" "position_status" NOT NULL,
    "actor_user_id" UUID,
    "comment" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_positions" (
    "user_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_positions_pkey" PRIMARY KEY ("user_id","position_id")
);

-- CreateTable
CREATE TABLE "mentor_profiles" (
    "user_id" UUID NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "academic_interests" VARCHAR(1000) NOT NULL DEFAULT '',
    "career_interests" VARCHAR(1000) NOT NULL DEFAULT '',
    "availability" VARCHAR(300) NOT NULL DEFAULT '',
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mentor_subspecialties" (
    "user_id" UUID NOT NULL,
    "subspecialty_id" UUID NOT NULL,

    CONSTRAINT "mentor_subspecialties_pkey" PRIMARY KEY ("user_id","subspecialty_id")
);

-- CreateTable
CREATE TABLE "mentorships" (
    "id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "mentee_id" UUID NOT NULL,
    "state" "mentorship_state" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "conversation_id" UUID,

    CONSTRAINT "mentorships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_status_closes_on_idx" ON "positions"("status", "closes_on");

-- CreateIndex
CREATE INDEX "positions_organisation_id_idx" ON "positions"("organisation_id");

-- CreateIndex
CREATE INDEX "positions_department_id_idx" ON "positions"("department_id");

-- CreateIndex
CREATE INDEX "position_subspecialties_subspecialty_id_idx" ON "position_subspecialties"("subspecialty_id");

-- CreateIndex
CREATE INDEX "position_history_position_id_at_idx" ON "position_history"("position_id", "at");

-- CreateIndex
CREATE INDEX "saved_positions_position_id_idx" ON "saved_positions"("position_id");

-- CreateIndex
CREATE INDEX "mentor_subspecialties_subspecialty_id_idx" ON "mentor_subspecialties"("subspecialty_id");

-- CreateIndex
CREATE INDEX "mentorships_mentor_id_state_idx" ON "mentorships"("mentor_id", "state");

-- CreateIndex
CREATE INDEX "mentorships_mentee_id_state_idx" ON "mentorships"("mentee_id", "state");

-- CreateIndex
CREATE INDEX "mentorships_state_created_at_idx" ON "mentorships"("state", "created_at");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_translations" ADD CONSTRAINT "position_translations_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_subspecialties" ADD CONSTRAINT "position_subspecialties_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_subspecialties" ADD CONSTRAINT "position_subspecialties_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_positions" ADD CONSTRAINT "saved_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_positions" ADD CONSTRAINT "saved_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_subspecialties" ADD CONSTRAINT "mentor_subspecialties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "mentor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_subspecialties" ADD CONSTRAINT "mentor_subspecialties_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Written by hand (Prisma does not model these; keep them out of later generated migrations).

-- A position's department belongs to its hospital, and a department needs a hospital.
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_in_hospital"
  FOREIGN KEY ("department_id", "hospital_id") REFERENCES "departments"("id", "hospital_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_needs_hospital"
  CHECK ("department_id" IS NULL OR "hospital_id" IS NOT NULL);
-- The place is a hospital from the list or an institution named as text, never both.
ALTER TABLE "positions" ADD CONSTRAINT "positions_one_place"
  CHECK (("hospital_id" IS NULL) <> ("institution_name" IS NULL));
ALTER TABLE "positions" ADD CONSTRAINT "positions_country_code"
  CHECK ("country" ~ '^[A-Z]{2}$');
-- A way to apply.
ALTER TABLE "positions" ADD CONSTRAINT "positions_how_to_apply"
  CHECK ("apply_url" IS NOT NULL OR "apply_email" IS NOT NULL);

ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_capacity"
  CHECK ("capacity" BETWEEN 1 AND 10);

-- One open request or mentorship between a mentor and a mentee.
CREATE UNIQUE INDEX "mentorships_one_open_per_pair" ON "mentorships"("mentor_id", "mentee_id")
  WHERE "state" IN ('PENDING', 'ACCEPTED');
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_not_self"
  CHECK ("mentor_id" <> "mentee_id");
