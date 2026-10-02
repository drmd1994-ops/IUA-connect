import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchPage } from '@/features/search/search-page';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; type?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search.page' });
  return { title: t('title') };
}

export default async function Page({ params, searchParams }: Props) {
  setRequestLocale((await params).locale);
  const { q, type } = await searchParams;
  const query = typeof q === 'string' ? q.slice(0, 100) : '';
  const only = typeof type === 'string' ? type : null;
  // A new search starts from a fresh page (its field, its page number).
  return <SearchPage key={`${query}|${only ?? ''}`} q={query} type={only} />;
}
