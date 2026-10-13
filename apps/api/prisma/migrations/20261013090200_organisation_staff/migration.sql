-- M16 steps 3 to 5 (docs/plans/M16-independent-platform.md §3): an application is to an
-- organisation; the platform's own content opens to verified physicians; and staff roles are
-- held on the platform or inside one organisation.

BEGIN;

-- 1. An application is to the organisation of its membership type. ---------------------------
ALTER TABLE "verification_requests" ADD COLUMN "organisation_id" UUID;
UPDATE "verification_requests" v SET "organisation_id" = t."organisation_id"
  FROM "membership_types" t WHERE t."id" = v."type_id";
ALTER TABLE "verification_requests" ALTER COLUMN "organisation_id" SET NOT NULL;
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open application per person, and per licence number, in each organisation: a person may
-- apply to two organisations at once.
DROP INDEX "verification_requests_one_open_per_user";
DROP INDEX "verification_requests_one_open_per_identifier";
CREATE UNIQUE INDEX "verification_requests_one_open_per_user"
  ON "verification_requests"("user_id", "organisation_id")
  WHERE "state" IN ('PENDING_DIRECTOR', 'PENDING_ADMIN');
CREATE UNIQUE INDEX "verification_requests_one_open_per_identifier"
  ON "verification_requests"("organisation_id", "identifier_hash")
  WHERE "state" IN ('PENDING_DIRECTOR', 'PENDING_ADMIN') AND "identifier_hash" IS NOT NULL;

-- An application is for a type of the organisation it is to.
CREATE FUNCTION verification_requests_check_organisation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM membership_types t WHERE t.id = NEW.type_id AND t.organisation_id = NEW.organisation_id
  ) THEN
    RAISE EXCEPTION 'verification_requests.type_id % is not a type of organisation %', NEW.type_id, NEW.organisation_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER verification_requests_organisation
  BEFORE INSERT OR UPDATE OF type_id, organisation_id ON "verification_requests"
  FOR EACH ROW EXECUTE FUNCTION verification_requests_check_organisation();

-- 2. The platform's own content. ---------------------------------------------------------------
-- The education library, exam questions and guidelines are the platform's (owner's answer 3).
-- "Members" there meant the association's members; it now means every verified physician.
UPDATE "education_items" SET "access_tier" = 'VERIFIED' WHERE "access_tier" = 'MEMBERS';
UPDATE "exam_questions" SET "access_tier" = 'VERIFIED' WHERE "access_tier" = 'MEMBERS';
UPDATE "guidelines" SET "access_tier" = 'VERIFIED' WHERE "access_tier" = 'MEMBERS';

-- "Members" is a setting for what an organisation owns: there are no members of the platform.
ALTER TABLE "news" ADD CONSTRAINT "news_members_tier_has_owner"
  CHECK ("access_tier" <> 'MEMBERS' OR "organisation_id" IS NOT NULL);
ALTER TABLE "events" ADD CONSTRAINT "events_members_tier_has_owner"
  CHECK ("access_tier" <> 'MEMBERS' OR "organisation_id" IS NOT NULL);
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_no_members_tier"
  CHECK ("access_tier" <> 'MEMBERS');
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_no_members_tier"
  CHECK ("access_tier" <> 'MEMBERS');
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_no_members_tier"
  CHECK ("access_tier" <> 'MEMBERS');

-- 3. Staff roles in two places. ----------------------------------------------------------------
-- The association's administrator becomes the administrator of an organisation. What that role
-- could do about the platform itself (accounts, institutions, the library, the audit log) moves
-- to a new role, "platform administrator".
UPDATE "roles" SET "key" = 'ORG_ADMIN', "name_key" = 'roles.ORG_ADMIN', "updated_at" = CURRENT_TIMESTAMP
  WHERE "key" = 'IUA_ADMIN';

INSERT INTO "roles" ("id", "key", "name_key", "requires_mfa", "updated_at")
SELECT gen_random_uuid(), 'PLATFORM_ADMIN', 'roles.PLATFORM_ADMIN', true, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "roles") AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "key" = 'PLATFORM_ADMIN');

-- The platform administrator's permissions, of those that exist already. The reference seed,
-- which is the source of truth for this mapping, completes it.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r, "permissions" p
WHERE r."key" = 'PLATFORM_ADMIN'
  AND p."key" IN ('users.read', 'users.manage', 'institutions.manage', 'news.create', 'news.review',
                  'news.publish', 'events.manage', 'education.manage', 'education.review',
                  'guidelines.manage', 'files.upload', 'broadcasts.create', 'broadcasts.approve',
                  'chat.moderate', 'chat.rooms.manage', 'audit.read')
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" rp USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id" AND r."key" = 'ORG_ADMIN'
  AND p."key" IN ('users.read', 'users.manage', 'institutions.manage', 'education.manage',
                  'education.review', 'guidelines.manage', 'audit.read');

-- Nobody loses anything they could do: whoever was the association's administrator is now the
-- first organisation's administrator and a platform administrator.
INSERT INTO "user_roles" ("id", "user_id", "role_id", "scope_type", "granted_by", "granted_at")
SELECT gen_random_uuid(), ur."user_id", pr."id", 'NONE', ur."granted_by", ur."granted_at"
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."role_id" AND r."key" = 'ORG_ADMIN'
CROSS JOIN "roles" pr
WHERE pr."key" = 'PLATFORM_ADMIN';

-- An editor wrote the association's news and the education library. The library is the
-- platform's and the news the organisation's, so an editor now holds the role in both places.
INSERT INTO "user_roles" ("id", "user_id", "role_id", "scope_type", "granted_by", "granted_at", "organisation_id")
SELECT gen_random_uuid(), ur."user_id", ur."role_id", 'NONE', ur."granted_by", ur."granted_at", o."id"
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."role_id" AND r."key" = 'CONTENT_EDITOR'
JOIN "organisations" o ON o."id" = '00000000-0000-7000-8000-000000000001'
WHERE ur."organisation_id" IS NULL;

-- Administrators and event managers of the association: of the first organisation.
UPDATE "user_roles" ur SET "organisation_id" = o."id"
FROM "roles" r, "organisations" o
WHERE r."id" = ur."role_id" AND r."key" IN ('ORG_ADMIN', 'EVENT_ADMIN')
  AND o."id" = '00000000-0000-7000-8000-000000000001'
  AND ur."organisation_id" IS NULL;

-- A role is held in an organisation without a department or subspecialty scope.
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organisation_unscoped"
  CHECK ("organisation_id" IS NULL OR "scope_type" = 'NONE');

COMMIT;
