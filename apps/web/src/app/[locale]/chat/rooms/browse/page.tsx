import { redirect } from '@/i18n/navigation';

type Props = { params: Promise<{ locale: string }> };

/** Chat rooms closed in M25: communities replace them. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  redirect({ href: '/communities', locale });
}
