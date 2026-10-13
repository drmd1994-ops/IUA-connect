-- M16: a role is granted once in each place. The index that says so must treat "no scope" and
-- "no organisation" as equal to themselves (NULLS NOT DISTINCT), as the index it replaced did;
-- without that, the same unscoped role could be given to a person twice.

BEGIN;

-- Between the two migrations a grant could have been repeated: keep one of each.
DELETE FROM "user_roles" a USING "user_roles" b
WHERE a.ctid > b.ctid
  AND a."user_id" = b."user_id"
  AND a."role_id" = b."role_id"
  AND a."scope_type" = b."scope_type"
  AND a."scope_id" IS NOT DISTINCT FROM b."scope_id"
  AND a."organisation_id" IS NOT DISTINCT FROM b."organisation_id";

DROP INDEX "user_roles_user_id_role_id_scope_type_scope_id_organisation_key";
CREATE UNIQUE INDEX "user_roles_user_id_role_id_scope_type_scope_id_organisation_key"
  ON "user_roles"("user_id", "role_id", "scope_type", "scope_id", "organisation_id")
  NULLS NOT DISTINCT;

COMMIT;
