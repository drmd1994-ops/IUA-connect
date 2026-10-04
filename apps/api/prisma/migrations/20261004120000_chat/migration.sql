-- M11 checkpoint 2: chat. Conversations, their members, messages, blocks, settings, reports and
-- suspensions (docs/plans/M11-chat.md §4). Only additions: nothing existing is changed.
-- CreateEnum
CREATE TYPE "conversation_kind" AS ENUM ('DIRECT');

-- CreateEnum
CREATE TYPE "conversation_member_role" AS ENUM ('MEMBER');

-- CreateEnum
CREATE TYPE "chat_audience" AS ENUM ('LISTED', 'NOBODY');

-- CreateEnum
CREATE TYPE "chat_report_status" AS ENUM ('OPEN', 'DISMISSED', 'UPHELD');

-- CreateEnum
CREATE TYPE "chat_report_action" AS ENUM ('NONE', 'MESSAGE_DELETED', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'MESSAGES';

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "kind" "conversation_kind" NOT NULL DEFAULT 'DIRECT',
    "user_low_id" UUID,
    "user_high_id" UUID,
    "last_seq" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "conversation_member_role" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_seq" INTEGER NOT NULL DEFAULT 0,
    "last_delivered_seq" INTEGER NOT NULL DEFAULT 0,
    "marked_unread" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "muted_until" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "sender_id" UUID,
    "body" VARCHAR(4000) NOT NULL,
    "reply_to_id" UUID,
    "idempotency_key" VARCHAR(100),
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_vector" tsvector,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_hides" (
    "user_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_hides_pkey" PRIMARY KEY ("user_id","message_id")
);

-- CreateTable
CREATE TABLE "chat_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "chat_preferences" (
    "user_id" UUID NOT NULL,
    "audience" "chat_audience" NOT NULL DEFAULT 'LISTED',
    "read_receipts" BOOLEAN NOT NULL DEFAULT true,
    "typing" BOOLEAN NOT NULL DEFAULT true,
    "unread_emailed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "chat_report_categories" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name_he" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "chat_report_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID,
    "reported_user_id" UUID,
    "conversation_id" UUID,
    "message_id" UUID,
    "category_id" UUID NOT NULL,
    "description" VARCHAR(2000),
    "snapshot" JSONB,
    "status" "chat_report_status" NOT NULL DEFAULT 'OPEN',
    "action" "chat_report_action" NOT NULL DEFAULT 'NONE',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "resolution" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_suspensions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "report_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "lifted_at" TIMESTAMPTZ(6),
    "lifted_by" UUID,

    CONSTRAINT "chat_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_user_high_id_idx" ON "conversations"("user_high_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_user_low_id_user_high_id_key" ON "conversations"("user_low_id", "user_high_id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_archived_at_idx" ON "conversation_members"("user_id", "archived_at");

-- CreateIndex
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");

-- CreateIndex
CREATE INDEX "messages_search_idx" ON "messages" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_seq_key" ON "messages"("conversation_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_id_idempotency_key_key" ON "messages"("sender_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "message_hides_message_id_idx" ON "message_hides"("message_id");

-- CreateIndex
CREATE INDEX "chat_blocks_blocked_id_idx" ON "chat_blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_report_categories_key_key" ON "chat_report_categories"("key");

-- CreateIndex
CREATE INDEX "chat_reports_status_created_at_idx" ON "chat_reports"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chat_reports_reported_user_id_idx" ON "chat_reports"("reported_user_id");

-- CreateIndex
CREATE INDEX "chat_reports_reporter_id_idx" ON "chat_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "chat_reports_message_id_idx" ON "chat_reports"("message_id");

-- CreateIndex
CREATE INDEX "chat_reports_conversation_id_idx" ON "chat_reports"("conversation_id");

-- CreateIndex
CREATE INDEX "chat_suspensions_user_id_starts_at_idx" ON "chat_suspensions"("user_id", "starts_at" DESC);

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_low_id_fkey" FOREIGN KEY ("user_low_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_high_id_fkey" FOREIGN KEY ("user_high_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_hides" ADD CONSTRAINT "message_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_hides" ADD CONSTRAINT "message_hides_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_preferences" ADD CONSTRAINT "chat_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "chat_report_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_suspensions" ADD CONSTRAINT "chat_suspensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- The two people of a direct conversation are stored smaller id first, so the unique index
-- above means one conversation per pair whoever starts it.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_pair_order"
  CHECK ("user_low_id" IS NULL OR "user_high_id" IS NULL OR "user_low_id" < "user_high_id");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_last_seq"
  CHECK ("last_seq" >= 0);

ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_markers"
  CHECK ("last_read_seq" >= 0 AND "last_delivered_seq" >= 0);
-- A timed mute is a mute.
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_muted_until"
  CHECK ("muted_until" IS NULL OR "muted");

ALTER TABLE "messages" ADD CONSTRAINT "messages_seq"
  CHECK ("seq" > 0);
-- A message has text; one deleted for everyone has none left.
ALTER TABLE "messages" ADD CONSTRAINT "messages_text"
  CHECK (("deleted_at" IS NULL AND length(btrim("body")) > 0)
         OR ("deleted_at" IS NOT NULL AND "body" = ''));

ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_not_self"
  CHECK ("blocker_id" <> "blocked_id");

-- A closed report says who closed it, when and why.
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_closed_has_reviewer"
  CHECK ("status" = 'OPEN'
         OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "resolution" IS NOT NULL));
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_open_has_no_action"
  CHECK ("status" = 'UPHELD' OR "action" = 'NONE');

ALTER TABLE "chat_suspensions" ADD CONSTRAINT "chat_suspensions_period"
  CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

-- Message search: the text after the Hebrew normalisation (vowel marks stripped, final letters
-- folded), as for news. A deleted message has no text and so is never found.
CREATE FUNCTION messages_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', normalize_he(coalesce(NEW.body, '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_search_vector
  BEFORE INSERT OR UPDATE OF "body" ON "messages"
  FOR EACH ROW EXECUTE FUNCTION messages_search_vector();