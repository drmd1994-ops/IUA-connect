'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { StoredImage, formatSize, useFileUrl } from '@/features/content/files';
import { Markdown } from '@/features/content/markdown';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';

type Item = components['schemas']['PublicEducationDto'];

const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

export function EducationItem({ slug }: { slug: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const { api, call, status } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/education/{slug}', { params: { path: { slug }, query: { locale } } }),
    )
      .then((result) => {
        if (!active) return;
        setItem(result);
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, slug, locale]);

  if (error !== null) {
    return (
      <PageFrame>
        {isApiError(error, 'NOT_FOUND') ? (
          <>
            <h1 className="text-3xl font-semibold text-brand-900">
              {t('content.common.notFoundTitle')}
            </h1>
            <p className="text-text-muted">{t('content.common.notFoundBody')}</p>
          </>
        ) : (
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        )}
        <Link href="/education" className={link}>
          {t('education.item.back')}
        </Link>
      </PageFrame>
    );
  }
  if (!item) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }
  return <ItemView item={item} />;
}

function ItemView({ item }: { item: Item }) {
  const t = useTranslations();
  const format = useFormatter();
  const name = useLocalName();
  const dir = item.locale === 'he' ? 'rtl' : 'ltr';

  return (
    <PageFrame>
      <Link href="/education" className={link}>
        {t('education.item.back')}
      </Link>
      {item.archived && <Alert tone="warning">{t('education.item.archivedNotice')}</Alert>}
      {item.fallback && <Alert>{t('content.common.fallbackNotice')}</Alert>}

      <article data-testid="education-item">
        <p className="flex flex-wrap gap-2">
          <span className={`${badge} bg-brand-50 text-brand-900`}>
            {t(`education.types.${item.type}`)}
          </span>
          <span className={`${badge} bg-surface-muted text-text-muted`}>
            {t(`education.levels.${item.level ?? 'all'}`)}
          </span>
          {item.accessTier !== 'PUBLIC' && (
            <span className={`${badge} bg-surface-muted text-text-muted`}>
              {t(`content.common.tiers.${item.accessTier === 'VERIFIED' ? 'VERIFIED' : 'MEMBERS'}`)}
            </span>
          )}
        </p>
        <h1
          className="mt-3 text-3xl font-semibold leading-tight text-brand-900"
          lang={item.locale}
          dir={dir}
        >
          {item.title}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {[
            item.author && t('education.item.by', { author: item.author }),
            item.subspecialty && name(item.subspecialty),
            item.durationMinutes && t('education.list.minutes', { count: item.durationMinutes }),
            item.cmePoints && t('education.list.cme', { points: item.cmePoints }),
            format.dateTime(new Date(item.publishedAt), { dateStyle: 'long' }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {item.coverFileId && (
          <StoredImage
            fileId={item.coverFileId}
            alt=""
            className="mt-6 max-h-112 w-full rounded-lg object-cover"
          />
        )}

        {item.externalUrl && (
          <p className="mt-6">
            <a
              href={item.externalUrl}
              rel="noopener noreferrer"
              className="inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
            >
              {t('education.item.openAt', { host: new URL(item.externalUrl).hostname })}
            </a>
          </p>
        )}
        {item.videoStatus === 'PENDING_PROVIDER' && (
          <div className="mt-6">
            <Alert>{t('education.item.pending')}</Alert>
          </div>
        )}

        <div lang={item.locale} dir={dir} className="mt-2">
          <Markdown>{item.description}</Markdown>
        </div>
      </article>

      {item.type === 'COURSE' && (
        <section aria-labelledby="lessons-title">
          <h2 id="lessons-title" className="text-xl font-semibold">
            {t('education.item.lessons')}
          </h2>
          {item.lessons.length === 0 ? (
            <p className="mt-3 text-text-muted">{t('education.item.noLessons')}</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2" data-testid="course-lessons">
              {item.lessons.map((lesson) => (
                <li key={lesson.position} className="rounded-md border border-border p-4">
                  <span className="text-sm text-text-muted">
                    {t('education.item.lessonNumber', { number: lesson.position })}
                  </span>
                  {lesson.locked || !lesson.slug ? (
                    <p className="font-semibold text-text-muted">{t('education.item.locked')}</p>
                  ) : (
                    <p className="font-semibold">
                      <Link href={`/education/${encodeURIComponent(lesson.slug)}`} className={link}>
                        {lesson.title}
                      </Link>
                      <span className="font-normal text-text-muted">
                        {lesson.type && ` · ${t(`education.types.${lesson.type}`)}`}
                        {lesson.durationMinutes &&
                          ` · ${t('education.list.minutes', { count: lesson.durationMinutes })}`}
                      </span>
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {item.files.length > 0 && (
        <section aria-labelledby="files-title">
          <h2 id="files-title" className="text-xl font-semibold">
            {t('education.item.files')}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {item.files.map((file) => (
              <li key={file.id}>
                <FileLink file={file} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.references.length > 0 && (
        <section aria-labelledby="references-title">
          <h2 id="references-title" className="text-xl font-semibold">
            {t('education.item.references')}
          </h2>
          <ol className="mt-3 list-decimal ps-6">
            {item.references.map((reference) => (
              <li key={reference.url} className="mt-1">
                <a href={reference.url} className={link} rel="noopener noreferrer">
                  {reference.title}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </PageFrame>
  );
}

function FileLink({ file }: { file: Item['files'][number] }) {
  const t = useTranslations('content.common');
  const locale = useLocale();
  const url = useFileUrl(file.id);
  const label = `${file.originalName} (${formatSize(file.sizeBytes, locale)})`;
  if (!url) return <span className="text-text-muted">{label}</span>;
  return (
    <a href={url} className={link} download={file.originalName}>
      <span className="sr-only">{t('download')}: </span>
      {label}
    </a>
  );
}
