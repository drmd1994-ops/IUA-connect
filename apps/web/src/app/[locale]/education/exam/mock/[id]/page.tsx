import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MockExamSitting } from '@/features/education/mock-exam';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'education.mock' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const resolved = await params;
  setRequestLocale(resolved.locale);
  return <MockExamSitting id={resolved.id} />;
}
