'use client';

import { useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { useRouter } from '@/i18n/navigation';
import { ADMIN_SECTIONS } from './admin-shell';

/** Opens the first admin section the signed-in person may use (editors go straight to News). */
export function AdminHome() {
  const { me } = useAuth();
  const router = useRouter();
  const first = ADMIN_SECTIONS.find((section) => me?.permissions.includes(section.permission));

  useEffect(() => {
    if (first) router.replace(first.href);
  }, [first, router]);

  return null;
}
