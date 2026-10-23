-- M27: a kind of notice for research. In a migration of its own, since PostgreSQL does not let
-- a new enum value be used in the transaction that adds it.

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'RESEARCH';
