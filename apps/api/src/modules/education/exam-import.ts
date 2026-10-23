/**
 * Importing exam questions from a spreadsheet (M23 plan §2): one question per row, saved as CSV
 * from Excel. Imported questions are drafts; nothing is published by the import. A file with any
 * bad row is refused whole, with each row's number and the reason, so nothing is half-loaded.
 */
import { LEVELS } from './education.dto';
import { MAX_OPTIONS, MIN_OPTIONS } from './exam-rules';

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const MAX_IMPORT_ROWS = 500;
const MAX_REFERENCES = 3;

const optionColumns = Array.from({ length: MAX_OPTIONS }, (_, i) => [
  `option_${i + 1}_he`,
  `option_${i + 1}_en`,
  `explanation_${i + 1}_he`,
  `explanation_${i + 1}_en`,
]).flat();
const referenceColumns = Array.from({ length: MAX_REFERENCES }, (_, i) => [
  `reference_${i + 1}_title`,
  `reference_${i + 1}_url`,
]).flat();

/** The template's columns, in order. Only `source`, a stem, two options and `correct` are required. */
export const IMPORT_COLUMNS = [
  'topic',
  'level',
  'difficulty',
  'stem_he',
  'stem_en',
  'summary_he',
  'summary_en',
  ...optionColumns,
  'correct',
  ...referenceColumns,
  'source',
] as const;

/** A byte-order mark: with it, Excel reads the file as UTF-8 and shows Hebrew correctly. */
const BOM = String.fromCharCode(0xfeff);

/** The empty template: the header row only. */
export function importTemplate(): string {
  return `${BOM}${IMPORT_COLUMNS.join(',')}\r\n`;
}

/**
 * Splits CSV text into rows of fields (RFC 4180): commas, double quotes around a field that
 * holds commas, quotes or line breaks, and "" for a quote inside one. Returns null when a quoted
 * field never closes.
 */
export function parseCsv(text: string): string[][] | null {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) return null;
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Rows Excel leaves empty (only commas) are not questions.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export interface ImportedQuestion {
  /** A subspecialty key, or null for none. */
  topic: string | null;
  level: (typeof LEVELS)[number] | null;
  difficulty: (typeof DIFFICULTIES)[number] | null;
  translations: {
    he?: { stem: string; summary: string };
    en?: { stem: string; summary: string };
  };
  options: {
    correct: boolean;
    translations: {
      he?: { text: string; explanation: string };
      en?: { text: string; explanation: string };
    };
  }[];
  references: { title: string; url?: string }[];
  source: string;
}

/** One problem: the spreadsheet's row number (the header is row 1), the column, and why. */
export interface ImportProblem {
  row: number;
  column: string | null;
  code: string;
}

export type ImportResult =
  { ok: true; questions: ImportedQuestion[] } | { ok: false; problems: ImportProblem[] };

const LIMITS: Record<string, number> = {
  stem: 4000,
  summary: 4000,
  option: 1000,
  explanation: 4000,
  reference_title: 300,
  reference_url: 500,
  source: 500,
};

