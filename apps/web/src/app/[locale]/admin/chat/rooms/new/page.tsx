import { redirect } from '@/i18n/navigation';

type Props = { params: Promise<{ locale: string }> };

/** No new chat rooms: communities replaced them in M25. */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  redirect({ href: '/admin/communities', locale });
}
