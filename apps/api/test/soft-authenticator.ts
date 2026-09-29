import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/**
 * A software WebAuthn authenticator for tests: a real P-256 key pair producing real attestation
 * ("none") and assertion signatures, so the server-side verification runs for real. It behaves
 * like a platform authenticator with user verification (fingerprint/face/PIN).
 */

// --- minimal CBOR encoder (maps with integer/text keys, byte strings, integers, text) ---------

function head(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  if (value < 65536) return Buffer.from([(major << 5) | 25, value >> 8, value & 0xff]);
  const out = Buffer.alloc(5);
  out[0] = (major << 5) | 26;
  out.writeUInt32BE(value, 1);
  return out;
}

type Cbor = number | string | Buffer | Map<number | string, Cbor>;

function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  const parts = [head(5, value.size)];
  for (const [key, item] of value) parts.push(cbor(key), cbor(item));
  return Buffer.concat(parts);
}

// --- authenticator -------------------------------------------------------------------------------

const b64url = (bytes: Buffer) => bytes.toString('base64url');
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest();

// Flags: UP (user present) 0x01, UV (user verified) 0x04, BE (backup eligible) 0x08,
// BS (backed up) 0x10, AT (attested credential data) 0x40.
const UP = 0x01;
const UV = 0x04;
const BE = 0x08;
const BS = 0x10;
const AT = 0x40;

export interface SoftAuthenticatorOptions {
  rpId?: string;
  origin?: string;
  /** Starting signature counter; synced passkeys usually report 0 forever. */
  counter?: number;
  /** Behave like a synced passkey (backup eligible and backed up). */
  synced?: boolean;
  /** Set false to simulate an authenticator that skips user verification. */
  userVerification?: boolean;
}

export class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  counter: number;
  rpId: string;
  origin: string;
  userVerification: boolean;
  private readonly synced: boolean;

  constructor(options: SoftAuthenticatorOptions = {}) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    this.publicJwk = { x: jwk.x, y: jwk.y };
    this.counter = options.counter ?? 0;
    this.rpId = options.rpId ?? 'localhost';
    this.origin = options.origin ?? 'http://localhost:3001';
    this.synced = options.synced ?? false;
    this.userVerification = options.userVerification ?? true;
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  private flags(extra = 0): number {
    return UP | (this.userVerification ? UV : 0) | (this.synced ? BE | BS : 0) | extra;
  }

  private counterBytes(): Buffer {
    const out = Buffer.alloc(4);
    out.writeUInt32BE(this.counter);
    return out;
  }

  private clientData(type: string, challenge: string): Buffer {
    return Buffer.from(
      JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }),
    );
  }

  /** navigator.credentials.create() → RegistrationResponseJSON */
  register(options: { challenge: string }) {
    const cosePublicKey = cbor(
      new Map<number, Cbor>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(this.publicJwk.x, 'base64url')],
        [-3, Buffer.from(this.publicJwk.y, 'base64url')],
      ]),
    );
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([this.flags(AT)]),
      this.counterBytes(),
      Buffer.alloc(16), // AAGUID (none)
      idLength,
      this.credentialId,
      cosePublicKey,
    ]);
    const attestationObject = cbor(
      new Map<string, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge)),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** navigator.credentials.get() → AuthenticationResponseJSON (the counter advances by 1). */
  assert(options: { challenge: string }, overrides: { counter?: number } = {}) {
    this.counter = overrides.counter ?? this.counter + (this.counter > 0 ? 1 : 0);
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([this.flags()]),
      this.counterBytes(),
    ]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientDataJSON)]),
      this.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
