import { redirect } from '@/i18n/navigation';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminHome({ params }: Props) {
  redirect({ href: '/admin/applications', locale: (await params).locale });
}
