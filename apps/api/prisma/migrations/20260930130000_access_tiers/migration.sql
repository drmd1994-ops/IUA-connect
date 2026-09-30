-- M3 checkpoint 3: content access tiers (D7). See docs/plans/M3-content-core.md §2.5.

-- CreateEnum
CREATE TYPE "access_tier" AS ENUM ('PUBLIC', 'MEMBERS', 'TYPES');

-- CreateTable
CREATE TABLE "content_access_rules" (
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "membership_type_id" UUID NOT NULL,

    CONSTRAINT "content_access_rules_pkey" PRIMARY KEY ("entity_type","entity_id","membership_type_id")
);

-- CreateIndex
CREATE INDEX "content_access_rules_entity_type_membership_type_id_idx" ON "content_access_rules"("entity_type", "membership_type_id");

-- AddForeignKey
ALTER TABLE "content_access_rules" ADD CONSTRAINT "content_access_rules_membership_type_id_fkey" FOREIGN KEY ("membership_type_id") REFERENCES "membership_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_access_rules" ADD CONSTRAINT "content_access_rules_entity_type"
  CHECK ("entity_type" ~ '^[a-z_]+$');
