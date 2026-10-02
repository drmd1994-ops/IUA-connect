/**
 * Prepares what a person typed for PostgreSQL full-text search (M7 plan §2.7). The stored
 * search text is already normalised by `normalize_he` (vowel marks removed, final letters
 * folded, lower case); the query gets the same treatment here, so the two meet.
 */

/** Hebrew one-letter prefixes that attach to the next word: the, and, in, to, from, that, as. */
const PREFIXES = ['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ'];
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const HEBREW = /^[א-ת]+$/;
/** A stripped word keeps at least this many letters, so "של" is not read as "ש" + "ל". */
const MIN_STEM = 3;
export const MAX_TERMS = 8;

/** The same normalisation as the database's normalize_he(). */
export function normalizeHebrew(text: string): string {
  return text
    .toLowerCase()
    .replace(/־/g, ' ')
    .replace(/[֑-ׇֽֿׁׂׅׄ]/g, '')
    .replace(/[ךםןףץ]/g, (letter) => FINALS[letter]!);
}

/** The words of a query: letters and digits only, at least two characters, at most eight. */
export function termsOf(query: string): string[] {
  const words = normalizeHebrew(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
  return [...new Set(words)].slice(0, MAX_TERMS);
}

/**
 * The forms of a word worth looking for. A Hebrew word is also tried without a one-letter
 * prefix ("בכנס" finds "כנס") and with each prefix ("כנס" finds "הכנס" and "בכנס"); the word
 * without its prefix gets the other prefixes too ("בכנס" finds "הכנס").
 */
export function variantsOf(term: string): string[] {
  if (!HEBREW.test(term)) return [term];
  const stems = [term];
  if (PREFIXES.includes(term[0]!) && term.length - 1 >= MIN_STEM) stems.push(term.slice(1));
  return [...new Set(stems.flatMap((stem) => [stem, ...PREFIXES.map((prefix) => prefix + stem)]))];
}

/** A word shorter than this is matched exactly from its start; longer ones forgive a typo. */
export const MIN_FUZZY_LENGTH = 4;

export interface PreparedTerm {
  /** The normalised word. */
  text: string;
  /** A `to_tsquery('simple', …)` expression for this word in any of its forms. */
  tsquery: string;
  /** Long enough to also be matched by similarity to a word of the title. */
  fuzzy: boolean;
}

export interface PreparedQuery {
  /** A `to_tsquery('simple', …)` expression: every word must be found, in any of its forms. */
  tsquery: string;
  /** The normalised words joined by spaces, for ranking by similarity to the title. */
  text: string;
  /** The words one by one: a text matches when it has every one of them. */
  terms: PreparedTerm[];
}

/**
 * The query as the search needs it, or null when nothing searchable was typed. Each word
 * matches from its start ("אורול" finds "אורולוגיה"). Words are letters and digits only, so
 * the expression can't carry search operators typed by the person.
 */
export function prepareQuery(query: string): PreparedQuery | null {
  const words = termsOf(query);
  if (words.length === 0) return null;
  const terms = words.map((word) => ({
    text: word,
    tsquery: `(${variantsOf(word)
      .map((variant) => `${variant}:*`)
      .join(' | ')})`,
    fuzzy: word.length >= MIN_FUZZY_LENGTH,
  }));
  return {
    tsquery: terms.map((term) => term.tsquery).join(' & '),
    text: words.join(' '),
    terms,
  };
}
