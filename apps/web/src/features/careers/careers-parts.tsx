'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { useLocalName } from '@/features/membership/reference';
import { Link, usePathname } from '@/i18n/navigation';

type Schemas = components['schemas'];
export type PositionSummary = Schemas['PositionListDto']['items'][number];
export type Place = PositionSummary['place'];

/** Languages a mentor can offer (ISO 639-1); the browser names them in the page's language. */
export const MENTOR_LANGUAGES = [
  'he',
  'en',
  'ar',
  'ru',
  'am',
  'fr',
  'es',
  'de',
  'ro',
  'it',
  'pt',
  'uk',
];

/** Countries offered for a position abroad (ISO 3166-1); named by the browser. */
export const COUNTRIES = [
  'IL',
  'US',
  'CA',
  'GB',
  'IE',
  'FR',
  'DE',
  'NL',
  'BE',
  'CH',
  'AT',
  'IT',
  'ES',
  'PT',
  'SE',
  'NO',
  'DK',
  'FI',
  'PL',
  'CZ',
  'GR',
  'AU',
  'NZ',
  'SG',
  'JP',
  'KR',
];

/** Names of countries and languages in the page's language. */
export function useDisplayNames() {
  const locale = useLocale();
  return useMemo(
    () => ({
      country: new Intl.DisplayNames([locale], { type: 'region' }),
      language: new Intl.DisplayNames([locale], { type: 'language' }),
    }),
    [locale],
  );
}

/** "Department, Hospital, City" or "Institution, City, Country". */
export function usePlaceLine() {
  const name = useLocalName();
  const locale = useLocale();
  const names = useDisplayNames();
  return (place: Place) => {
    if (place.hospital) {
      const city = locale === 'he' ? place.hospital.cityHe : place.hospital.cityEn;
      return [place.department ? name(place.department) : null, name(place.hospital), city]
        .filter(Boolean)
        .join(', ');
    }
    return [place.institutionName, place.city, names.country.of(place.country)]
      .filter(Boolean)
      .join(', ');
  };
}

/** The tabs of the careers section. Saved positions and mentorship need an account. */
export function CareersNav() {
  const t = useTranslations('careers.tabs');
  const pathname = usePathname();
  const { status, me } = useAuth();
  const tabs: { href: string; key: string }[] = [
    { href: '/positions', key: 'positions' },
    ...(status === 'signedIn'
      ? [
          { href: '/positions/saved', key: 'saved' },
          { href: '/mentorship', key: 'mentors' },
          { href: '/mentorship/requests', key: 'requests' },
          ...(me?.verifiedAs === 'SPECIALIST'
            ? [{ href: '/mentorship/settings', key: 'settings' }]
            : []),
        ]
      : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={t('label')} className="border-b border-border">
      <ul className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`inline-block rounded-t-md px-4 py-2 text-sm font-semibold ${
                  current
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A position in a list: title, kind, place, who it is for and the closing date. */
export function PositionCard({
  item,
  onToggleSave,
  pending = false,
}: {
  item: PositionSummary;
  onToggleSave?: (item: PositionSummary) => void;
  pending?: boolean;
}) {
  const t = useTranslations('careers');
  const locale = useLocale();
  const format = useFormatter();
  const name = useLocalName();
  const place = usePlaceLine();
  const title = (locale === 'he' ? item.titleHe : item.titleEn) ?? item.titleHe ?? item.titleEn;
  const titleLang = (locale === 'he' ? item.titleHe : item.titleEn)
    ? locale
    : locale === 'he'
      ? 'en'
      : 'he';
  return (
    <article className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-primary">{t(`kinds.${item.kind}`)}</p>
      <h2 className="text-lg font-semibold" lang={titleLang}>
        <Link href={`/positions/${item.id}`} className="text-primary underline underline-offset-4">
          {title}
        </Link>
      </h2>
      <p className="text-text">{place(item.place)}</p>
      <p className="text-sm text-text-muted">
        {t('positions.for', { audience: t(`audiences.${item.audience}`) })}
        {item.subspecialties.length > 0 &&
          ` · ${item.subspecialties.map((s) => name(s)).join(', ')}`}
      </p>
      <p className="text-sm text-text-muted">
        {t('positions.applyBy', {
          date: format.dateTime(new Date(`${item.closesOn}T12:00:00Z`), { dateStyle: 'long' }),
        })}
      </p>
      {item.organisation && (
        <p className="text-sm text-text-muted">
          {t('positions.from', { name: name(item.organisation) })}
        </p>
      )}
      {onToggleSave && (
        <p className="mt-auto pt-2">
          <button
            type="button"
            disabled={pending}
            aria-pressed={item.saved}
            aria-label={t(item.saved ? 'positions.unsaveLabel' : 'positions.saveLabel', {
              title: title ?? '',
            })}
            onClick={() => onToggleSave(item)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60"
          >
            {item.saved ? t('positions.unsave') : t('positions.save')}
          </button>
        </p>
      )}
    </article>
  );
}
