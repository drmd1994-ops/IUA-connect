import { setRequestLocale } from 'next-intl/server';
import { AdminHome } from '@/features/admin/admin-home';

type Props = { params: Promise<{ locale: string }> };

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  return <AdminHome />;
}
