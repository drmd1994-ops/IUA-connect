import { MAX_TERMS, normalizeHebrew, prepareQuery, termsOf, variantsOf } from './search-query';

describe('search query preparation', () => {
  it('removes vowel marks, folds final letters and lower-cases Latin text', () => {
    expect(normalizeHebrew('שָׁלוֹם')).toBe('שלומ');
    expect(normalizeHebrew('ארץ ישראל')).toBe('ארצ ישראל');
    expect(normalizeHebrew('מלך אף שמן')).toBe('מלכ אפ שמנ');
    expect(normalizeHebrew('Urology GUIDELINES')).toBe('urology guidelines');
    // A maqaf joins two words; they are searched separately.
    expect(normalizeHebrew('תת־התמחות')).toBe('תת התמחות');
  });

  it('splits into words of letters and digits, at least two characters each', () => {
    expect(termsOf('  כנס   שנתי 2026! ')).toEqual(['כנס', 'שנתי', '2026']);
    expect(termsOf('a b')).toEqual([]);
    expect(termsOf('x-ray')).toEqual(['ray']);
    expect(termsOf('כנס כנס')).toEqual(['כנס']);
  });

  it('keeps at most eight words', () => {
    const many = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    expect(termsOf(many)).toHaveLength(MAX_TERMS);
  });

  it('tries a Hebrew word with and without a one-letter prefix', () => {
    // "in the meeting" also looks for "the meeting"…
    expect(variantsOf('בכנס')).toContain('כנס');
    // …and "meeting" also looks for "the meeting", "in a meeting" and so on.
    expect(variantsOf('כנס')).toEqual(
      expect.arrayContaining(['כנס', 'הכנס', 'וכנס', 'בכנס', 'לכנס', 'מכנס', 'שכנס', 'ככנס']),
    );
    // A short word keeps its first letter: "של" is a word, not a prefix and a letter.
    expect(variantsOf('של')).not.toContain('ל');
    expect(variantsOf('הכל')).not.toContain('כל');
  });

  it('leaves other scripts as they are', () => {
    expect(variantsOf('urology')).toEqual(['urology']);
    expect(variantsOf('2026')).toEqual(['2026']);
  });

  it('builds a query where every word must be found, each from its start', () => {
    const query = prepareQuery('Stone guidelines')!;
    expect(query.tsquery).toBe('(stone:*) & (guidelines:*)');
    expect(query.text).toBe('stone guidelines');
    const hebrew = prepareQuery('אורול')!;
    expect(hebrew.tsquery.startsWith('(אורול:* | האורול:*')).toBe(true);
  });

  it('never passes search operators or quotes through', () => {
    const query = prepareQuery(`stone & !kidney | (a:b) 'x' \\ <-> :*`)!;
    expect(query.tsquery).toBe('(stone:*) & (kidney:*)');
  });

  it('gives nothing when there is nothing to search for', () => {
    expect(prepareQuery('  ')).toBeNull();
    expect(prepareQuery('& | !')).toBeNull();
    expect(prepareQuery('a')).toBeNull();
  });
});
