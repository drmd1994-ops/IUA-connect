import { IMPORT_COLUMNS, importTemplate, parseCsv, readImport } from './exam-import';

const TOPICS = new Set(['stones', 'oncology']);

/** A spreadsheet with the template's columns; each row gives only the columns it sets. */
function sheet(...rows: Record<string, string>[]): string {
  const quote = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [
    IMPORT_COLUMNS.join(','),
    ...rows.map((row) => IMPORT_COLUMNS.map((column) => quote(row[column] ?? '')).join(',')),
  ].join('\r\n');
}

const GOOD = {
  topic: 'stones',
  level: 'resident',
  difficulty: 'Medium',
  stem_he: 'מה הטיפול, בהינתן "אבן" של 4 מ"מ?',
  stem_en: 'Which treatment, for a 4 mm stone?',
  summary_he: 'סיכום',
  option_1_he: 'המתנה',
  explanation_1_he: 'נכון, רוב האבנים עוברות.',
  option_2_he: 'ניתוח',
  explanation_2_he: 'לא בשלב זה.',
  correct: '1',
  reference_1_title: 'EAU Guidelines on Urolithiasis, 2025',
  reference_1_url: 'https://uroweb.org/guidelines/urolithiasis',
  source: 'Written new by the author',
};

describe('importing exam questions', () => {
  it('reads quotes, commas and line breaks inside a field, and a byte-order mark', () => {
    expect(parseCsv('﻿a,"b, ""c""\nd",e\r\n1,2,3\n,,\n')).toEqual([
      ['a', 'b, "c"\nd', 'e'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a,"never closed')).toBeNull();
  });

  it('gives a template with the header only, that Excel opens as UTF-8', () => {
    const template = importTemplate();
    expect(template.startsWith('﻿')).toBe(true);
    expect(parseCsv(template)).toEqual([[...IMPORT_COLUMNS]]);
  });

  it('turns a good row into a question with its right option and references', () => {
    const result = readImport(sheet(GOOD), TOPICS);
    expect(result).toEqual({
      ok: true,
      questions: [
        {
          topic: 'stones',
          level: 'RESIDENT',
          difficulty: 'MEDIUM',
          translations: {
            he: { stem: GOOD.stem_he, summary: 'סיכום' },
            en: { stem: GOOD.stem_en, summary: '' },
          },
          options: [
            {
              correct: true,
              translations: { he: { text: 'המתנה', explanation: GOOD.explanation_1_he } },
            },
            { correct: false, translations: { he: { text: 'ניתוח', explanation: 'לא בשלב זה.' } } },
          ],
          references: [{ title: GOOD.reference_1_title, url: GOOD.reference_1_url }],
          source: GOOD.source,
        },
      ],
    });
  });

  it('refuses the whole file, naming each bad row, column and reason', () => {
    const result = readImport(
      sheet(
        GOOD,
        { ...GOOD, topic: 'nephrology', source: '' },
        { ...GOOD, correct: '3', reference_1_url: 'javascript:alert(1)' },
        { ...GOOD, option_2_he: '', explanation_2_he: '', option_3_he: 'שלישית' },
      ),
      TOPICS,
    );
    expect(result).toEqual({
      ok: false,
      problems: [
        { row: 3, column: 'topic', code: 'importUnknownTopic' },
        { row: 3, column: 'source', code: 'importSourceRequired' },
        { row: 4, column: 'correct', code: 'importCorrectUnknown' },
        { row: 4, column: 'reference_1_url', code: 'importBadUrl' },
        { row: 5, column: 'option_3_he', code: 'importOptionGap' },
      ],
    });
  });

  it('needs a stem, two options and the right one', () => {
    const result = readImport(sheet({ source: 'x', option_1_he: 'only one' }), TOPICS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.code)).toEqual([
      'importStemRequired',
      'importOptionCount',
      'importCorrectRequired',
    ]);
  });

  it('refuses unknown and missing columns, and an empty file', () => {
    expect(readImport('stem_he,answer\nx,y', TOPICS)).toEqual({
      ok: false,
      problems: [
        { row: 1, column: 'source', code: 'importMissingColumn' },
        { row: 1, column: 'correct', code: 'importMissingColumn' },
        { row: 1, column: 'answer', code: 'importUnknownColumn' },
      ],
    });
    expect(readImport(IMPORT_COLUMNS.join(','), TOPICS)).toEqual({
      ok: false,
      problems: [{ row: 0, column: null, code: 'importEmpty' }],
    });
  });
});
