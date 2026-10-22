import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExamImportPage } from '@/features/admin/exam-bank-admin';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'education.admin.import' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const resolved = await params;
  setRequestLocale(resolved.locale);
  return <ExamImportPage />;
}
