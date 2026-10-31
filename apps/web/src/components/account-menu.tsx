'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // While open: a press or a focus anywhere outside closes it. (Not on blur: some browsers
  // don't focus a link when it is clicked, and the menu would close before the click arrives.)
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

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

  // A conference guest (M32) has no account to look after: their number, and a way out.
  if (me.guest) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span>{all('events.live.guestName', { number: me.guest.number })}</span>
        <button
          type="button"
          className="rounded-md px-3 py-1.5 font-semibold text-primary hover:bg-brand-50"
          onClick={() => {
            void signOut().then(() => router.push('/'));
          }}
        >
          {all('events.guest.leave')}
        </button>
      </div>
    );
  }

  return (
    // Escape closes the menu and returns the focus to its button; moving the focus out of the
    // menu (Tab, or a click elsewhere) closes it too, so it never covers what has the focus.
    <div
      ref={menuRef}
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        setOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`${t('accountMenu')}: ${me.email}`}
        onClick={() => setOpen((value) => !value)}
        className="max-w-full rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
      >
        <span dir="ltr" className="block max-w-56 truncate">
          {me.email}
        </span>
      </button>
      {open && (
        <ul
          id="account-menu"
          className="absolute end-0 z-20 mt-2 w-56 rounded-md border border-border bg-surface p-1 shadow-raised"
        >
          <MenuLink href="/account/profile" onClick={() => setOpen(false)}>
            {tm('profile')}
          </MenuLink>
          <MenuLink href="/account/verification" onClick={() => setOpen(false)}>
            {all('verification.nav')}
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
