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
