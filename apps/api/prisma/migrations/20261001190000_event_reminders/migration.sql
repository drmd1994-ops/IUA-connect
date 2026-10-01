-- M5 checkpoint 6: the log of reminders sent. See docs/plans/M5-events.md §2.7.

-- CreateEnum
CREATE TYPE "reminder_kind" AS ENUM ('WEEK', 'DAY');



-- CreateTable
CREATE TABLE "event_reminders" (
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "reminder_kind" NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_reminders_pkey" PRIMARY KEY ("event_id","user_id","kind")
);

-- AddForeignKey
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

