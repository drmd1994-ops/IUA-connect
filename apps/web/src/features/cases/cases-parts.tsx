'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { useLocalName } from '@/features/membership/reference';
import { PersonMark } from '@/features/verification/person-mark';
import { Link, usePathname } from '@/i18n/navigation';

type Schemas = components['schemas'];
export type CaseSummary = Schemas['CaseListDto']['items'][number];
export type Case = Schemas['CaseDto'];

export const AGE_RANGES: Case['ageRange'][] = [
  'UNDER_18',
  'FROM_18_TO_39',
  'FROM_40_TO_64',
  'FROM_65_TO_79',
  'OVER_80',
];
export const SEXES: Case['sex'][] = ['FEMALE', 'MALE', 'NOT_STATED'];
export const link = 'font-semibold text-primary underline underline-offset-4';

/** Cases are for verified people (and platform moderators); anyone else is told how to get there. */
export function CasesFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('cases.list');
  return (
    <RequireSignIn>
      {(me) =>
        me.verified || me.permissions.includes('chat.moderate') ? (
          children
        ) : (
          <PageFrame>
            <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
            <Alert>{t('verifiedOnly')}</Alert>
            <Link href="/account/verification" className={link}>
              {t('verifyLink')}
            </Link>
          </PageFrame>
        )
      }
    </RequireSignIn>
  );
}

/** The tabs of the cases section; Review only for reviewers. */
export function CasesNav({ reviewer }: { reviewer: boolean }) {
  const t = useTranslations('cases.tabs');
  const pathname = usePathname();
  const tabs = [
    { href: '/cases', key: 'list' },
    { href: '/cases/mine', key: 'mine' },
    { href: '/cases/new', key: 'new' },
    ...(reviewer ? [{ href: '/cases/review', key: 'review' }] : []),
  ];
  return (
    <nav aria-label={t('label')} className="border-b border-border">
      <ul className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`inline-block rounded-t-md px-4 py-2 text-sm font-semibold ${
                  current
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Female, 40 to 64". */
export function usePatientLine() {
  const t = useTranslations('cases');
  return (item: { sex: Case['sex']; ageRange: Case['ageRange'] }) =>
    t('list.patient', { sex: t(`sexes.${item.sex}`), age: t(`ageRanges.${item.ageRange}`) });
}

export function AuthorLine({ author }: { author: Case['author'] }) {
  const t = useTranslations('cases.list');
  if (!author) return null;
  return (
    <span>
      {t('by', { name: `${author.firstName} ${author.lastName}` })}
      <PersonMark mark={author.mark} />
    </span>
  );
}

/** A case in a list: subspecialty, title, the patient in a line, the question, who presented it. */
export function CaseCard({
  item,
  highlight = false,
  showStatus = false,
}: {
  item: CaseSummary;
  highlight?: boolean;
  showStatus?: boolean;
}) {
  const t = useTranslations('cases');
  const name = useLocalName();
  const patient = usePatientLine();
  return (
    <article
      className={`flex h-full flex-col gap-2 rounded-lg border bg-surface p-5 shadow-card ${
        highlight ? 'border-primary' : 'border-border'
      }`}
    >
      <p className="text-sm font-semibold text-primary">
        {name(item.subspecialty)}
        {showStatus && ` · ${t(`statuses.${item.status}`)}`}
      </p>
      <h2 className={highlight ? 'text-2xl font-semibold' : 'text-lg font-semibold'} dir="auto">
        <Link href={`/cases/${item.id}`} className="text-primary underline underline-offset-4">
          {item.title}
        </Link>
      </h2>
      <p className="text-sm text-text-muted">{patient(item)}</p>
      <p dir="auto">{item.question}</p>
      <p className="mt-auto pt-2 text-sm text-text-muted">
        <AuthorLine author={item.author} />
        {item.status === 'PUBLISHED' && ` · ${t('list.comments', { count: item.comments })}`}
        {item.pictures > 0 && ` · ${t('list.pictures', { count: item.pictures })}`}
      </p>
    </article>
  );
}

/** The standing note: education, not advice about a patient. */
export function StandingNote() {
  const t = useTranslations('cases');
  return <Alert>{t('note')}</Alert>;
}
