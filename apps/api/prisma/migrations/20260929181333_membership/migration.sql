-- M2 checkpoint 3: memberships, their history, applications and decisions.
-- See docs/plans/M2-people-membership.md §4–5 and ARCHITECTURE.md §7.

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('NOT_REQUIRED', 'UNPAID', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "membership_source" AS ENUM ('MANUAL', 'IMPORT', 'IMA');

-- CreateEnum
CREATE TYPE "membership_event" AS ENUM ('CREATED', 'RENEWED', 'SUSPENDED', 'REINSTATED', 'EXPIRED', 'TYPE_CHANGED', 'PAYMENT_STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "verification_state" AS ENUM ('PENDING_DIRECTOR', 'PENDING_ADMIN', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "verification_stage" AS ENUM ('DIRECTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "verification_outcome" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "payment_status" "payment_status" NOT NULL DEFAULT 'NOT_REQUIRED',
    "source" "membership_source" NOT NULL DEFAULT 'MANUAL',
    "identifier_enc" TEXT,
    "identifier_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_history" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "event" "membership_event" NOT NULL,
    "from_status" VARCHAR(32),
    "to_status" VARCHAR(32),
    "details" JSONB,
    "changed_by" UUID,
    "reason" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "hospital_id" UUID,
    "department_id" UUID,
    "state" "verification_state" NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "identifier_enc" TEXT,
    "identifier_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_decisions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "stage" "verification_stage" NOT NULL,
    "decision" "verification_outcome" NOT NULL,
    "decided_by" UUID,
    "reason" VARCHAR(1000),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_key" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_identifier_hash_key" ON "memberships"("identifier_hash");

-- CreateIndex
CREATE INDEX "memberships_status_end_date_idx" ON "memberships"("status", "end_date");

-- CreateIndex
CREATE INDEX "membership_history_membership_id_at_idx" ON "membership_history"("membership_id", "at");

-- CreateIndex
CREATE INDEX "verification_requests_state_department_id_idx" ON "verification_requests"("state", "department_id");

-- CreateIndex
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

-- CreateIndex
CREATE INDEX "verification_decisions_request_id_at_idx" ON "verification_decisions"("request_id", "at");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "membership_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "membership_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_decisions" ADD CONSTRAINT "verification_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "verification_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma can't express (DATABASE_DESIGN.md §1 "Constraints")
-- ---------------------------------------------------------------------------
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_dates"
  CHECK ("end_date" >= "start_date");
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_identifier_pair"
  CHECK (("identifier_enc" IS NULL) = ("identifier_hash" IS NULL));

ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_identifier_pair"
  CHECK (("identifier_enc" IS NULL) = ("identifier_hash" IS NULL));
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_flags"
  CHECK ("flags" <@ ARRAY['NO_DIRECTOR', 'APPLICANT_IS_DIRECTOR']::text[]);
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_closed"
  CHECK (("state" IN ('PENDING_DIRECTOR', 'PENDING_ADMIN')) = ("closed_at" IS NULL));
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_department_needs_hospital"
  CHECK ("department_id" IS NULL OR "hospital_id" IS NOT NULL);
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_department_in_hospital"
  FOREIGN KEY ("department_id", "hospital_id") REFERENCES "departments"("id", "hospital_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
-- One open application per user, and one open application per identifier.
CREATE UNIQUE INDEX "verification_requests_one_open_per_user" ON "verification_requests"("user_id")
  WHERE "state" IN ('PENDING_DIRECTOR', 'PENDING_ADMIN');
CREATE UNIQUE INDEX "verification_requests_one_open_per_identifier"
  ON "verification_requests"("identifier_hash")
  WHERE "state" IN ('PENDING_DIRECTOR', 'PENDING_ADMIN') AND "identifier_hash" IS NOT NULL;

ALTER TABLE "verification_decisions" ADD CONSTRAINT "verification_decisions_reject_reason"
  CHECK ("decision" <> 'REJECT' OR length(trim("reason")) > 0);

-- ---------------------------------------------------------------------------
-- membership_history and verification_decisions are append-only. Rows go only when their parent
-- is deleted with the account (a foreign-key cascade, which runs as a nested trigger).
-- ---------------------------------------------------------------------------
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER membership_history_append_only
  BEFORE UPDATE OR DELETE ON "membership_history"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER membership_history_no_truncate
  BEFORE TRUNCATE ON "membership_history"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER verification_decisions_append_only
  BEFORE UPDATE OR DELETE ON "verification_decisions"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER verification_decisions_no_truncate
  BEFORE TRUNCATE ON "verification_decisions"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
