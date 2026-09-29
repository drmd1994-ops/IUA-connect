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
    /** The user holds a role that requires MFA, so it can't be turned off. */
    requiredByRole: z.boolean(),
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

export class ReauthenticateDto extends createZodDto(
  z.strictObject({ password: anyPassword, code: mfaCode.optional() }),
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
