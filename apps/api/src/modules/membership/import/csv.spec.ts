import { CsvError, parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads plain rows with LF or CRLF line endings', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['1', '2'] },
    ]);
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['1', '2'] },
    ]);
  });

  it('strips a byte-order mark and skips blank lines', () => {
    expect(parseCsv('﻿email\n\nx@example.test\n\n')).toEqual([
      { line: 1, fields: ['email'] },
      { line: 3, fields: ['x@example.test'] },
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c,')).toEqual([{ line: 1, fields: ['a', '', 'c', ''] }]);
  });

  it('reads quoted fields with commas, quotes and line breaks', () => {
    const rows = parseCsv('name,note\n"Levi, Dana","said ""hi""\nthen left"\nnext,row');
    expect(rows).toEqual([
      { line: 1, fields: ['name', 'note'] },
      { line: 2, fields: ['Levi, Dana', 'said "hi"\nthen left'] },
      { line: 4, fields: ['next', 'row'] },
    ]);
  });

  it('reads Hebrew text as is', () => {
    expect(parseCsv('first_name\nנועה')).toEqual([
      { line: 1, fields: ['first_name'] },
      { line: 2, fields: ['נועה'] },
    ]);
  });

  it('reports malformed quoting with the line', () => {
    expect(() => parseCsv('a\n"open')).toThrow(new CsvError('unterminatedQuote', 2));
    expect(() => parseCsv('a\nab"c"')).toThrow(new CsvError('quoteInField', 2));
  });
});
