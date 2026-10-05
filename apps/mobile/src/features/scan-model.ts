/**
 * What a scanned code means. Two codes of IUA Connect are read: the one shown at an event's
 * venue, which records attendance, and the one on a membership card, which is checked. Both are
 * addresses of the site; only the event and the code are taken from them, and they are sent to
 * the app's own server. A code that leads anywhere else is not followed.
 */

export type Scanned =
  { kind: 'checkIn'; slug: string; token: string } | { kind: 'card'; token: string };

export function parseScan(text: string): Scanned | null {
  const match = /^https?:\/\/[^/?#]+(\/[^?#]*)?(?:\?([^#]*))?/i.exec(text.trim());
  if (!match) return null;
  const path = (match[1] ?? '').replace(/^\/(he|en)(?=\/)/, '');
  const token = new URLSearchParams(match[2] ?? '').get('t');
  if (!token) return null;
  const checkIn = /^\/events\/([^/]+)\/check-in\/?$/.exec(path);
  if (checkIn) {
    try {
      return { kind: 'checkIn', slug: decodeURIComponent(checkIn[1] ?? ''), token };
    } catch {
      return null;
    }
  }
  if (/^\/card\/verify\/?$/.test(path)) return { kind: 'card', token };
  return null;
}

/** A name for a saved file: letters, digits and dashes of the given name, and its extension. */
export function safeFileName(name: string, extension: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'file'}.${extension}`;
}
