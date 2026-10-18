import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalculatorList } from '@/features/calculators/calculator-list';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'calculators.list' });
  return { title: t('title'), description: t('intro') };
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  return <CalculatorList />;
}
