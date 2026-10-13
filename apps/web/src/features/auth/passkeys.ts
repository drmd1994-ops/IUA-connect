import type { ApiClient, components } from '@medconnect/api-client';
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { unwrap } from './auth-context';

/**
 * Browser side of passkey ceremonies (docs/plans/M1b-passkeys.md). The browser shows its own
 * prompt (Windows Hello, phone, security key); these helpers pass options and responses between
 * it and the API.
 */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

export function passkeyAutofillSupported(): Promise<boolean> {
  return passkeysSupported() ? browserSupportsWebAuthnAutofill() : Promise.resolve(false);
}

/**
 * A WebAuthn response as the API schema describes it (an open JSON object). The browser library's
 * types describe the same JSON; the server verifies its content cryptographically.
 */
export type WireCredential = components['schemas']['PasskeySignInDto']['response'];
const toWire = (response: unknown) => response as WireCredential;

/** Why a ceremony ended without a credential; each maps to an auth.passkeys.* message. */
export class PasskeyCeremonyError extends Error {
  constructor(readonly reason: 'cancelled' | 'alreadyRegistered' | 'unsupported') {
    super(reason);
    this.name = 'PasskeyCeremonyError';
  }
}

function classify(error: unknown): never {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'AbortError')
    throw new PasskeyCeremonyError('cancelled');
  if (name === 'InvalidStateError') throw new PasskeyCeremonyError('alreadyRegistered');
  if (name === 'NotSupportedError') throw new PasskeyCeremonyError('unsupported');
  throw error;
}

/** Fetches a sign-in challenge and asks the browser for an assertion. */
export async function getAssertion(
  api: ApiClient,
  options: { autofill?: boolean } = {},
): Promise<WireCredential> {
  const optionsJSON = unwrap(
    await api.POST('/api/v1/auth/passkeys/authentication/options'),
  ) as unknown as PublicKeyCredentialRequestOptionsJSON;
  try {
    return toWire(
      await startAuthentication({ optionsJSON, useBrowserAutofill: options.autofill ?? false }),
    );
  } catch (error) {
    return classify(error);
  }
}

/** Asks the browser to create a passkey from registration options. */
export async function createPasskey(optionsJSON: unknown): Promise<WireCredential> {
  try {
    return toWire(
      await startRegistration({
        optionsJSON: optionsJSON as PublicKeyCredentialCreationOptionsJSON,
      }),
    );
  } catch (error) {
    return classify(error);
  }
}
