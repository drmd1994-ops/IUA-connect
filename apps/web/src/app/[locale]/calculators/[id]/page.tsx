import { calculatorById } from '@medconnect/calculators';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalculatorForm } from '@/features/calculators/calculator-form';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'calculators' });
  const calculator = calculatorById(id);
  return calculator
    ? {
        title: t(`items.${calculator.id}.name`),
        description: t(`items.${calculator.id}.summary`),
      }
    : { title: t('list.title') };
}

/** One calculator (M30 plan §4); its form runs in the browser and sends nothing. */
export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const calculator = calculatorById(id);
  if (!calculator) notFound();
  const t = await getTranslations({ locale, namespace: 'calculators' });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">
          {t(`items.${calculator.id}.name`)}
        </h1>
        <p className="mt-3 text-lg">{t(`items.${calculator.id}.summary`)}</p>
      </div>
      <CalculatorForm id={calculator.id} />
    </div>
  );
}
