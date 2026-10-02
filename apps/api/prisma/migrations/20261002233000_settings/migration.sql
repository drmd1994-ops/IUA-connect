-- M8: the few site settings an administrator changes (contact details, a notice banner).

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(40) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- Only the keys the application knows.
ALTER TABLE "settings" ADD CONSTRAINT "settings_known_key"
  CHECK ("key" IN ('contact', 'notice'));
