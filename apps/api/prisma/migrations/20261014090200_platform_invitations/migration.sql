-- M17 step 6: a verified person invites a colleague by email. The invitation gives no rights;
-- the address is kept as a keyed hash only.

-- CreateTable
CREATE TABLE "platform_invitations" (
    "id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "email_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_invitations_inviter_id_created_at_idx" ON "platform_invitations"("inviter_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_invitations_email_hash_idx" ON "platform_invitations"("email_hash");

-- AddForeignKey
ALTER TABLE "platform_invitations" ADD CONSTRAINT "platform_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

