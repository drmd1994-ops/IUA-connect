import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewsList } from '@/features/content/news-list';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'content.news' });
  return { title: t('title'), description: t('intro') };
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  return <NewsList />;
}
