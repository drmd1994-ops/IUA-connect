-- M12 checkpoint 2: the new values of four enums. They are added in a migration of their own,
-- because PostgreSQL does not let a new enum value be used in the transaction that adds it.

-- AlterEnum
ALTER TYPE "chat_report_action" ADD VALUE 'ROOM_ARCHIVED';

-- AlterEnum
ALTER TYPE "conversation_kind" ADD VALUE 'ROOM';

-- AlterEnum
ALTER TYPE "conversation_member_role" ADD VALUE 'MODERATOR';

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'ROOMS';
