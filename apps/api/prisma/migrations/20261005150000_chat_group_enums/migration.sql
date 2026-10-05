-- M13 checkpoint 2: the new values of four enums. They are added in a migration of their own,
-- because PostgreSQL does not let a new enum value be used in the transaction that adds it.

-- AlterEnum
ALTER TYPE "conversation_kind" ADD VALUE 'GROUP';

-- AlterEnum
ALTER TYPE "conversation_member_role" ADD VALUE 'ADMIN';

-- AlterEnum
ALTER TYPE "file_kind" ADD VALUE 'VIDEO';

-- AlterEnum
ALTER TYPE "file_purpose" ADD VALUE 'CHAT';
