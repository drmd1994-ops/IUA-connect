'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { StoredImage, formatSize, useFileUrl } from './files';
import { Markdown } from './markdown';

type Article = components['schemas']['PublicNewsDto'];
type Attachment = Article['attachments'][number];

const link = 'font-semibold text-primary underline underline-offset-4';

export function NewsArticle({ slug }: { slug: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const { api, call, status } = useAuth();
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    call(() => api.GET('/api/v1/news/{slug}', { params: { path: { slug }, query: { locale } } }))
      .then((result) => {
        if (!active) return;
        setArticle(result);
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
        <Link href="/news" className={link}>
          {t('content.news.back')}
        </Link>
      </PageFrame>
    );
  }
  if (!article) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }
  return <ArticleView article={article} />;
}

function ArticleView({ article }: { article: Article }) {
  const t = useTranslations();
  const format = useFormatter();
  const name = useLocalName();
  const dir = article.locale === 'he' ? 'rtl' : 'ltr';

  return (
    <PageFrame>
      <Link href="/news" className={link}>
        {t('content.news.back')}
      </Link>
      {article.archived && <Alert tone="warning">{t('content.news.archivedNotice')}</Alert>}
      {article.fallback && <Alert>{t('content.common.fallbackNotice')}</Alert>}
      <article data-testid="news-article">
        <header>
          <p className="text-sm text-text-muted">
            <time dateTime={article.date}>
              {format.dateTime(new Date(article.date), { dateStyle: 'long' })}
            </time>
            {article.category && ` · ${name(article.category)}`}
            {article.accessTier !== 'PUBLIC' && ` · ${t('content.common.tiers.MEMBERS')}`}
          </p>
          <h1
            className="mt-2 text-3xl font-semibold leading-tight text-brand-900"
            lang={article.locale}
            dir={dir}
          >
            {article.title}
          </h1>
          {article.author && (
            <p className="mt-2 text-text-muted">
              {t('content.news.by', { author: article.author })}
            </p>
          )}
        </header>
        {article.featuredImageFileId && (
          <StoredImage
            fileId={article.featuredImageFileId}
            alt={t('content.news.imageAlt', { title: article.title })}
            className="mt-6 max-h-112 w-full rounded-lg object-cover"
          />
        )}
        {article.summary && (
          <p className="mt-6 text-lg text-text-muted" lang={article.locale} dir={dir}>
            {article.summary}
          </p>
        )}
        <div lang={article.locale} dir={dir} className="mt-2">
          <Markdown>{article.body}</Markdown>
        </div>
      </article>

      {article.attachments.length > 0 && (
        <section aria-labelledby="attachments-title">
          <h2 id="attachments-title" className="text-xl font-semibold">
            {t('content.news.attachments')}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {article.attachments.map((file) => (
              <li key={file.id}>
                <AttachmentLink file={file} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {article.references.length > 0 && (
        <section aria-labelledby="references-title">
          <h2 id="references-title" className="text-xl font-semibold">
            {t('content.news.references')}
          </h2>
          <ol className="mt-3 list-decimal ps-6">
            {article.references.map((reference) => (
              <li key={reference.url} className="mt-1">
                <a href={reference.url} className={link} rel="noopener noreferrer">
                  {reference.title}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {article.sourceUrl && (
        <p className="text-sm text-text-muted">
          {t('content.news.source')}{' '}
          <a href={article.sourceUrl} className={link} rel="noopener noreferrer" dir="ltr">
            {new URL(article.sourceUrl).hostname}
          </a>
        </p>
      )}
    </PageFrame>
  );
}

function AttachmentLink({ file }: { file: Attachment }) {
  const t = useTranslations('content.common');
  const locale = useLocale();
  const url = useFileUrl(file.id);
  const size = formatSize(file.sizeBytes, locale);
  if (!url) {
    return (
      <span className="text-text-muted">
        {file.originalName} ({size})
      </span>
    );
  }
  return (
    <a href={url} className={link} download={file.originalName}>
      <span className="sr-only">{t('download')}: </span>
      {file.originalName} ({size})
    </a>
  );
}
