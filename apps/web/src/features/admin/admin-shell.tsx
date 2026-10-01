'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import type { Me } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link, usePathname } from '@/i18n/navigation';

/** Permissions that open the admin area. The API grants them only in an MFA session. */
const ADMIN_PERMISSIONS = [
  'membership.read',
  'membership.approve.final',
  'institutions.manage',
  'news.create',
  'guidelines.manage',
  'events.manage',
];

export function isAdmin(me: Me | null): boolean {
  return !!me && me.permissions.some((permission) => ADMIN_PERMISSIONS.includes(permission));
}

/** Each section and the permission that opens it (content editors see only News). */
export const ADMIN_SECTIONS = [
  { href: '/admin/applications', key: 'applications', permission: 'membership.approve.final' },
  { href: '/admin/members', key: 'members', permission: 'membership.read' },
  { href: '/admin/institutions', key: 'institutions', permission: 'institutions.manage' },
  { href: '/admin/import', key: 'import', permission: 'membership.manage' },
  { href: '/admin/news', key: 'news', permission: 'news.create' },
  { href: '/admin/guidelines', key: 'guidelines', permission: 'guidelines.manage' },
  { href: '/admin/events', key: 'events', permission: 'events.manage' },
] as const;

/**
 * The admin area's frame (ADR 0006). The check here only decides what to show; the API enforces
 * the same rules on every request.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const pathname = usePathname();
  return (
    <RequireSignIn>
      {(me) =>
        isAdmin(me) ? (
          <PageFrame wide>
            <nav aria-label={t('navLabel')} className="border-b border-border">
              <ul className="flex flex-wrap gap-1">
                {ADMIN_SECTIONS.filter((section) =>
                  me.permissions.includes(section.permission),
                ).map((section) => {
                  const current = pathname.startsWith(section.href);
                  return (
                    <li key={section.key}>
                      <Link
                        href={section.href}
                        aria-current={current ? 'page' : undefined}
                        className={`inline-block rounded-t-md px-4 py-2 text-sm font-semibold ${
                          current
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {t(`nav.${section.key}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {children}
          </PageFrame>
        ) : (
          <PageFrame>
            <Alert tone="warning">{t('notAllowed')}</Alert>
            {me.mfaEnrollmentRequired && (
              <Link
                href="/account/security"
                className="font-semibold text-primary underline underline-offset-4"
              >
                {t('setUpMfa')}
              </Link>
            )}
          </PageFrame>
        )
      }
    </RequireSignIn>
  );
}
