-- M7 checkpoint 3: broadcasts, approved by a second admin, and who each one reached.

-- CreateEnum
CREATE TYPE "broadcast_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SENT', 'REJECTED');

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "status" "broadcast_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "audience_all" BOOLEAN NOT NULL DEFAULT true,
    "type_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "submitted_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "reject_reason" VARCHAR(1000),
    "sent_at" TIMESTAMPTZ(6),
    "recipient_count" INTEGER,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_translations" (
    "broadcast_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,

    CONSTRAINT "broadcast_translations_pkey" PRIMARY KEY ("broadcast_id","locale")
);

-- CreateTable
CREATE TABLE "broadcast_deliveries" (
    "broadcast_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emailed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_deliveries_pkey" PRIMARY KEY ("broadcast_id","user_id")
);

-- CreateIndex
CREATE INDEX "broadcasts_status_created_at_idx" ON "broadcasts"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "broadcasts_created_by_idempotency_key_key" ON "broadcasts"("created_by", "idempotency_key");

-- CreateIndex
CREATE INDEX "broadcast_deliveries_emailed_at_idx" ON "broadcast_deliveries"("emailed_at");

-- CreateIndex
CREATE INDEX "broadcast_deliveries_user_id_idx" ON "broadcast_deliveries"("user_id");

-- AddForeignKey
ALTER TABLE "broadcast_translations" ADD CONSTRAINT "broadcast_translations_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- Two admins: whoever decides on a broadcast is never its author.
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_two_admins"
  CHECK ("decided_by" IS NULL OR "decided_by" <> "created_by");
-- A sent broadcast was approved by someone, at a known time, and reached a counted audience.
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_sent_was_approved"
  CHECK ("status" <> 'SENT'
         OR ("decided_by" IS NOT NULL AND "sent_at" IS NOT NULL AND "recipient_count" IS NOT NULL));
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_rejected_has_reason"
  CHECK ("status" <> 'REJECTED' OR ("decided_by" IS NOT NULL AND "reject_reason" IS NOT NULL));
-- An audience by type names at least one type.
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_audience"
  CHECK ("audience_all" OR cardinality("type_ids") > 0);
ALTER TABLE "broadcast_translations" ADD CONSTRAINT "broadcast_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');

-- A sent broadcast can't be changed, taken back or deleted.
CREATE FUNCTION broadcasts_sent_is_final() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'SENT' THEN
    RAISE EXCEPTION 'broadcasts: a sent broadcast is final';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER broadcasts_sent_is_final
  BEFORE UPDATE OR DELETE ON "broadcasts"
  FOR EACH ROW EXECUTE FUNCTION broadcasts_sent_is_final();

CREATE FUNCTION broadcast_text_sent_is_final() RETURNS trigger AS $$
DECLARE
  broadcast_status "broadcast_status";
BEGIN
  SELECT "status" INTO broadcast_status FROM "broadcasts"
    WHERE "id" = COALESCE(NEW."broadcast_id", OLD."broadcast_id");
  IF broadcast_status = 'SENT' THEN
    RAISE EXCEPTION 'broadcasts: a sent broadcast is final';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER broadcast_text_sent_is_final
  BEFORE INSERT OR UPDATE OR DELETE ON "broadcast_translations"
  FOR EACH ROW EXECUTE FUNCTION broadcast_text_sent_is_final();
