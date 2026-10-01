-- M5 checkpoint 5: attendance. See docs/plans/M5-events.md §2.6 and §3.

-- CreateEnum
CREATE TYPE "attendance_method" AS ENUM ('QR', 'MANUAL');



-- CreateTable
CREATE TABLE "event_attendance" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "session_id" UUID,
    "user_id" UUID NOT NULL,
    "method" "attendance_method" NOT NULL,
    "recorded_by" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" VARCHAR(500),

    CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_attendance_event_id_at_idx" ON "event_attendance"("event_id", "at");

-- CreateIndex
CREATE INDEX "event_attendance_user_id_idx" ON "event_attendance"("user_id");

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Rules Prisma does not model.
-- ---------------------------------------------------------------------------
-- One live record per person per session, and one per person for the event as a whole. A voided
-- record doesn't count, so the person can be recorded again correctly.
CREATE UNIQUE INDEX "event_attendance_one_per_session" ON "event_attendance" ("session_id", "user_id")
  WHERE "session_id" IS NOT NULL AND "voided_at" IS NULL;
CREATE UNIQUE INDEX "event_attendance_one_per_event" ON "event_attendance" ("event_id", "user_id")
  WHERE "session_id" IS NULL AND "voided_at" IS NULL;

ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_manual_has_recorder"
  CHECK (("method" = 'MANUAL') = ("recorded_by" IS NOT NULL));
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_void_complete"
  CHECK (("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
      OR ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND "void_reason" IS NOT NULL));

-- Append-only: rows are never deleted (except with their event, session or account, through a
-- foreign-key cascade), and the only change allowed is voiding a live record, once.
CREATE FUNCTION event_attendance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
       AND NEW.id = OLD.id AND NEW.event_id = OLD.event_id
       AND NEW.session_id IS NOT DISTINCT FROM OLD.session_id
       AND NEW.user_id = OLD.user_id AND NEW.method = OLD.method
       AND NEW.recorded_by IS NOT DISTINCT FROM OLD.recorded_by AND NEW.at = OLD.at THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER event_attendance_append_only
  BEFORE UPDATE OR DELETE ON "event_attendance"
  FOR EACH ROW EXECUTE FUNCTION event_attendance_guard();
CREATE TRIGGER event_attendance_no_truncate
  BEFORE TRUNCATE ON "event_attendance"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
