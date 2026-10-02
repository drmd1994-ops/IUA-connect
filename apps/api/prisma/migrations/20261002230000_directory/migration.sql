-- M7 checkpoint 4: the opt-in member directory and the consent behind it.

-- CreateEnum
CREATE TYPE "consent_kind" AS ENUM ('TERMS', 'PRIVACY', 'DIRECTORY', 'EMAIL_MARKETING');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "directory_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "consent_kind" NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(6),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consents_user_id_kind_granted_at_idx" ON "consents"("user_id", "kind", "granted_at" DESC);

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- At most one consent of a kind is in force for a person at a time.
CREATE UNIQUE INDEX "consents_one_in_force" ON "consents" ("user_id", "kind")
  WHERE "withdrawn_at" IS NULL;
ALTER TABLE "consents" ADD CONSTRAINT "consents_withdrawn_after_granted"
  CHECK ("withdrawn_at" IS NULL OR "withdrawn_at" >= "granted_at");
-- The directory lists few rows; this keeps finding them cheap as profiles grow.
CREATE INDEX "profiles_directory_idx" ON "profiles" ("last_name", "first_name")
  WHERE "directory_opt_in";
