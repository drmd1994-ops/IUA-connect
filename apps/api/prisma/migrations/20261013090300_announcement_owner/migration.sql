-- M16: an announcement of new content remembers who published the item, because "members" now
-- means the members of that organisation.

BEGIN;

ALTER TABLE "content_announcements" ADD COLUMN "organisation_id" UUID;

UPDATE "content_announcements" a SET "organisation_id" = n."organisation_id"
  FROM "news" n WHERE a."entity_type" = 'news' AND n."id" = a."entity_id";
UPDATE "content_announcements" a SET "organisation_id" = e."organisation_id"
  FROM "events" e WHERE a."entity_type" = 'event' AND e."id" = a."entity_id";

-- Announcements of the platform's own content were for members; they are for verified people.
UPDATE "content_announcements" SET "access_tier" = 'VERIFIED'
  WHERE "access_tier" = 'MEMBERS' AND "organisation_id" IS NULL;

ALTER TABLE "content_announcements" ADD CONSTRAINT "content_announcements_members_tier_has_owner"
  CHECK ("access_tier" <> 'MEMBERS' OR "organisation_id" IS NOT NULL);

COMMIT;
