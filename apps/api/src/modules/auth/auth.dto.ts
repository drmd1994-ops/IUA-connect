import { LOCALES } from '@iua/i18n';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const email = z.email().max(254).trim().toLowerCase();
/** Login accepts any length the policy might once have allowed; bounded to keep hashing cheap. */
const anyPassword = z.string().min(1).max(1024);
const locale = z.enum(LOCALES);
const opaqueToken = z.string().min(20).max(200);

export class RegisterDto extends createZodDto(
  z.strictObject({ email, password: anyPassword, locale: locale.optional() }),
) {}

export class VerifyEmailDto extends createZodDto(z.strictObject({ token: opaqueToken })) {}

export class ResendVerificationDto extends createZodDto(z.strictObject({ email })) {}

export class LoginDto extends createZodDto(z.strictObject({ email, password: anyPassword })) {}

export class AcceptedDto extends createZodDto(z.strictObject({ status: z.literal('accepted') })) {}

export class OkDto extends createZodDto(z.strictObject({ status: z.literal('ok') })) {}

export class TokenDto extends createZodDto(
  z.strictObject({
    accessToken: z.string(),
    /** Seconds until the access token expires. */
    expiresIn: z.number().int(),
  }),
) {}

/**
 * mfaRequired false → accessToken and expiresIn are set (and the refresh cookie).
 * mfaRequired true  → mfaToken is set: exchange it with a code at POST /auth/mfa/verify (5 min).
 */
export class LoginResultDto extends createZodDto(
  z.strictObject({
    mfaRequired: z.boolean(),
    accessToken: z.string().optional(),
    expiresIn: z.number().int().optional(),
    mfaToken: z.string().optional(),
    /**
     * With mfaRequired: which second steps the account has. "totp": a code (or recovery code) at
     * /auth/mfa/verify with mfaToken. "passkey": a passkey sign-in (/auth/passkeys/authentication/*),
     * which completes sign-in on its own.
     */
    mfaMethods: z.array(z.enum(['totp', 'passkey'])).optional(),
  }),
) {}

export class UpdateMeDto extends createZodDto(z.strictObject({ locale })) {}

export class MeDto extends createZodDto(
  z.strictObject({
    id: z.uuid(),
    email: z.string(),
    emailVerified: z.boolean(),
    locale,
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
    mfaEnabled: z.boolean(),
    /** Holds a role that requires MFA but hasn't enrolled: the UI must send them to setup. */
    mfaEnrollmentRequired: z.boolean(),
    session: z.strictObject({ id: z.uuid(), mfa: z.boolean() }),
  }),
) {}

// --- MFA, re-authentication, passwords, sessions (checkpoint 4) ---------------

/** A 6-digit authenticator code, or a recovery code (xxxxx-xxxxx). */
const mfaCode = z.string().trim().min(6).max(20);

export class MfaVerifyDto extends createZodDto(
  z.strictObject({ mfaToken: opaqueToken, code: mfaCode }),
) {}

export class MfaStatusDto extends createZodDto(
  z.strictObject({
    enabled: z.boolean(),
    factorId: z.uuid().optional(),
    recoveryCodesRemaining: z.number().int(),
    /** The user holds a role that requires MFA. */
    requiredByRole: z.boolean(),
    /** The authenticator app can be turned off (false when a role requires MFA and it's the only factor). */
    canDisable: z.boolean(),
  }),
) {}

export class TotpSetupDto extends createZodDto(
  z.strictObject({
    factorId: z.uuid(),
    secret: z.string(),
    otpauthUri: z.string(),
    qrCode: z.string(),
  }),
) {}

export class TotpConfirmDto extends createZodDto(
  z.strictObject({
    factorId: z.uuid(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  }),
) {}

export class RecoveryCodesDto extends createZodDto(
  z.strictObject({ recoveryCodes: z.array(z.string()) }),
) {}

/**
 * WebAuthn responses as produced by @simplewebauthn/browser. Kept loose on purpose: browsers add
 * extension fields, and the library verifies the content cryptographically.
 */
const webauthnResponse = z.looseObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  response: z.looseObject({ clientDataJSON: z.string().min(1) }),
  clientExtensionResults: z.looseObject({}),
});

/** Re-enter the password (+ code when MFA is on), or use a passkey instead: exactly one of them. */
export class ReauthenticateDto extends createZodDto(
  z
    .strictObject({
      password: anyPassword.optional(),
      code: mfaCode.optional(),
      passkey: webauthnResponse.optional(),
    })
    .refine((body) => (body.password === undefined) !== (body.passkey === undefined), {
      message: 'Give either password (+ code) or passkey',
      path: ['password'],
    }),
) {}

// --- passkeys (M1b) ------------------------------------------------------------

const passkeyName = z.string().trim().min(1).max(100);

/** WebAuthn creation/request options, passed unchanged to @simplewebauthn/browser. */
export class WebAuthnOptionsDto extends createZodDto(z.record(z.string(), z.unknown())) {}

export class PasskeyRegisterDto extends createZodDto(
  z.strictObject({ response: webauthnResponse, name: passkeyName }),
) {}

export class PasskeyRenameDto extends createZodDto(z.strictObject({ name: passkeyName })) {}

export class PasskeySignInDto extends createZodDto(
  z.strictObject({ response: webauthnResponse }),
) {}

const passkeySummary = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  /** Synced across the person's devices (iCloud Keychain, Google Password Manager, ...). */
  synced: z.boolean(),
});

export class PasskeyDto extends createZodDto(passkeySummary) {}

export class PasskeyListDto extends createZodDto(
  z.strictObject({ passkeys: z.array(passkeySummary) }),
) {}

export class PasswordChangeDto extends createZodDto(
  z.strictObject({ currentPassword: anyPassword, newPassword: anyPassword }),
) {}

export class PasswordForgotDto extends createZodDto(z.strictObject({ email })) {}

export class PasswordResetDto extends createZodDto(
  z.strictObject({ token: opaqueToken, newPassword: anyPassword }),
) {}

export class SessionListDto extends createZodDto(
  z.strictObject({
    sessions: z.array(
      z.strictObject({
        id: z.uuid(),
        /** e.g. "Chrome on Windows" */
        device: z.string(),
        ip: z.string().nullable(),
        createdAt: z.iso.datetime(),
        lastSeenAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        current: z.boolean(),
      }),
    ),
  }),
) {}

export class RevokedCountDto extends createZodDto(z.strictObject({ revoked: z.number().int() })) {}
