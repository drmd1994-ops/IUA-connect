/**
 * A small RFC 4180 CSV reader for membership imports: comma-separated, fields optionally in
 * double quotes (which may contain commas, quotes written as "", and line breaks), CRLF or LF
 * line endings, an optional UTF-8 byte-order mark. Spreadsheet exports (Excel, Google Sheets)
 * produce this format.
 */
export interface CsvRow {
  /** 1-based line number where the row starts in the file (for reports). */
  line: number;
  fields: string[];
}

export class CsvError extends Error {
  constructor(
    readonly code: 'unterminatedQuote' | 'quoteInField',
    readonly line: number,
  ) {
    super(`CSV ${code} at line ${line}`);
  }
}

export function parseCsv(text: string): CsvRow[] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: CsvRow[] = [];
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let rowStart = 1;
  let quoted = false;
  let fieldStarted = false;

  const endField = () => {
    fields.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    // Skip blank lines (a single empty field).
    if (!(fields.length === 1 && fields[0] === '')) rows.push({ line: rowStart, fields });
    fields = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (char === '\n') line++;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (fieldStarted) throw new CsvError('quoteInField', line);
      quoted = true;
      fieldStarted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\r' && input[i + 1] === '\n') {
      // handled by the \n
    } else if (char === '\n' || char === '\r') {
      endRow();
      line++;
      rowStart = line;
    } else {
      field += char;
      fieldStarted = true;
    }
  }
  if (quoted) throw new CsvError('unterminatedQuote', rowStart);
  if (field !== '' || fields.length > 0) endRow();
  return rows;
}
