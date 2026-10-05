-- M12 checkpoint 2: chat rooms. A room is a conversation of kind ROOM, so the tables of M11 gain
-- columns, and reactions, pins, bans and room categories get tables (docs/plans/M12-chat-rooms.md §4).
-- Only additions: nothing existing is changed.

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "category_id" UUID,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "description_en" VARCHAR(1000),
ADD COLUMN     "description_he" VARCHAR(1000),
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "member_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "moderators_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name_en" VARCHAR(120),
ADD COLUMN     "name_he" VARCHAR(120),
ADD COLUMN     "picture_file_id" UUID;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "announcement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mentions" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "removed_by" UUID;

-- CreateTable
CREATE TABLE "chat_room_categories" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name_he" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_room_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reaction" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id","user_id","reaction")
);

-- CreateTable
CREATE TABLE "message_pins" (
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "pinned_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pins_pkey" PRIMARY KEY ("conversation_id","message_id")
);

-- CreateTable
CREATE TABLE "conversation_bans" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "lifted_at" TIMESTAMPTZ(6),
    "lifted_by" UUID,

    CONSTRAINT "conversation_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_room_categories_key_key" ON "chat_room_categories"("key");

-- CreateIndex
CREATE INDEX "message_reactions_user_id_idx" ON "message_reactions"("user_id");

-- CreateIndex
CREATE INDEX "message_pins_message_id_idx" ON "message_pins"("message_id");

-- CreateIndex
CREATE INDEX "conversation_bans_conversation_id_user_id_idx" ON "conversation_bans"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "conversation_bans_user_id_idx" ON "conversation_bans"("user_id");

-- CreateIndex
CREATE INDEX "conversation_members_conversation_id_role_idx" ON "conversation_members"("conversation_id", "role");

-- CreateIndex
CREATE INDEX "conversations_kind_archived_at_last_message_at_idx" ON "conversations"("kind", "archived_at", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_category_id_idx" ON "conversations"("category_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "chat_room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_picture_file_id_fkey" FOREIGN KEY ("picture_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_pins" ADD CONSTRAINT "message_pins_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_pins" ADD CONSTRAINT "message_pins_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_bans" ADD CONSTRAINT "conversation_bans_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_bans" ADD CONSTRAINT "conversation_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- A room has a name and no pair; a direct conversation has neither a name nor room settings.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_room_fields"
  CHECK (
    ("kind" = 'ROOM' AND "name_he" IS NOT NULL AND length(btrim("name_he")) > 0
       AND "user_low_id" IS NULL AND "user_high_id" IS NULL)
    OR ("kind" <> 'ROOM' AND "name_he" IS NULL AND "name_en" IS NULL
       AND "category_id" IS NULL AND "picture_file_id" IS NULL
       AND NOT "moderators_only" AND NOT "locked" AND "member_count" = 0)
  );
-- Room names are unique, whatever the letter case.
CREATE UNIQUE INDEX "conversations_room_name_key" ON "conversations" (lower("name_he"))
  WHERE "kind" = 'ROOM';
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_member_count"
  CHECK ("member_count" >= 0);
-- A timed lock is a lock.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_locked_until"
  CHECK ("locked_until" IS NULL OR "locked");

-- Removed by someone else means deleted.
ALTER TABLE "messages" ADD CONSTRAINT "messages_removed_is_deleted"
  CHECK ("removed_by" IS NULL OR "deleted_at" IS NOT NULL);
ALTER TABLE "messages" ADD CONSTRAINT "messages_mentions_limit"
  CHECK (cardinality("mentions") <= 10);

-- The fixed set of reactions (M12 plan, owner answer 5).
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_known"
  CHECK ("reaction" IN ('like', 'heart', 'laugh', 'wow', 'thanks', 'check'));

ALTER TABLE "conversation_bans" ADD CONSTRAINT "conversation_bans_period"
  CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

-- At most five pinned messages in a room.
CREATE FUNCTION message_pins_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM "message_pins" WHERE "conversation_id" = NEW."conversation_id") >= 5 THEN
    RAISE EXCEPTION 'message_pins: a room holds at most five pinned messages'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER message_pins_limit
  BEFORE INSERT ON "message_pins"
  FOR EACH ROW EXECUTE FUNCTION message_pins_limit();