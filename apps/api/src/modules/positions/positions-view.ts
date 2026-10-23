import { type Prisma } from '../../generated/prisma/client';
import { ORGANISATION_REF } from '../organisations';

/** What every view of a position reads. */
export const POSITION_INCLUDE = {
  translations: true,
  organisation: { select: ORGANISATION_REF },
  hospital: { select: { id: true, nameHe: true, nameEn: true, cityHe: true, cityEn: true } },
  department: { select: { id: true, nameHe: true, nameEn: true } },
  subspecialties: {
    include: { subspecialty: { select: { id: true, key: true, nameHe: true, nameEn: true } } },
  },
} satisfies Prisma.PositionInclude;

export type PositionRow = Prisma.PositionGetPayload<{ include: typeof POSITION_INCLUDE }>;

/** The fields every view shares. */
export function commonView(row: PositionRow) {
  return {
    id: row.id,
    kind: row.kind,
    organisation: row.organisation,
    place: {
      hospital: row.hospital,
      department: row.department,
      institutionName: row.institutionName,
      city: row.city,
      country: row.country,
    },
    audience: row.audience,
    subspecialties: row.subspecialties
      .map((s) => s.subspecialty)
      .sort((a, b) => a.key.localeCompare(b.key)),
    closesOn: isoDate(row.closesOn),
  };
}

export function titles(row: PositionRow): { titleHe: string | null; titleEn: string | null } {
  return {
    titleHe: row.translations.find((t) => t.locale === 'he')?.title ?? null,
    titleEn: row.translations.find((t) => t.locale === 'en')?.title ?? null,
  };
}

export function translationsView(row: PositionRow) {
  const out: { he?: { title: string; body: string }; en?: { title: string; body: string } } = {};
  for (const t of row.translations) {
    if (t.locale === 'he' || t.locale === 'en') out[t.locale] = { title: t.title, body: t.body };
  }
  return out;
}

/** A date column's value as "YYYY-MM-DD". */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** "YYYY-MM-DD" to a date column's value. */
export const dateOf = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
