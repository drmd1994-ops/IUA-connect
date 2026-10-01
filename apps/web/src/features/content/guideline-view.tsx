'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useDateFormat } from '@/features/membership/membership-page';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { StatusBadge } from './guidelines-list';

type Guideline = components['schemas']['PublicGuidelineDto'];

const link = 'font-semibold text-primary underline underline-offset-4';

export function GuidelineView({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const name = useLocalName();
  const { date } = useDateFormat();
  const { api, call, status } = useAuth();
  const [guideline, setGuideline] = useState<Guideline | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    call(() => api.GET('/api/v1/guidelines/{id}', { params: { path: { id }, query: { locale } } }))
      .then((result) => {
        if (!active) return;
        setGuideline(result);
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, id, locale]);

  if (error !== null) {
    // A malformed ID answers 400; for the reader it is the same as a missing guideline.
    const missing = isApiError(error, 'NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
    return (
      <PageFrame>
        {missing ? (
          <>
            <h1 className="text-3xl font-semibold text-brand-900">
              {t('content.common.notFoundTitle')}
            </h1>
            <p className="text-text-muted">{t('content.common.notFoundBody')}</p>
          </>
        ) : (
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        )}
        <Link href="/guidelines" className={link}>
          {t('content.guidelines.back')}
        </Link>
      </PageFrame>
    );
  }
  if (!guideline) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }

  const dir = guideline.locale === 'he' ? 'rtl' : 'ltr';
  return (
    <PageFrame>
      <Link href="/guidelines" className={link}>
        {t('content.guidelines.back')}
      </Link>
      {guideline.fallback && <Alert>{t('content.common.fallbackNotice')}</Alert>}
      <div data-testid="guideline">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1
            className="text-3xl font-semibold leading-tight text-brand-900"
            lang={guideline.locale}
            dir={dir}
          >
            {guideline.title}
          </h1>
          <StatusBadge status={guideline.status} />
        </div>
        <dl className="mt-6 grid gap-4 rounded-md border border-border p-5 sm:grid-cols-2">
          <Item label={t('content.guidelines.source')}>{guideline.sourceOrg}</Item>
          {guideline.version && (
            <Item label={t('content.guidelines.version')}>{guideline.version}</Item>
          )}
          {guideline.publishedOn && (
            <Item label={t('content.guidelines.publishedOn')}>{date(guideline.publishedOn)}</Item>
          )}
          {guideline.evidenceLevel && (
            <Item label={t('content.guidelines.evidenceLevel')}>{guideline.evidenceLevel}</Item>
          )}
          {guideline.subspecialty && (
            <Item label={t('content.guidelines.subspecialty')}>{name(guideline.subspecialty)}</Item>
          )}
        </dl>
        <p className="mt-6">
          <a
            href={guideline.officialUrl}
            rel="noopener noreferrer"
            className="inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
          >
            {t('content.guidelines.officialLink')}
          </a>
        </p>
      </div>

      {guideline.summary && (
        <section aria-labelledby="summary-title">
          <h2 id="summary-title" className="text-xl font-semibold">
            {t('content.guidelines.summaryTitle')}
          </h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed" lang={guideline.locale} dir={dir}>
            {guideline.summary}
          </p>
        </section>
      )}

      <section aria-labelledby="versions-title">
        <h2 id="versions-title" className="text-xl font-semibold">
          {t('content.guidelines.versions')}
        </h2>
        <ul className="mt-3 flex flex-col gap-3">
          {guideline.versions.map((version) => (
            <li key={version.id} className="rounded-md border border-border p-4">
              <p className="font-semibold">
                {t('content.guidelines.version')} {version.version}
                <span className="font-normal text-text-muted">
                  {' · '}
                  {date(version.publishedOn)}
                </span>
              </p>
              {version.licenseNote && (
                <p className="mt-1 text-sm text-text-muted">
                  {t('content.guidelines.licenseNote')}: {version.licenseNote}
                </p>
              )}
              {version.url && (
                <p className="mt-1">
                  <a href={version.url} rel="noopener noreferrer" className={link}>
                    {t('content.guidelines.versionLink')}
                    <span className="sr-only"> {version.version}</span>
                  </a>
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </PageFrame>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
