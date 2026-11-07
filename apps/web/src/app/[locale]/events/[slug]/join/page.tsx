import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GuestJoin } from '@/features/events/guest-join';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'events.guest' });
  return { title: t('title') };
}

/** Opened by scanning the conference's guest QR code (M32). */
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { code } = await searchParams;
  return (
    <GuestJoin
      slug={decodeURIComponent(slug)}
      code={typeof code === 'string' && code ? code : null}
    />
  );
}
