-- M17 step 3: the platform verifies physicians and medical students by itself
-- (docs/plans/M17-verification-and-onboarding.md §4, §10). Until now only an organisation could
-- make an account verified, by accepting or importing the person. Additions and one backfill;
-- nothing is deleted.

-- All of it, or none of it.
BEGIN;

-- CreateEnum
CREATE TYPE "verified_as" AS ENUM ('SPECIALIST', 'RESIDENT', 'PHYSICIAN', 'STUDENT');

-- CreateEnum
CREATE TYPE "physician_verification_state" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "physician_decision" AS ENUM ('APPROVE', 'REJECT', 'REVOKE');

-- CreateEnum
CREATE TYPE "register_status" AS ENUM ('ACTIVE_PERMANENT', 'ACTIVE_TEMPORARY', 'SUSPENDED', 'NOT_FOUND');

-- AlterEnum
ALTER TYPE "file_purpose" ADD VALUE 'VERIFICATION';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "verified_as" "verified_as",
ADD COLUMN     "verified_until" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "medical_schools" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "medical_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physician_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "verified_as" NOT NULL,
    "state" "physician_verification_state" NOT NULL DEFAULT 'PENDING',
    "licence_enc" TEXT,
    "licence_hash" VARCHAR(128),
    "certificate_enc" TEXT,
    "certificate_hash" VARCHAR(128),
    "school_id" UUID,
    "expected_graduation" DATE,
    "document_file_id" UUID,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "physician_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physician_verification_decisions" (
    "id" UUID NOT NULL,
    "verification_id" UUID NOT NULL,
    "decision" "physician_decision" NOT NULL,
    "decided_by" UUID,
    "reason" VARCHAR(1000),
    "register_status" "register_status",
    "licence_matches" BOOLEAN,
    "certificate_matches" BOOLEAN,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physician_verification_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_schools_code_key" ON "medical_schools"("code");

-- CreateIndex
CREATE UNIQUE INDEX "physician_verifications_document_file_id_key" ON "physician_verifications"("document_file_id");

-- CreateIndex
CREATE INDEX "physician_verifications_state_created_at_idx" ON "physician_verifications"("state", "created_at");

-- CreateIndex
CREATE INDEX "physician_verifications_user_id_idx" ON "physician_verifications"("user_id");

-- CreateIndex
CREATE INDEX "physician_verification_decisions_verification_id_at_idx" ON "physician_verification_decisions"("verification_id", "at");

-- AddForeignKey
ALTER TABLE "physician_verifications" ADD CONSTRAINT "physician_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physician_verifications" ADD CONSTRAINT "physician_verifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "medical_schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physician_verifications" ADD CONSTRAINT "physician_verifications_document_file_id_fkey" FOREIGN KEY ("document_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physician_verification_decisions" ADD CONSTRAINT "physician_verification_decisions_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "physician_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- What everyone verified so far is known as, from the membership that verified them: the
-- strongest, when there are several. The types' keys STUDENT and RESIDENT carry that meaning.
UPDATE "users" u SET "verified_as" = best."as"
FROM (
  SELECT m."user_id",
         (ARRAY_AGG(
            CASE
              WHEN t."identifier" = 'SPECIALIST_CERTIFICATE' THEN 'SPECIALIST'
              WHEN t."key" = 'RESIDENT' THEN 'RESIDENT'
              WHEN t."key" = 'STUDENT' THEN 'STUDENT'
              ELSE 'PHYSICIAN'
            END::"verified_as"
            ORDER BY CASE
              WHEN t."identifier" = 'SPECIALIST_CERTIFICATE' THEN 1
              WHEN t."key" = 'RESIDENT' THEN 3
              WHEN t."key" = 'STUDENT' THEN 4
              ELSE 2
            END))[1] AS "as"
  FROM "memberships" m JOIN "membership_types" t ON t."id" = m."type_id"
  GROUP BY m."user_id"
) best
WHERE best."user_id" = u."id" AND u."verified_at" IS NOT NULL;
-- Verified some other way (by hand, in a test database): a physician.
UPDATE "users" SET "verified_as" = 'PHYSICIAN' WHERE "verified_at" IS NOT NULL AND "verified_as" IS NULL;

-- Verified and known as something go together.
ALTER TABLE "users" ADD CONSTRAINT "users_verified_as_with_verified_at"
  CHECK (("verified_at" IS NULL) = ("verified_as" IS NULL));

-- One open request per person. A licence number is in one open request at most, and in one
-- approved request at most (a person renewing has both, with the same number; the service keeps
-- two people from sharing one).
CREATE UNIQUE INDEX "physician_verifications_one_open_per_user"
  ON "physician_verifications"("user_id") WHERE "state" = 'PENDING';
CREATE UNIQUE INDEX "physician_verifications_one_open_per_licence"
  ON "physician_verifications"("licence_hash")
  WHERE "licence_hash" IS NOT NULL AND "state" = 'PENDING';
CREATE UNIQUE INDEX "physician_verifications_one_approved_per_licence"
  ON "physician_verifications"("licence_hash")
  WHERE "licence_hash" IS NOT NULL AND "state" = 'APPROVED';

-- A physician gives a licence number; a specialist a certificate too; a student a school and a
-- graduation date, and no licence.
ALTER TABLE "physician_verifications" ADD CONSTRAINT "physician_verifications_what_is_given"
  CHECK (
    CASE "kind"
      WHEN 'STUDENT' THEN "licence_hash" IS NULL AND "school_id" IS NOT NULL
                          AND "expected_graduation" IS NOT NULL
      WHEN 'SPECIALIST' THEN "licence_hash" IS NOT NULL AND "certificate_hash" IS NOT NULL
      ELSE "licence_hash" IS NOT NULL
    END
  );

COMMIT;
