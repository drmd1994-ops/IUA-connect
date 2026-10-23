/**
 * The patient-details check (M25 plan §3; owner answer §10.4: it blocks). Before a post or a
 * comment is sent, its text is looked at for what looks like a patient's details. What is found
 * stops the text until it is changed, and the writer is told what and where.
 *
 * It is a help, not a guarantee: it knows a few patterns, and a name alone, for example, is not
 * one of them. Ordinary medical text (ages, doses, years, lab values) must pass, and the tests
 * check that it does.
 */
export const PATIENT_DETAIL_KINDS = [
  /** An Israeli ID number: 9 digits with a valid check digit. */
  'idNumber',
  /** A phone number. */
  'phone',
  /** A full date: a day, a month and a year. */
  'date',
  /** A hospital record or case number, after its label. */
  'recordNumber',
  /** A patient's name, after its label ("patient name", "שם המטופל"). */
  'patientName',
  /** An email address. */
  'email',
] as const;
export type PatientDetailKind = (typeof PATIENT_DETAIL_KINDS)[number];

export interface PatientDetail {
  kind: PatientDetailKind;
  /** The text that matched, as written. */
  text: string;
}

/** Whether nine digits (or fewer, padded) form a valid Israeli ID number. */
export function validIsraeliId(digits: string): boolean {
  if (!/^\d{5,9}$/.test(digits)) return false;
  const padded = digits.padStart(9, '0');
  if (/^0+$/.test(padded)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let step = Number(padded[i]) * ((i % 2) + 1);
    if (step > 9) step -= 9;
    sum += step;
  }
  return sum % 10 === 0;
}

// Digits not touching other digits or letters on either side.
const NINE_DIGITS = /(?<![\p{L}\p{N}])\d{9}(?![\p{L}\p{N}])/gu;
const PHONE =
  /(?<![\p{L}\p{N}])(?:\+972[-\s]?|0)(?:5\d|[2-4]|[89]|7\d)[-\s]?\d{3}[-\s]?\d{4}(?![\p{L}\p{N}])/gu;
const DATE_DMY =
  /(?<!\d)(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:\d{4}|\d{2})(?!\d)/g;
const DATE_YMD = /(?<!\d)(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d)/g;
const RECORD =
  /(?:MRN|record\s*(?:no\.?|number|#)|case\s*(?:no\.?|number|#)|מס(?:פר|['׳])\s*(?:תיק|רשומה|מקרה)|ת\.?ז\.?|תעודת\s*זהות)\s*[:#-]?\s*\d{4,}/giu;
const NAME =
  /(?:patient(?:'s)?\s+name|name\s+of\s+the\s+patient|שם\s+(?:ה)?(?:מטופל|מטופלת|חולה|חולָה))\s*[:-]?\s*[\p{L}'׳-]{2,}(?:\s+[\p{L}'׳-]{2,})?/giu;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** What in the text looks like a patient's details, in the order found; empty when nothing. */
export function findPatientDetails(text: string): PatientDetail[] {
  const found: { at: number; detail: PatientDetail }[] = [];
  const add = (kind: PatientDetailKind, pattern: RegExp, keep = (_: string) => true) => {
    for (const match of text.matchAll(pattern)) {
      if (keep(match[0])) found.push({ at: match.index ?? 0, detail: { kind, text: match[0] } });
    }
  };
  add('idNumber', NINE_DIGITS, validIsraeliId);
  add('phone', PHONE);
  add('date', DATE_DMY);
  add('date', DATE_YMD);
  add('recordNumber', RECORD);
  add('patientName', NAME);
  add('email', EMAIL);
  found.sort((a, b) => a.at - b.at);
  // One finding per stretch of text: a record number's digits are not also an ID number.
  const seen = new Set<string>();
  return found
    .filter(({ detail }) => {
      const key = detail.text;
      if ([...seen].some((earlier) => earlier.includes(key) || key.includes(earlier))) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map(({ detail }) => detail);
}
