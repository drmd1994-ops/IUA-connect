import { z } from 'zod';
import { type IdentifierKind, checkIdentifier } from '../identifier';
import { endOfYear } from '../period';
import { CsvError, parseCsv } from './csv';

/** Columns of a membership import file (header row, any order, case-insensitive). */
export const REQUIRED_COLUMNS = ['email', 'first_name', 'last_name', 'membership_type'] as const;
export const OPTIONAL_COLUMNS = ['identifier', 'end_date', 'payment_status', 'locale'] as const;
const COLUMNS: readonly string[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export const MAX_ROWS = 5000;

const PAYMENT = ['NOT_REQUIRED', 'UNPAID', 'PAID', 'WAIVED'] as const;
export type Payment = (typeof PAYMENT)[number];

export interface ImportRecord {
  email: string;
  firstName: string;
  lastName: string;
  typeKey: string;
  identifierKind: IdentifierKind;
  /** Digits only; never reported or logged. */
  identifier: string | null;
  endDate: Date;
  /** Null: keep the current one (new memberships start NOT_REQUIRED). */
  paymentStatus: Payment | null;
  locale: 'he' | 'en';
}

export interface ReadRow {
  line: number;
  /** As given, lower-cased, when it looks like an email (for the report). */
  email: string | null;
  record: ImportRecord | null;
  /** Why the row can't be imported (i18n codes). Empty when record is set. */
  reasons: string[];
}

export interface ReadResult {
  fileErrors: { code: string; line?: number; column?: string }[];
  rows: ReadRow[];
}

const emailSchema = z.email().max(254);
const name = z.string().trim().min(1).max(100);

/**
 * Reads and checks an import file without touching the database. `types` maps each active
 * membership type key to the identifier it needs.
 */
export function readImport(
  text: string,
  types: ReadonlyMap<string, IdentifierKind>,
  today: Date,
): ReadResult {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvError) {
      return { fileErrors: [{ code: error.code, line: error.line }], rows: [] };
    }
    throw error;
  }
  const [header, ...body] = parsed;
  if (!header) return { fileErrors: [{ code: 'emptyFile' }], rows: [] };

  const columns = header.fields.map((f) => f.trim().toLowerCase());
  const fileErrors: ReadResult['fileErrors'] = [];
  for (const column of columns) {
    if (!COLUMNS.includes(column)) fileErrors.push({ code: 'unknownColumn', column });
  }
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.includes(column)) fileErrors.push({ code: 'missingColumn', column });
  }
  if (new Set(columns).size !== columns.length) fileErrors.push({ code: 'duplicateColumn' });
  if (body.length === 0) fileErrors.push({ code: 'noRows' });
  if (body.length > MAX_ROWS) fileErrors.push({ code: 'tooManyRows' });
  if (fileErrors.length) return { fileErrors, rows: [] };

  const seenEmails = new Set<string>();
  const seenIdentifiers = new Set<string>();
  const rows = body.map(({ line, fields }): ReadRow => {
    const cell = (column: string) => (fields[columns.indexOf(column)] ?? '').trim();
    const reasons: string[] = [];
    if (fields.length !== columns.length) reasons.push('wrongColumnCount');

    const rawEmail = cell('email').toLowerCase();
    const email = emailSchema.safeParse(rawEmail).success ? rawEmail : null;
    if (!email) reasons.push('invalidEmail');
    else if (seenEmails.has(email)) reasons.push('duplicateEmail');
    else seenEmails.add(email);

    const firstName = name.safeParse(cell('first_name'));
    const lastName = name.safeParse(cell('last_name'));
    if (!firstName.success || !lastName.success) reasons.push('invalidName');

    const typeKey = cell('membership_type').toUpperCase();
    const identifierKind = types.get(typeKey);
    let identifier: string | null = null;
    if (!identifierKind) {
      reasons.push('unknownMembershipType');
    } else {
      const checked = checkIdentifier(identifierKind, cell('identifier'));
      if (!checked.ok) reasons.push(checked.code);
      else if (checked.value) {
        const key = `${identifierKind}:${checked.value}`;
        if (seenIdentifiers.has(key)) reasons.push('duplicateIdentifier');
        else seenIdentifiers.add(key);
        identifier = checked.value;
      }
    }

    let endDate = endOfYear(today);
    const rawEnd = cell('end_date');
    if (rawEnd) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? new Date(`${rawEnd}T00:00:00Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawEnd) {
        reasons.push('invalidEndDate');
      } else if (date < today) {
        reasons.push('endDateInPast');
      } else {
        endDate = date;
      }
    }

    const rawPayment = cell('payment_status').toUpperCase();
    const paymentStatus = rawPayment === '' ? null : (rawPayment as Payment);
    if (paymentStatus && !PAYMENT.includes(paymentStatus)) reasons.push('invalidPaymentStatus');

    const rawLocale = cell('locale').toLowerCase();
    if (rawLocale && rawLocale !== 'he' && rawLocale !== 'en') reasons.push('invalidLocale');

    if (reasons.length) return { line, email, record: null, reasons };
    return {
      line,
      email,
      reasons,
      record: {
        email: email!,
        firstName: firstName.data!,
        lastName: lastName.data!,
        typeKey,
        identifierKind: identifierKind!,
        identifier,
        endDate,
        paymentStatus,
        locale: rawLocale === 'en' ? 'en' : 'he',
      },
    };
  });
  return { fileErrors: [], rows };
}
