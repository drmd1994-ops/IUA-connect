-- M16: the speakers an organisation's event staff keep are that organisation's list. The
-- existing ones were the association's: they go to the first organisation.

BEGIN;

ALTER TABLE "speakers" ADD COLUMN "organisation_id" UUID;
UPDATE "speakers" s SET "organisation_id" = o."id"
  FROM "organisations" o WHERE o."id" = '00000000-0000-7000-8000-000000000001';
CREATE INDEX "speakers_organisation_id_idx" ON "speakers"("organisation_id");
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
