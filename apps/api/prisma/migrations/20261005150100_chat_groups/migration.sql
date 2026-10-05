-- M13 checkpoint 2: group chats, invitations, rooms by invitation, activity, forwarding, pinned
-- conversations and files in messages (docs/plans/M13-chat-groups-status.md §4). Only additions;
-- one check constraint is replaced by a wider one.

-- CreateEnum
CREATE TYPE "chat_invite_audience" AS ENUM ('LISTED', 'CONTACTS', 'NOBODY');

-- CreateEnum
CREATE TYPE "chat_invitation_status" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "invite_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "pinned_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "forwarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "chat_preferences" ADD COLUMN     "invites_from" "chat_invite_audience" NOT NULL DEFAULT 'LISTED',
ADD COLUMN     "last_active_at" TIMESTAMPTZ(6),
ADD COLUMN     "show_activity" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "conversation_invitations" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invited_by" UUID,
    "status" "chat_invitation_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("message_id","position")
);

-- CreateIndex
CREATE INDEX "conversation_invitations_user_id_status_idx" ON "conversation_invitations"("user_id", "status");

-- CreateIndex
CREATE INDEX "conversation_invitations_conversation_id_status_idx" ON "conversation_invitations"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "message_attachments_file_id_idx" ON "message_attachments"("file_id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_pinned_at_idx" ON "conversation_members"("user_id", "pinned_at");

-- AddForeignKey
ALTER TABLE "conversation_invitations" ADD CONSTRAINT "conversation_invitations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_invitations" ADD CONSTRAINT "conversation_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_invitations" ADD CONSTRAINT "conversation_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- A room has a name and no pair. A group has one name (kept in name_he), no pair and none of a
-- room's settings. A direct conversation has neither a name nor any of them.
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_room_fields";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_room_fields"
  CHECK (
    ("kind" = 'ROOM' AND "name_he" IS NOT NULL AND length(btrim("name_he")) > 0
       AND "user_low_id" IS NULL AND "user_high_id" IS NULL)
    OR ("kind" = 'GROUP' AND "name_he" IS NOT NULL AND length(btrim("name_he")) > 0
       AND "user_low_id" IS NULL AND "user_high_id" IS NULL
       AND "name_en" IS NULL AND "description_he" IS NULL AND "description_en" IS NULL
       AND "category_id" IS NULL AND "picture_file_id" IS NULL
       AND NOT "moderators_only" AND NOT "locked" AND NOT "invite_only")
    OR ("kind" = 'DIRECT' AND "name_he" IS NULL AND "name_en" IS NULL
       AND "category_id" IS NULL AND "picture_file_id" IS NULL
       AND NOT "moderators_only" AND NOT "locked" AND NOT "invite_only"
       AND "member_count" = 0)
  );

-- One open invitation per person per conversation.
CREATE UNIQUE INDEX "conversation_invitations_open_key"
  ON "conversation_invitations" ("conversation_id", "user_id")
  WHERE "status" = 'OPEN';
-- An invitation that is no longer open says when it stopped being so.
ALTER TABLE "conversation_invitations" ADD CONSTRAINT "conversation_invitations_resolved"
  CHECK (("status" = 'OPEN') = ("resolved_at" IS NULL));
ALTER TABLE "conversation_invitations" ADD CONSTRAINT "conversation_invitations_not_self"
  CHECK ("invited_by" IS NULL OR "invited_by" <> "user_id");

-- Up to three files in a message.
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_position"
  CHECK ("position" BETWEEN 0 AND 2);
-- The same file once in a message.
CREATE UNIQUE INDEX "message_attachments_message_file_key"
  ON "message_attachments" ("message_id", "file_id");

-- At most five pinned conversations per person.
CREATE FUNCTION conversation_pins_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."pinned_at" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."pinned_at" IS NULL) THEN
    IF (SELECT count(*) FROM "conversation_members"
        WHERE "user_id" = NEW."user_id" AND "pinned_at" IS NOT NULL) >= 5 THEN
      RAISE EXCEPTION 'conversation_members: a person pins at most five conversations'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_pins_limit
  BEFORE INSERT OR UPDATE OF "pinned_at" ON "conversation_members"
  FOR EACH ROW EXECUTE FUNCTION conversation_pins_limit();
