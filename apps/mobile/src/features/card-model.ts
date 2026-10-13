/**
 * The membership card as the phone keeps it between visits (plan §3.5): who, which kind of
 * membership, until when, and when this was fetched. Never the code: it changes every few
 * minutes, so a kept one would be refused when scanned.
 */
export interface KeptCard {
  person: string;
  /** The organisation the membership is in. Absent on a card kept before M16. */
  organisationHe?: string;
  organisationEn?: string;
  typeHe: string;
  typeEn: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  endDate: string;
  fetchedAt: string;
}

export const CARD_KEY = 'iua.card';
/** The server's codes live five minutes; a new one is fetched well before that. */
export const CODE_REFRESH_MS = 4 * 60 * 1000;

/** Reads a kept card; anything that isn't one (an older shape, damage) counts as nothing kept. */
export function parseKeptCard(stored: string | null): KeptCard | null {
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<KeptCard>;
    const texts = [value.person, value.typeHe, value.typeEn, value.endDate, value.fetchedAt];
    if (texts.some((text) => typeof text !== 'string')) return null;
    if (value.status !== 'ACTIVE' && value.status !== 'SUSPENDED' && value.status !== 'EXPIRED') {
      return null;
    }
    if (Number.isNaN(new Date(value.fetchedAt!).getTime())) return null;
    return value as KeptCard;
  } catch {
    return null;
  }
}

/** The address a scanner opens to check the card: the site's own verification page. */
export function verifyUrl(webUrl: string, locale: string, token: string): string {
  return `${webUrl}/${locale}/card/verify?t=${encodeURIComponent(token)}`;
}
