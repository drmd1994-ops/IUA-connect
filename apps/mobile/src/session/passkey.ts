import { Passkey, type PasskeyCreateRequest, type PasskeyGetRequest } from 'react-native-passkey';

/**
 * The phone's passkeys (M18b), through Android's Credential Manager. The server's options go to
 * the phone unchanged, and its answer goes back to the server, which checks it. Android lets the
 * app use the site's passkeys only because the site names the app's signing key
 * (/.well-known/assetlinks.json).
 */

/** Why a passkey prompt ended without a passkey; each maps to a message. */
export class PasskeyProblem extends Error {
  constructor(readonly reason: 'cancelled' | 'alreadyRegistered' | 'unsupported' | 'none') {
    super(reason);
    this.name = 'PasskeyProblem';
  }
}

export function passkeysSupported(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

/** The library's error, as one of the reasons above; anything else is passed on. */
export function classifyPasskeyError(error: unknown): PasskeyProblem | unknown {
  const code = (error as { error?: unknown } | null)?.error;
  if (code === 'UserCancelled' || code === 'Interrupted' || code === 'TimedOut') {
    return new PasskeyProblem('cancelled');
  }
  if (code === 'CredentialAlreadyExists') return new PasskeyProblem('alreadyRegistered');
  if (code === 'NoCredentials') return new PasskeyProblem('none');
  if (code === 'NotSupported' || code === 'BadConfiguration' || code === 'NoCreateOption') {
    return new PasskeyProblem('unsupported');
  }
  return error;
}

/** The answer as the server reads it: the fields the phone may leave out are filled in. */
function wire(result: object): Record<string, unknown> {
  return { type: 'public-key', clientExtensionResults: {}, ...result };
}

/** Asks the phone for one of the site's passkeys, to sign in or confirm it's you. */
export async function askForPasskey(options: Record<string, unknown>) {
  try {
    return wire(await Passkey.get(options as unknown as PasskeyGetRequest));
  } catch (error) {
    throw classifyPasskeyError(error);
  }
}

/** Asks the phone to make a passkey for the site, from the server's options. */
export async function makePasskey(options: Record<string, unknown>) {
  try {
    return wire(await Passkey.create(options as unknown as PasskeyCreateRequest));
  } catch (error) {
    throw classifyPasskeyError(error);
  }
}
