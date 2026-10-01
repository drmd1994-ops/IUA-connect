-- M3 checkpoint 1: files (uploads with type detection, re-encoded images, signed downloads)
-- and the profile photo. See docs/plans/M3-content-core.md §2.1 and §4.

-- CreateEnum
CREATE TYPE "file_kind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "file_purpose" AS ENUM ('CONTENT', 'PROFILE_PHOTO');

-- CreateEnum
CREATE TYPE "scan_status" AS ENUM ('UNSCANNED', 'CLEAN', 'INFECTED', 'ERROR');

-- AlterEnum
ALTER TYPE "profile_field" ADD VALUE 'PHOTO';

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "photo_file_id" UUID;

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(200) NOT NULL,
    "thumbnail_key" VARCHAR(200),
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "kind" "file_kind" NOT NULL,
    "purpose" "file_purpose" NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "scan_status" "scan_status" NOT NULL DEFAULT 'UNSCANNED',
    "owner_user_id" UUID,
    "attached_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "files_thumbnail_key_key" ON "files"("thumbnail_key");

-- CreateIndex
CREATE INDEX "files_attached_at_created_at_idx" ON "files"("attached_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_photo_file_id_key" ON "profiles"("photo_file_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma can't express (DATABASE_DESIGN.md §1 "Constraints")
-- ---------------------------------------------------------------------------
ALTER TABLE "files" ADD CONSTRAINT "files_size_positive" CHECK ("size_bytes" > 0);
ALTER TABLE "files" ADD CONSTRAINT "files_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "files" ADD CONSTRAINT "files_image_dimensions"
  CHECK (("kind" = 'IMAGE') = ("width" IS NOT NULL AND "height" IS NOT NULL));
ALTER TABLE "files" ADD CONSTRAINT "files_photo_is_image"
  CHECK ("purpose" <> 'PROFILE_PHOTO' OR "kind" = 'IMAGE');
