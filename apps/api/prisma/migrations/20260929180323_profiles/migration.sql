-- M2 checkpoint 2: member profiles with per-field visibility (D9).
-- See docs/plans/M2-people-membership.md §3.2.

-- CreateEnum
CREATE TYPE "profile_field" AS ENUM ('NAME', 'NAME_HE', 'NAME_EN', 'TITLE', 'POSITION', 'INSTITUTION', 'SUBSPECIALTIES', 'BIO', 'RESEARCH_INTERESTS', 'ORCID', 'LANGUAGES', 'CONTACT_EMAIL', 'CONTACT_PHONE');

-- CreateEnum
CREATE TYPE "visibility" AS ENUM ('PRIVATE', 'MEMBERS', 'PUBLIC');

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "name_he" VARCHAR(200),
    "name_en" VARCHAR(200),
    "title" VARCHAR(100),
    "position" VARCHAR(200),
    "hospital_id" UUID,
    "department_id" UUID,
    "bio" TEXT,
    "research_interests" TEXT,
    "orcid" VARCHAR(19),
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact_email" CITEXT,
    "contact_phone" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "profile_subspecialties" (
    "user_id" UUID NOT NULL,
    "subspecialty_id" UUID NOT NULL,

    CONSTRAINT "profile_subspecialties_pkey" PRIMARY KEY ("user_id","subspecialty_id")
);

-- CreateTable
CREATE TABLE "profile_field_visibility" (
    "user_id" UUID NOT NULL,
    "field" "profile_field" NOT NULL,
    "visibility" "visibility" NOT NULL,

    CONSTRAINT "profile_field_visibility_pkey" PRIMARY KEY ("user_id","field")
);

-- CreateIndex
CREATE INDEX "profiles_department_id_idx" ON "profiles"("department_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_subspecialties" ADD CONSTRAINT "profile_subspecialties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_subspecialties" ADD CONSTRAINT "profile_subspecialties_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_field_visibility" ADD CONSTRAINT "profile_field_visibility_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma can't express (DATABASE_DESIGN.md §1 "Constraints")
-- ---------------------------------------------------------------------------
-- The department must belong to the profile's hospital.
CREATE UNIQUE INDEX "departments_id_hospital_id_key" ON "departments"("id", "hospital_id");
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_department_in_hospital"
  FOREIGN KEY ("department_id", "hospital_id") REFERENCES "departments"("id", "hospital_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_department_needs_hospital"
  CHECK ("department_id" IS NULL OR "hospital_id" IS NOT NULL);
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_orcid_format"
  CHECK ("orcid" IS NULL OR "orcid" ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$');
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_text_lengths"
  CHECK (coalesce(length("bio"), 0) <= 4000 AND coalesce(length("research_interests"), 0) <= 2000
         AND coalesce(array_length("languages", 1), 0) <= 20);
