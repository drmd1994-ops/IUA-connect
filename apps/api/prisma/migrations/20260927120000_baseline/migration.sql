-- M0 baseline: extensions, Hebrew text normalization, append-only audit log.
-- See DATABASE_DESIGN.md §1, §3 (audit_logs), §5 (search) and SECURITY_MODEL.md §3.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- normalize_he(text): search normalization for Hebrew (DATABASE_DESIGN.md §5)
--   * removes niqqud and cantillation marks (U+0591..U+05C7, except punctuation)
--   * turns maqaf (U+05BE) into a space, so hyphenated compounds split into words
--   * folds final letters: ך→כ ם→מ ן→נ ף→פ ץ→צ
--   * lower-cases Latin text
-- Used by the search triggers added in M7.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_he(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT translate(
    regexp_replace(
      replace(lower(input), U&'\05BE', ' '),
      U&'[\0591-\05BD\05BF\05C1\05C2\05C4\05C5\05C7]',
      '',
      'g'
    ),
    'ךםןףץ',
    'כמנפצ'
  );
$$;

-- ---------------------------------------------------------------------------
-- audit_logs (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "actor_ip" INET,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" VARCHAR(100),
    "changes" JSONB,
    "correlation_id" VARCHAR(64) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_entity_type_entity_id_at_idx" ON "audit_logs"("entity_type", "entity_id", "at" DESC);
CREATE INDEX "audit_logs_actor_user_id_at_idx" ON "audit_logs"("actor_user_id", "at" DESC);

-- Layer 1: a trigger rejects UPDATE, DELETE and TRUNCATE for every role, including the owner.
-- Retention purges (DATABASE_DESIGN.md §7) will need a reviewed, audited maintenance procedure.
CREATE OR REPLACE FUNCTION audit_logs_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_mutation();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_reject_mutation();

-- Layer 2: the application role holds only SELECT and INSERT on audit_logs, and nothing on the
-- migrations table. The role name comes from the database setting `iua.app_role`, which
-- `pnpm db:provision` sets. Databases without it (e.g. Prisma's shadow database) skip this block.
DO $$
DECLARE
  app_role text := current_setting('iua.app_role', true);
BEGIN
  IF app_role IS NULL OR app_role = '' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    RAISE EXCEPTION 'iua.app_role is set to %, but that role does not exist', app_role;
  END IF;
  EXECUTE format('REVOKE ALL ON TABLE "audit_logs" FROM %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT ON TABLE "audit_logs" TO %I', app_role);
  EXECUTE format('REVOKE ALL ON TABLE "_prisma_migrations" FROM %I', app_role);
END;
$$;
