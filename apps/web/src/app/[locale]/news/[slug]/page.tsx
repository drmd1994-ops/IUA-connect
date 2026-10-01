import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewsArticle } from '@/features/content/news-article';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'content.news' });
  return { title: t('title') };
}

/** The article is loaded in the browser, so members-only items can use the reader's session. */
export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <NewsArticle slug={decodeURIComponent(slug)} />;
}
