import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PositionView } from '@/features/careers/position-view';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'careers.positions' });
  return { title: t('title') };
}

/** Loaded in the browser, so a signed-in reader also sees whether they saved it. */
export default async function Page({ params }: Props) {
  const resolved = await params;
  setRequestLocale(resolved.locale);
  return <PositionView id={resolved.id} />;
}
