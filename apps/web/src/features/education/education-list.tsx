'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { StoredImage } from '@/features/content/files';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type List = components['schemas']['PublicEducationListDto'];
export type EducationType = List['items'][number]['type'];
export type EducationLevel = NonNullable<List['items'][number]['level']>;

export const EDUCATION_TYPES: EducationType[] = [
  'VIDEO',
  'ARTICLE',
  'PDF',
  'PRESENTATION',
  'PODCAST',
  'WEBINAR',
  'SURGICAL_VIDEO',
  'CASE',
  'COURSE',
];
export const EDUCATION_LEVELS: EducationLevel[] = [
  'STUDENT',
  'RESIDENT',
  'FELLOW',
  'SPECIALIST',
  'EXPERT',
];
const PAGE_SIZE = 12;
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** The education library. Signed-in members also see what their membership opens. */
export function EducationList() {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const name = useLocalName();
  const { api, call, status } = useAuth();
  const reference = useReference();
  const [type, setType] = useState<EducationType | ''>('');
  const [level, setLevel] = useState<EducationLevel | ''>('');
  const [subspecialty, setSubspecialty] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    // Wait for the session to be restored, so members get their items on the first request.
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/education', {
        params: {
          query: {
            locale,
            page,
            pageSize: PAGE_SIZE,
            ...(type ? { type } : {}),
            ...(level ? { level } : {}),
            ...(subspecialty ? { subspecialty } : {}),
          },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, locale, page, type, level, subspecialty]);

  /** A filter changed: show the first page of the new result. */
  const first = (change: () => void) => {
    change();
    setPage(1);
  };

  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('education.list.title')}</h1>
        <p className="mt-2 text-text-muted">{t('education.list.intro')}</p>
      </div>

      <section
        aria-labelledby="exam-card-title"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="exam-card-title" className="text-lg font-semibold">
          {t('education.list.examTitle')}
        </h2>
        <p className="mt-1 text-text-muted">{t('education.list.examBody')}</p>
        <p className="mt-3">
          <Link
            href="/education/exam"
            className="inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
          >
            {t('education.list.examLink')}
          </Link>
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t('education.list.type')}
          placeholder={t('education.list.allTypes')}
          value={type}
          onChange={(event) => first(() => setType(event.target.value as EducationType | ''))}
          options={EDUCATION_TYPES.map((value) => ({
            value,
            label: t(`education.types.${value}`),
          }))}
        />
        <SelectField
          label={t('education.list.level')}
          placeholder={t('education.list.allLevels')}
          value={level}
          onChange={(event) => first(() => setLevel(event.target.value as EducationLevel | ''))}
          options={EDUCATION_LEVELS.map((value) => ({
            value,
            label: t(`education.levels.${value}`),
          }))}
        />
        <SelectField
          label={t('education.list.subspecialty')}
          placeholder={t('education.list.allSubspecialties')}
          value={subspecialty}
          onChange={(event) => first(() => setSubspecialty(event.target.value))}
          options={(reference?.subspecialties ?? []).map((s) => ({
            value: s.key,
            label: name(s),
          }))}
        />
      </div>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && (
        <p className="text-text-muted">{t('education.list.empty')}</p>
      )}
      {list && list.items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="education-list">
          {list.items.map((item) => (
            <li key={item.slug}>
              <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
                {item.coverFileId && (
                  <StoredImage
                    fileId={item.coverFileId}
                    variant="thumb"
                    alt=""
                    className="aspect-video w-full object-cover"
                    placeholder
                  />
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="flex flex-wrap gap-2">
                    <span className={`${badge} bg-brand-50 text-brand-900`}>
                      {t(`education.types.${item.type}`)}
                    </span>
                    <span className={`${badge} bg-surface-muted text-text-muted`}>
                      {t(`education.levels.${item.level ?? 'all'}`)}
                    </span>
                    {item.accessTier !== 'PUBLIC' && (
                      <span className={`${badge} bg-surface-muted text-text-muted`}>
                        {t(
                          `content.common.tiers.${item.accessTier === 'VERIFIED' ? 'VERIFIED' : 'MEMBERS'}`,
                        )}
                      </span>
                    )}
                  </p>
                  <h2 className="text-lg font-semibold" lang={item.locale}>
                    <Link
                      href={`/education/${encodeURIComponent(item.slug)}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {item.title}
                    </Link>
                  </h2>
                  <p className="mt-auto text-sm text-text-muted">
                    {[
                      item.author,
                      item.subspecialty && name(item.subspecialty),
                      item.durationMinutes &&
                        t('education.list.minutes', { count: item.durationMinutes }),
                      item.cmePoints && t('education.list.cme', { points: item.cmePoints }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </PageFrame>
  );
}
