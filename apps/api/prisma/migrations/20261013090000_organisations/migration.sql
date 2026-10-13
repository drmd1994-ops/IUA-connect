-- M16 step 2: the platform stands by itself, and an organisation has a section of its own
-- (docs/plans/M16-independent-platform.md §3, §4). Until now everything belonged to "the
-- association" without saying so. This migration adds organisations, and moves every row that
-- is an organisation's into the first one. Additions and one backfill; nothing is deleted.

-- All of it, or none of it.
BEGIN;

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "description_he" TEXT,
    "description_en" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

ALTER TABLE "organisations" ADD CONSTRAINT "organisations_slug_shape"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- The first organisation, only where there is something to put in it. A new, empty database
-- gets none: the seed makes its own.
INSERT INTO "organisations" ("id", "slug", "name_he", "name_en", "updated_at")
SELECT '00000000-0000-7000-8000-000000000001', 'first-organisation', 'הארגון הראשון', 'The first organisation', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "membership_types")
   OR EXISTS (SELECT 1 FROM "import_batches")
   OR EXISTS (SELECT 1 FROM "news")
   OR EXISTS (SELECT 1 FROM "events")
   OR EXISTS (SELECT 1 FROM "broadcasts")
   OR EXISTS (SELECT 1 FROM "conversations" WHERE "kind" = 'ROOM');

-- A person known to the platform as a physician. Whoever an organisation accepted as a member
-- counts as one, from the day they were accepted.
ALTER TABLE "users" ADD COLUMN "verified_at" TIMESTAMPTZ(6);
UPDATE "users" u SET "verified_at" = m."created_at" FROM "memberships" m WHERE m."user_id" = u."id";

-- Membership types, memberships and member imports are always an organisation's.
ALTER TABLE "membership_types" ADD COLUMN "organisation_id" UUID;
ALTER TABLE "memberships" ADD COLUMN "organisation_id" UUID;
ALTER TABLE "import_batches" ADD COLUMN "organisation_id" UUID;
UPDATE "membership_types" SET "organisation_id" = '00000000-0000-7000-8000-000000000001';
UPDATE "memberships" SET "organisation_id" = '00000000-0000-7000-8000-000000000001';
UPDATE "import_batches" SET "organisation_id" = '00000000-0000-7000-8000-000000000001';
ALTER TABLE "membership_types" ALTER COLUMN "organisation_id" SET NOT NULL;
ALTER TABLE "memberships" ALTER COLUMN "organisation_id" SET NOT NULL;
ALTER TABLE "import_batches" ALTER COLUMN "organisation_id" SET NOT NULL;

-- A type's key, a person's membership and a licence number are each one of a kind inside an
-- organisation, no longer in the whole database: a person may belong to several organisations.
DROP INDEX "membership_types_key_key";
DROP INDEX "memberships_identifier_hash_key";
DROP INDEX "memberships_user_id_key";
CREATE UNIQUE INDEX "membership_types_organisation_id_key_key" ON "membership_types"("organisation_id", "key");
CREATE UNIQUE INDEX "memberships_user_id_organisation_id_key" ON "memberships"("user_id", "organisation_id");
CREATE UNIQUE INDEX "memberships_organisation_id_identifier_hash_key" ON "memberships"("organisation_id", "identifier_hash");

-- A membership is of a type of its own organisation.
CREATE FUNCTION memberships_check_organisation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM membership_types t WHERE t.id = NEW.type_id AND t.organisation_id = NEW.organisation_id
  ) THEN
    RAISE EXCEPTION 'memberships.type_id % is not a type of organisation %', NEW.type_id, NEW.organisation_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER memberships_organisation BEFORE INSERT OR UPDATE OF type_id, organisation_id ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION memberships_check_organisation();

-- News, events, messages to members and rooms: an organisation's, or the platform's own (empty).
-- Everything that exists was written as the association's, so it goes to the first organisation.
ALTER TABLE "news" ADD COLUMN "organisation_id" UUID;
ALTER TABLE "events" ADD COLUMN "organisation_id" UUID;
ALTER TABLE "broadcasts" ADD COLUMN "organisation_id" UUID;
ALTER TABLE "conversations" ADD COLUMN "organisation_id" UUID;
UPDATE "news" SET "organisation_id" = '00000000-0000-7000-8000-000000000001';
UPDATE "events" SET "organisation_id" = '00000000-0000-7000-8000-000000000001';
-- A sent message to members may not be changed (a rule of M7). Saying whose it is changes nothing
-- of what was sent, so the rule is set aside for this one statement.
ALTER TABLE "broadcasts" DISABLE TRIGGER broadcasts_sent_is_final;
UPDATE "broadcasts" SET "organisation_id" = '00000000-0000-7000-8000-000000000001';
ALTER TABLE "broadcasts" ENABLE TRIGGER broadcasts_sent_is_final;
UPDATE "conversations" SET "organisation_id" = '00000000-0000-7000-8000-000000000001' WHERE "kind" = 'ROOM';

-- Only a room can be an organisation's; a private conversation and a group are people's own.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organisation_room"
  CHECK ("organisation_id" IS NULL OR "kind" = 'ROOM');

-- A staff role is held on the platform (empty) or in one organisation. Which of the existing
-- roles move into the first organisation is decided with the roles themselves (step 5).
ALTER TABLE "user_roles" ADD COLUMN "organisation_id" UUID;
DROP INDEX "user_roles_user_id_role_id_scope_type_scope_id_key";
CREATE UNIQUE INDEX "user_roles_user_id_role_id_scope_type_scope_id_organisation_key" ON "user_roles"("user_id", "role_id", "scope_type", "scope_id", "organisation_id");

-- CreateIndex
CREATE INDEX "broadcasts_organisation_id_idx" ON "broadcasts"("organisation_id");
CREATE INDEX "conversations_organisation_id_idx" ON "conversations"("organisation_id");
CREATE INDEX "events_organisation_id_idx" ON "events"("organisation_id");
CREATE INDEX "news_organisation_id_idx" ON "news"("organisation_id");
CREATE INDEX "user_roles_organisation_id_idx" ON "user_roles"("organisation_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_types" ADD CONSTRAINT "membership_types_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "news" ADD CONSTRAINT "news_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
