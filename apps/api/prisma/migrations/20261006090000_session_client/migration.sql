-- M14 checkpoint 2: sign-in for the mobile app (docs/plans/M14-mobile-app.md §5). A session
-- says what started it. Every session that exists was started by a browser. Only additions.

-- CreateEnum
CREATE TYPE "session_client" AS ENUM ('WEB', 'APP');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "client" "session_client" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "client_name" VARCHAR(80);

-- Only an app names its device.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_name"
  CHECK ("client_name" IS NULL OR "client" = 'APP');
