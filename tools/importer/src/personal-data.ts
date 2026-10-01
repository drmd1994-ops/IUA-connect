/**
 * The personal-data check (M4 plan §4): imported text may hold bylines and nothing else about
 * people. Any fixture containing an email address, a phone number or an ID-like number fails
 * the import, and the owner decides what to do with that page.
 */
const CHECKS: { name: string; pattern: RegExp }[] = [
  { name: 'email address', pattern: /[\w.+-]+@[\w-]+(\.[\w-]+)+/ },
  // Israeli phone numbers: 05x-xxxxxxx, 0x-xxxxxxx, +972…, with or without separators.
  { name: 'phone number', pattern: /(?:\+972[-\s]?|0)(?:5\d|[2-489]|7\d)[-\s]?\d{3}[-\s]?\d{4}/ },
  // A run of 8 or 9 digits (identity and licence numbers); years and article numbers are shorter.
  { name: 'ID-like number', pattern: /(?<!\d)\d{8,9}(?!\d)/ },
];

/** The kinds of personal data found in the texts (empty when clean). */
export function findPersonalData(texts: readonly (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const check of CHECKS) if (check.pattern.test(text)) found.add(check.name);
  }
  return [...found];
}
