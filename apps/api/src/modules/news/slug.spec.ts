import { SLUG_PATTERN, slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('makes URL names from Hebrew and English titles', () => {
    expect(slugify('הכנס השנתי, 2026!')).toBe('הכנס-השנתי-2026');
    expect(slugify('Annual Meeting — Eilat 2026')).toBe('annual-meeting-eilat-2026');
    expect(slugify('Café & Résumé')).toBe('cafe-resume');
  });

  it('drops niqqud and stray characters', () => {
    expect(slugify('שָׁלוֹם')).toBe('שלום');
    expect(slugify('  --a//b--  ')).toBe('a-b');
    expect(slugify('!!!')).toBe('news');
  });

  it('always matches the database pattern, within 120 characters', () => {
    for (const title of ['x'.repeat(300), `${'word '.repeat(50)}`, 'עברית ו-English', '???']) {
      const slug = slugify(title);
      expect(slug).toMatch(SLUG_PATTERN);
      expect(slug.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('uniqueSlug', () => {
  it('adds a number when the name is taken', async () => {
    const taken = new Set(['meeting', 'meeting-2']);
    expect(await uniqueSlug('meeting', async (s) => taken.has(s))).toBe('meeting-3');
    expect(await uniqueSlug('other', async (s) => taken.has(s))).toBe('other');
  });
});
