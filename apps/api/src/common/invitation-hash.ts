/**
 * What is hashed (with the keyed SecretHasher) to remember an invited address (M17 step 6):
 * the address in lower case, trimmed, so the same address is the same however it was typed.
 */
export function invitationHashInput(email: string): string {
  return `platform-invitation:${email.trim().toLowerCase()}`;
}
