-- M7 checkpoint 1: notifications in the app and the switches a person sets per kind and channel.

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('ACCOUNT', 'MY_EVENTS', 'ASSOCIATION', 'NEWS', 'NEW_EVENTS', 'EDUCATION', 'GUIDELINES', 'WORK');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('APP', 'EMAIL');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "link" VARCHAR(500),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","kind","channel")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- A link is a path inside the site, never an address on another host.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_link_is_path"
  CHECK ("link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%'));