function limitOf(column: string): number {
  if (column.startsWith('option_')) return LIMITS.option!;
  if (column.startsWith('explanation_')) return LIMITS.explanation!;
  if (column.startsWith('reference_')) {
    return column.endsWith('_url') ? LIMITS.reference_url! : LIMITS.reference_title!;
  }
  return LIMITS[column.replace(/_(he|en)$/, '')] ?? 100;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Reads the spreadsheet into questions, or every problem found. `topics` are the subspecialty
 * keys that exist. Column names are matched without regard to case or spaces, in any order.
 */
export function readImport(text: string, topics: ReadonlySet<string>): ImportResult {
  const rows = parseCsv(text);
  if (!rows) return { ok: false, problems: [{ row: 0, column: null, code: 'importBadFile' }] };
  const [header, ...body] = rows;
  if (!header) return { ok: false, problems: [{ row: 0, column: null, code: 'importEmpty' }] };
  const names = header.map((name) => name.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = ['source', 'correct'].filter((name) => !names.includes(name));
  const unknown = names.filter(
    (name) => name !== '' && !(IMPORT_COLUMNS as readonly string[]).includes(name),
  );
  if (missing.length || unknown.length) {
    return {
      ok: false,
      problems: [
        ...missing.map((column) => ({ row: 1, column, code: 'importMissingColumn' })),
        ...unknown.map((column) => ({ row: 1, column, code: 'importUnknownColumn' })),
      ],
    };
  }
  if (body.length === 0)
    return { ok: false, problems: [{ row: 0, column: null, code: 'importEmpty' }] };
  if (body.length > MAX_IMPORT_ROWS) {
    return { ok: false, problems: [{ row: 0, column: null, code: 'importTooManyRows' }] };
  }

  const problems: ImportProblem[] = [];
  const questions: ImportedQuestion[] = [];
  body.forEach((cells, index) => {
    const row = index + 2;
    const value = (column: string) => {
      const at = names.indexOf(column);
      return at === -1 ? '' : (cells[at] ?? '').trim();
    };
    const problem = (column: string | null, code: string) => problems.push({ row, column, code });
    const before = problems.length;

    for (const column of IMPORT_COLUMNS) {
      if (value(column).length > limitOf(column)) problem(column, 'importTooLong');
    }

    const topic = value('topic') || null;
    if (topic && !topics.has(topic)) problem('topic', 'importUnknownTopic');
    const level = value('level').toUpperCase() || null;
    if (level && !(LEVELS as readonly string[]).includes(level))
      problem('level', 'importUnknownLevel');
    const difficulty = value('difficulty').toUpperCase() || null;
    if (difficulty && !(DIFFICULTIES as readonly string[]).includes(difficulty)) {
      problem('difficulty', 'importUnknownDifficulty');
    }

    const translations: ImportedQuestion['translations'] = {};
    for (const locale of ['he', 'en'] as const) {
      const stem = value(`stem_${locale}`);
      const summary = value(`summary_${locale}`);
      if (stem) translations[locale] = { stem, summary };
      else if (summary) problem(`stem_${locale}`, 'importStemRequired');
    }
    if (!translations.he && !translations.en) problem('stem_he', 'importStemRequired');

    // Options are 1, 2, 3 … with no gap: an option is there when it has text in a language.
    const options: ImportedQuestion['options'] = [];
    let ended = false;
    for (let n = 1; n <= MAX_OPTIONS; n += 1) {
      const he = value(`option_${n}_he`);
      const en = value(`option_${n}_en`);
      const whyHe = value(`explanation_${n}_he`);
      const whyEn = value(`explanation_${n}_en`);
      if (!he && !en) {
        if (whyHe || whyEn) problem(`option_${n}_he`, 'importOptionTextRequired');
        ended = true;
        continue;
      }
      if (ended) problem(`option_${n}_he`, 'importOptionGap');
      if ((whyHe && !he) || (whyEn && !en)) {
        problem(`option_${n}_${whyHe && !he ? 'he' : 'en'}`, 'importOptionTextRequired');
      }
      options.push({
        correct: false,
        translations: {
          ...(he ? { he: { text: he, explanation: whyHe } } : {}),
          ...(en ? { en: { text: en, explanation: whyEn } } : {}),
        },
      });
    }
    if (options.length < MIN_OPTIONS) problem('option_1_he', 'importOptionCount');

    const correct = value('correct');
    const right = /^[1-9]$/.test(correct) ? Number(correct) : NaN;
    if (!correct) problem('correct', 'importCorrectRequired');
    else if (!(right >= 1 && right <= options.length)) problem('correct', 'importCorrectUnknown');
    else options[right - 1]!.correct = true;

    const references: ImportedQuestion['references'] = [];
    for (let n = 1; n <= MAX_REFERENCES; n += 1) {
      const title = value(`reference_${n}_title`);
      const url = value(`reference_${n}_url`);
      if (url && !isHttpUrl(url)) problem(`reference_${n}_url`, 'importBadUrl');
      if (url && !title) problem(`reference_${n}_title`, 'importReferenceTitleRequired');
      if (title) references.push(url ? { title, url } : { title });
    }

    const source = value('source');
    if (!source) problem('source', 'importSourceRequired');

    if (problems.length === before) {
      questions.push({
        topic,
        level: level as ImportedQuestion['level'],
        difficulty: difficulty as ImportedQuestion['difficulty'],
        translations,
        options,
        references,
        source,
      });
    }
  });
  return problems.length ? { ok: false, problems } : { ok: true, questions };
}
