-- M5 checkpoint 2: sessions, speakers and session materials. See docs/plans/M5-events.md §2.2.



-- CreateTable
CREATE TABLE "event_sessions" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "room" VARCHAR(200),
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_session_translations" (
    "session_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" VARCHAR(4000),

    CONSTRAINT "event_session_translations_pkey" PRIMARY KEY ("session_id","locale")
);

-- CreateTable
CREATE TABLE "speakers" (
    "id" UUID NOT NULL,
    "photo_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaker_translations" (
    "speaker_id" UUID NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "title" VARCHAR(100),
    "affiliation" VARCHAR(300),
    "bio" VARCHAR(2000),

    CONSTRAINT "speaker_translations_pkey" PRIMARY KEY ("speaker_id","locale")
);

-- CreateTable
CREATE TABLE "session_speakers" (
    "session_id" UUID NOT NULL,
    "speaker_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "session_speakers_pkey" PRIMARY KEY ("session_id","speaker_id")
);

-- CreateTable
CREATE TABLE "session_materials" (
    "session_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "session_materials_pkey" PRIMARY KEY ("session_id","file_id")
);

CREATE INDEX "event_sessions_event_id_start_at_idx" ON "event_sessions"("event_id", "start_at");


CREATE INDEX "session_speakers_speaker_id_idx" ON "session_speakers"("speaker_id");

CREATE INDEX "session_materials_file_id_idx" ON "session_materials"("file_id");

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_session_translations" ADD CONSTRAINT "event_session_translations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_translations" ADD CONSTRAINT "speaker_translations_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "speakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "speakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_end_after_start"
  CHECK ("end_at" > "start_at");
ALTER TABLE "event_session_translations" ADD CONSTRAINT "event_session_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');
ALTER TABLE "speaker_translations" ADD CONSTRAINT "speaker_translations_locale"
  CHECK ("locale" ~ '^[a-z]{2}$');

-- Search (DATABASE_DESIGN.md §5), as for events. The search API is M7.
ALTER TABLE "event_session_translations" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION event_session_translations_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.description, ''))), 'B');
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_session_translations_search_vector
  BEFORE INSERT OR UPDATE OF "title", "description" ON "event_session_translations"
  FOR EACH ROW EXECUTE FUNCTION event_session_translations_search_vector();
CREATE INDEX "event_session_translations_search_idx" ON "event_session_translations"
  USING GIN ("search_vector");
