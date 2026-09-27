'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { Link, useRouter } from '@/i18n/navigation';

/** Header links: "Sign in / Sign up" when signed out; account links and "Sign out" when signed in. */
export function AccountMenu() {
  const t = useTranslations('auth.nav');
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
        aria-label={t('accountMenu')}
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
          <li>
            <Link
              href="/account/security"
              onClick={() => setOpen(false)}
              className="block rounded px-3 py-2 text-sm hover:bg-surface-muted"
            >
              {t('security')}
            </Link>
          </li>
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
