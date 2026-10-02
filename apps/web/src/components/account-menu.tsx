'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { isAdmin } from '@/features/admin/admin-shell';
import { useAuth } from '@/features/auth/auth-context';
import { Link, useRouter } from '@/i18n/navigation';

/** Header links: "Sign in / Sign up" when signed out; account links and "Sign out" when signed in. */
export function AccountMenu() {
  const t = useTranslations('auth.nav');
  const tm = useTranslations('membership.nav');
  const all = useTranslations();
  const { status, me, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (status === 'loading') return <span className="inline-block w-24" aria-hidden="true" />;

  if (status === 'signedOut' || !me) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-primary hover:bg-brand-50"
        >
          {t('signIn')}
        </Link>
        <Link
          href="/register"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
        >
          {t('register')}
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`${t('accountMenu')}: ${me.email}`}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
      >
        <span dir="ltr">{me.email}</span>
      </button>
      {open && (
        <ul
          id="account-menu"
          className="absolute end-0 z-20 mt-2 w-56 rounded-md border border-border bg-surface p-1 shadow-raised"
        >
          <MenuLink href="/account/profile" onClick={() => setOpen(false)}>
            {tm('profile')}
          </MenuLink>
          <MenuLink href="/account/membership" onClick={() => setOpen(false)}>
            {tm('membership')}
          </MenuLink>
          <MenuLink href="/account/notifications" onClick={() => setOpen(false)}>
            {all('notifications.nav')}
          </MenuLink>
          <MenuLink href="/members" onClick={() => setOpen(false)}>
            {all('directory.nav')}
          </MenuLink>
          <MenuLink href="/account/schedule" onClick={() => setOpen(false)}>
            {tm('schedule')}
          </MenuLink>
          <MenuLink href="/account/exam-results" onClick={() => setOpen(false)}>
            {tm('examResults')}
          </MenuLink>
          {me.permissions.includes('membership.approve.department') && (
            <MenuLink href="/account/applications" onClick={() => setOpen(false)}>
              {tm('applications')}
            </MenuLink>
          )}
          {isAdmin(me) && (
            <MenuLink href="/admin" onClick={() => setOpen(false)}>
              {tm('admin')}
            </MenuLink>
          )}
          <MenuLink href="/account/security" onClick={() => setOpen(false)}>
            {t('security')}
          </MenuLink>
          <li>
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                await signOut();
                router.push('/');
              }}
              className="block w-full rounded px-3 py-2 text-start text-sm hover:bg-surface-muted"
            >
              {t('signOut')}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="block rounded px-3 py-2 text-sm hover:bg-surface-muted"
      >
        {children}
      </Link>
    </li>
  );
}
