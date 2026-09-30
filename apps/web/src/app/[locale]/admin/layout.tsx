import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/admin-shell';

/** The admin area (ADR 0006): its own frame and navigation. The API enforces every rule. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
