-- M17 step 7: a verification is looked at again. The person is told, once, a month before an
-- approved verification ends; this is when.
ALTER TABLE "physician_verifications" ADD COLUMN "notice_sent_at" TIMESTAMPTZ(6);
