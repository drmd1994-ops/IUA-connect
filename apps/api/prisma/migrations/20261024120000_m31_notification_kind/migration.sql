-- M31: the journal club's notice kind, in a migration of its own (a new enum value can't be used
-- in the transaction that adds it).
ALTER TYPE "notification_kind" ADD VALUE 'JOURNAL_CLUB';
