-- M13: a message may be files without a text (docs/plans/M13-chat-groups-status.md §2.7). Until
-- now the database said a message that is not deleted has text. Whether a message has a text
-- or a file is checked by the API, which sees both; the database keeps the other half of the
-- rule: a message deleted for everyone has no text left.
ALTER TABLE "messages" DROP CONSTRAINT "messages_text";
ALTER TABLE "messages" ADD CONSTRAINT "messages_text"
  CHECK ("deleted_at" IS NULL OR "body" = '');
