-- M26: the case discussions' notice kind and file purpose, in a migration of their own (a new
-- enum value can't be used in the transaction that adds it).
ALTER TYPE "notification_kind" ADD VALUE 'CASES';
ALTER TYPE "file_purpose" ADD VALUE 'CASE';
