-- M27: research projects, requests to join them, and publications on profiles. (Prisma also
-- wanted to drop the hand-written department constraints of positions, profiles and
-- verification_requests; those lines were removed.)

-- CreateEnum
CREATE TYPE "study_type" AS ENUM ('PROSPECTIVE', 'RETROSPECTIVE', 'TRIAL', 'REGISTRY', 'SURVEY', 'OTHER');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('PLANNING', 'RECRUITING', 'ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ethics_status" AS ENUM ('APPROVED', 'SUBMITTED', 'NOT_YET', 'NOT_NEEDED');

-- CreateEnum
CREATE TYPE "project_need" AS ENUM ('CENTRES', 'CO_INVESTIGATORS', 'STATISTICIAN', 'RESIDENTS', 'STUDENTS');

-- CreateEnum
CREATE TYPE "research_request_state" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "publication_source" AS ENUM ('MANUAL', 'PUBMED', 'ORCID');

-- CreateTable
CREATE TABLE "research_projects" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "study_type" "study_type" NOT NULL,
    "status" "project_status" NOT NULL DEFAULT 'PLANNING',
    "ethics" "ethics_status" NOT NULL,
    "funding" VARCHAR(300),
    "contact" VARCHAR(300),
    "needs" "project_need"[] DEFAULT ARRAY[]::"project_need"[],
    "open" BOOLEAN NOT NULL DEFAULT true,
    "ended_at" TIMESTAMPTZ(6),
    "group_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_asked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "research_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_project_subspecialties" (
    "project_id" UUID NOT NULL,
    "subspecialty_id" UUID NOT NULL,

    CONSTRAINT "research_project_subspecialties_pkey" PRIMARY KEY ("project_id","subspecialty_id")
);

-- CreateTable
CREATE TABLE "research_requests" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "state" "research_request_state" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "research_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "authors" VARCHAR(2000) NOT NULL DEFAULT '',
    "journal" VARCHAR(300),
    "year" SMALLINT,
    "doi" VARCHAR(200),
    "pmid" VARCHAR(20),
    "url" VARCHAR(500),
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "publication_source" NOT NULL DEFAULT 'MANUAL',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_projects_group_id_key" ON "research_projects"("group_id");

-- CreateIndex
CREATE INDEX "research_projects_status_updated_at_idx" ON "research_projects"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "research_projects_lead_id_idx" ON "research_projects"("lead_id");

-- CreateIndex
CREATE INDEX "research_project_subspecialties_subspecialty_id_idx" ON "research_project_subspecialties"("subspecialty_id");

-- CreateIndex
CREATE INDEX "research_requests_project_id_state_idx" ON "research_requests"("project_id", "state");

-- CreateIndex
CREATE INDEX "research_requests_user_id_state_idx" ON "research_requests"("user_id", "state");

-- CreateIndex
CREATE INDEX "research_requests_state_created_at_idx" ON "research_requests"("state", "created_at");

-- CreateIndex
CREATE INDEX "publications_user_id_position_idx" ON "publications"("user_id", "position");

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_subspecialties" ADD CONSTRAINT "research_project_subspecialties_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_subspecialties" ADD CONSTRAINT "research_project_subspecialties_subspecialty_id_fkey" FOREIGN KEY ("subspecialty_id") REFERENCES "subspecialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Written by hand (Prisma does not model these; keep them out of later generated migrations).

-- One open request per person and project.
CREATE UNIQUE INDEX "research_requests_one_open_per_pair" ON "research_requests"("project_id", "user_id")
  WHERE "state" IN ('PENDING', 'ACCEPTED');
ALTER TABLE "publications" ADD CONSTRAINT "publications_year"
  CHECK ("year" IS NULL OR "year" BETWEEN 1900 AND 2100);
