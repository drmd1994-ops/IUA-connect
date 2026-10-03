'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useRouter } from '@/i18n/navigation';

/** The search field in the header. It opens the search page with what was typed. */
export function SearchBox() {
  const t = useTranslations('search.box');
  const router = useRouter();
  const [value, setValue] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  return (
    <form
      role="search"
      aria-label={t('label')}
      onSubmit={submit}
      className="flex items-center gap-1"
    >
      <label className="sr-only" htmlFor="site-search">
        {t('label')}
      </label>
      <input
        id="site-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={100}
        placeholder={t('label')}
        className="w-36 rounded-md border border-border bg-surface px-3 py-1.5 text-sm placeholder:text-text-muted sm:w-44"
      />
      <button
        type="submit"
        className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
      >
        {t('button')}
      </button>
    </form>
  );
}
