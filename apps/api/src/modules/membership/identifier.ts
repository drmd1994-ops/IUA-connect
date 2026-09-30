/**
 * Identifiers applicants give (owner answers to O3 and the M2 plan §11): a specialist certificate
 * number for FULL_MEMBER, a medical licence number for RESIDENT and NON_FULL_MEMBER, nothing for
 * STUDENT. Digits only, 1–15 of them; spaces and dashes people type are ignored. Not checked
 * against any registry (D2/D3).
 */
export type IdentifierKind = 'NONE' | 'SPECIALIST_CERTIFICATE' | 'MEDICAL_LICENCE';

export type IdentifierCheck =
  | { ok: true; value: string | null }
  | { ok: false; code: 'identifierRequired' | 'identifierInvalid' | 'identifierNotExpected' };

export function checkIdentifier(kind: IdentifierKind, input: string | undefined): IdentifierCheck {
  const given = input?.replace(/[\s-]/g, '') ?? '';
  if (kind === 'NONE') {
    return given === '' ? { ok: true, value: null } : { ok: false, code: 'identifierNotExpected' };
  }
  if (given === '') return { ok: false, code: 'identifierRequired' };
  if (!/^\d{1,15}$/.test(given)) return { ok: false, code: 'identifierInvalid' };
  return { ok: true, value: given };
}

/**
 * What gets hashed for the uniqueness check. The kind is part of it, so a certificate number
 * and a licence number that happen to share digits don't collide.
 */
export function identifierHashInput(kind: IdentifierKind, value: string): string {
  return `membership-identifier:${kind}:${value}`;
}
