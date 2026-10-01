/**
 * URL names for news items (M3 plan §2.3): lower-case Latin letters, digits and Hebrew letters,
 * joined by single hyphens (the database checks the same pattern). Niqqud and punctuation are
 * dropped, so "הכנס השנתי, 2026!" becomes "הכנס-השנתי-2026".
 */
export const SLUG_PATTERN = /^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$/;
const MAX_SLUG = 120;

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud and cantillation marks
    .replace(/[̀-ͯ]/g, '') // Latin accents (é → e)
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug || 'news';
}

/** "slug", or "slug-2", "slug-3", … whichever is free. */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await isTaken(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('No free slug');
}
