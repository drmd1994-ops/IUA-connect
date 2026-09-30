-- M2 checkpoint 6: CSV membership import (dry run, then apply) and the account-setup link.
-- See docs/plans/M2-people-membership.md §3.6.

-- CreateEnum
CREATE TYPE "import_batch_status" AS ENUM ('DRY_RUN', 'APPLIED');

-- AlterEnum
ALTER TYPE "auth_token_purpose" ADD VALUE 'ACCOUNT_SETUP';

-- AlterEnum
ALTER TYPE "membership_event" ADD VALUE 'IMPORTED';

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "created_by" UUID,
    "file_name" VARCHAR(255),
    "content_hash" VARCHAR(128) NOT NULL,
    "status" "import_batch_status" NOT NULL DEFAULT 'DRY_RUN',
    "report" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),
    "applied_by" UUID,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_created_at_idx" ON "import_batches"("created_at");

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_applied"
  CHECK (("status" = 'APPLIED') = ("applied_at" IS NOT NULL));
