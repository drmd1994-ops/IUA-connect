-- M1b passkeys: WebAuthn credentials in mfa_factors; challenge purposes in auth_tokens.
-- See docs/plans/M1b-passkeys.md §5.

ALTER TYPE "auth_token_purpose" ADD VALUE 'WEBAUTHN_REGISTRATION';
ALTER TYPE "auth_token_purpose" ADD VALUE 'WEBAUTHN_AUTHENTICATION';

-- AlterTable
ALTER TABLE "auth_tokens" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "mfa_factors" ADD COLUMN     "backed_up" BOOLEAN,
ADD COLUMN     "credential_id" BYTEA,
ADD COLUMN     "sign_count" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "transports" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "mfa_factors_credential_id_key" ON "mfa_factors"("credential_id");


-- ---------------------------------------------------------------------------
-- Integrity rules Prisma can't express
-- ---------------------------------------------------------------------------
-- A passkey always has its credential ID and public key.
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_webauthn_complete"
  CHECK ("type" <> 'WEBAUTHN' OR ("credential_id" IS NOT NULL AND "credential_public_key" IS NOT NULL));
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_sign_count_non_negative"
  CHECK ("sign_count" >= 0);

-- Only passkey sign-in challenges exist before the user is known. (Compared as text: an enum value
-- added in this migration can't be referenced as an enum within the same transaction.)
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_required"
  CHECK ("user_id" IS NOT NULL OR "purpose"::text = 'WEBAUTHN_AUTHENTICATION');
