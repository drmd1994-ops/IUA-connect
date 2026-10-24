-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID,
    "case_id" UUID,
    "education_item_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "study_uid" VARCHAR(64) NOT NULL,
    "modalities" VARCHAR(64) NOT NULL,
    "instance_count" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "attached_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_series" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "series_uid" VARCHAR(64) NOT NULL,
    "modality" VARCHAR(16) NOT NULL,
    "number" INTEGER,
    "instance_count" INTEGER NOT NULL,

    CONSTRAINT "scan_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_instances" (
    "id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "sop_instance_uid" VARCHAR(64) NOT NULL,
    "sop_class_uid" VARCHAR(64) NOT NULL,
    "number" INTEGER,
    "storage_key" VARCHAR(200) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "scan_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scans_study_uid_key" ON "scans"("study_uid");

-- CreateIndex
CREATE INDEX "scans_case_id_idx" ON "scans"("case_id");

-- CreateIndex
CREATE INDEX "scans_education_item_id_idx" ON "scans"("education_item_id");

-- CreateIndex
CREATE INDEX "scans_attached_at_created_at_idx" ON "scans"("attached_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scan_series_series_uid_key" ON "scan_series"("series_uid");

-- CreateIndex
CREATE INDEX "scan_series_scan_id_idx" ON "scan_series"("scan_id");

-- CreateIndex
CREATE UNIQUE INDEX "scan_instances_sop_instance_uid_key" ON "scan_instances"("sop_instance_uid");

-- CreateIndex
CREATE INDEX "scan_instances_series_id_number_idx" ON "scan_instances"("series_id", "number");

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_education_item_id_fkey" FOREIGN KEY ("education_item_id") REFERENCES "education_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_series" ADD CONSTRAINT "scan_series_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_instances" ADD CONSTRAINT "scan_instances_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "scan_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A scan belongs to a case or to a library item, never to both (M36 plan §4).
ALTER TABLE "scans" ADD CONSTRAINT "scans_one_owner" CHECK (NOT ("case_id" IS NOT NULL AND "education_item_id" IS NOT NULL));
ALTER TABLE "scans" ADD CONSTRAINT "scans_counts" CHECK ("instance_count" > 0 AND "size_bytes" > 0 AND "position" >= 0);
