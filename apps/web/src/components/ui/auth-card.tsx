import type { ReactNode } from 'react';

/** Centered card for the sign-in family of pages. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <div className="rounded-lg border border-border bg-surface p-8 shadow-card">
        <h1 className="text-2xl font-semibold text-brand-900">{title}</h1>
        <div className="mt-6 flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
