-- M7 checkpoint 2: newly published items that people are told about once, and what each
-- person has read of them.

-- CreateTable
CREATE TABLE "content_announcements" (
    "id" UUID NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "title_he" VARCHAR(300),
    "title_en" VARCHAR(300),
    "link" VARCHAR(500) NOT NULL,
    "access_tier" "access_tier" NOT NULL,
    "type_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "digested_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "user_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("user_id","announcement_id")
);

-- CreateTable
CREATE TABLE "notification_state" (
    "user_id" UUID NOT NULL,
    "announcements_read_until" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_state_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "content_announcements_digested_at_idx" ON "content_announcements"("digested_at");

-- CreateIndex
CREATE INDEX "content_announcements_created_at_idx" ON "content_announcements"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_announcements_entity_type_entity_id_key" ON "content_announcements"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "announcement_reads_announcement_id_idx" ON "announcement_reads"("announcement_id");

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "content_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
ALTER TABLE "content_announcements" ADD CONSTRAINT "content_announcements_link_is_path"
  CHECK ("link" LIKE '/%' AND "link" NOT LIKE '//%');
ALTER TABLE "content_announcements" ADD CONSTRAINT "content_announcements_has_title"
  CHECK ("title_he" IS NOT NULL OR "title_en" IS NOT NULL);
