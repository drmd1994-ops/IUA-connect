-- M25: a kind of notice for communities. In a migration of its own, since PostgreSQL does not
-- let a new enum value be used in the transaction that adds it.

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'COMMUNITIES';
