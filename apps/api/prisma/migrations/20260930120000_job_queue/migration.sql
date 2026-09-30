-- M3 checkpoint 2: the job queue (pg-boss, ADR 0003). See docs/plans/M3-content-core.md §2.2.
--
-- pg-boss keeps its jobs in its own schema and manages its tables itself (it installs and
-- upgrades them at start, and adds a table per queue). The application role may create objects
-- in this schema only (USAGE, CREATE), so pg-boss can do that without the role getting rights
-- anywhere else; the tables it creates belong to it. The role name comes
-- from the database setting `iua.app_role` (set by `pnpm db:provision`); databases without it
-- (e.g. Prisma's shadow database) get a plain schema.
DO $$
DECLARE
  app_role text := current_setting('iua.app_role', true);
BEGIN
  IF app_role IS NULL OR app_role = '' THEN
    EXECUTE 'CREATE SCHEMA IF NOT EXISTS "pgboss"';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    RAISE EXCEPTION 'iua.app_role is set to %, but that role does not exist', app_role;
  END IF;
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS "pgboss"';
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA "pgboss" TO %I', app_role);
END;
$$;
