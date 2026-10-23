-- M28: two kinds of notice, for new positions and for mentorship. In a migration of their own,
-- since PostgreSQL does not let a new enum value be used in the transaction that adds it.

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'POSITIONS';

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'MENTORSHIP';
