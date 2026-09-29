/**
 * ORCID iDs: 16 characters in groups of four, the last a check character computed with
 * ISO 7064 MOD 11-2 (https://support.orcid.org/hc/en-us/articles/360006897674).
 */
const ORCID_FORMAT = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export function isValidOrcid(value: string): boolean {
  if (!ORCID_FORMAT.test(value)) return false;
  const digits = value.replace(/-/g, '');
  let total = 0;
  for (const char of digits.slice(0, 15)) {
    total = (total + Number(char)) * 2;
  }
  const result = (12 - (total % 11)) % 11;
  const check = result === 10 ? 'X' : String(result);
  return digits[15] === check;
}
