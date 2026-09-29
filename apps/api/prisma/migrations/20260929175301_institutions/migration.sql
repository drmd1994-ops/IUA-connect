-- M2 checkpoint 1: hospitals, departments, subspecialties, membership types.
-- See docs/plans/M2-people-membership.md §3–5.

-- CreateEnum
CREATE TYPE "membership_identifier" AS ENUM ('NONE', 'SPECIALIST_CERTIFICATE', 'MEDICAL_LICENCE');

-- CreateTable
CREATE TABLE "hospitals" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "city_he" VARCHAR(100) NOT NULL,
    "city_en" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subspecialties" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subspecialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_types" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name_he" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "identifier" "membership_identifier" NOT NULL DEFAULT 'NONE',
    "self_apply" BOOLEAN NOT NULL DEFAULT true,
    "director_approval" BOOLEAN NOT NULL DEFAULT true,
    "annual_fee" DECIMAL(12,2),
    "currency" CHAR(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membership_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_code_key" ON "hospitals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_hospital_id_code_key" ON "departments"("hospital_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subspecialties_key_key" ON "subspecialties"("key");

-- CreateIndex
CREATE UNIQUE INDEX "membership_types_key_key" ON "membership_types"("key");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma can't express (DATABASE_DESIGN.md §1 "Constraints")
-- ---------------------------------------------------------------------------
ALTER TABLE "membership_types" ADD CONSTRAINT "membership_types_fee_consistent"
  CHECK (("annual_fee" IS NULL) = ("currency" IS NULL) AND ("annual_fee" IS NULL OR "annual_fee" >= 0));
ALTER TABLE "membership_types" ADD CONSTRAINT "membership_types_honorary_admin_only"
  CHECK ("key" <> 'HONORARY_MEMBER' OR "self_apply" = false);

-- user_roles.scope_id points at a department or a subspecialty depending on scope_type, so a plain
-- foreign key can't express it (M1 left it open). These triggers enforce the same guarantees:
-- a scoped grant must name an existing row, and a referenced row can't be deleted (rows are
-- deactivated instead).
CREATE FUNCTION user_roles_check_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A missing scope_id is reported by the user_roles_scope_consistent check instead.
  IF NEW.scope_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.scope_type = 'DEPARTMENT'
     AND NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.scope_id) THEN
    RAISE EXCEPTION 'user_roles.scope_id % is not a department', NEW.scope_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.scope_type = 'SUBSPECIALTY'
     AND NOT EXISTS (SELECT 1 FROM subspecialties WHERE id = NEW.scope_id) THEN
    RAISE EXCEPTION 'user_roles.scope_id % is not a subspecialty', NEW.scope_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_roles_scope_exists
  BEFORE INSERT OR UPDATE OF scope_type, scope_id ON "user_roles"
  FOR EACH ROW EXECUTE FUNCTION user_roles_check_scope();

CREATE FUNCTION scope_target_restrict_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM user_roles WHERE scope_id = OLD.id) THEN
    RAISE EXCEPTION '% % is referenced by user_roles', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER departments_restrict_delete
  BEFORE DELETE ON "departments"
  FOR EACH ROW EXECUTE FUNCTION scope_target_restrict_delete();
CREATE TRIGGER subspecialties_restrict_delete
  BEFORE DELETE ON "subspecialties"
  FOR EACH ROW EXECUTE FUNCTION scope_target_restrict_delete();

-- Existing scoped grants (none are created before M2) must already satisfy the rule.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM user_roles WHERE scope_type <> 'NONE') THEN
    RAISE EXCEPTION 'user_roles has scoped grants without departments or subspecialties';
  END IF;
END;
$$;
