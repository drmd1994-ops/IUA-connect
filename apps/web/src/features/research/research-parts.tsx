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
export type ProjectSummary = Schemas['ProjectListDto']['items'][number];
export type Project = Schemas['ProjectDto'];
export type ResearchPerson = Project['lead'];

export const STUDY_TYPES: Project['studyType'][] = [
  'PROSPECTIVE',
  'RETROSPECTIVE',
  'TRIAL',
  'REGISTRY',
  'SURVEY',
  'OTHER',
];
export const PROJECT_STATUSES: Project['status'][] = [
  'PLANNING',
  'RECRUITING',
  'ONGOING',
  'COMPLETED',
];
export const ETHICS: Project['ethics'][] = ['APPROVED', 'SUBMITTED', 'NOT_YET', 'NOT_NEEDED'];
export const NEEDS: Project['needs'][number][] = [
  'CENTRES',
  'CO_INVESTIGATORS',
  'STATISTICIAN',
  'RESIDENTS',
  'STUDENTS',
];

export const link = 'font-semibold text-primary underline underline-offset-4';

/** Research is for verified people (M27 owner answer §10.2); anyone else is told how to get there. */
export function ResearchFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('research.list');
  return (
    <RequireSignIn>
      {(me) =>
        me.verified ? (
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

/** The tabs of the research section. Listing a project is for physicians (owner answer §10.1). */
export function ResearchNav({ canList }: { canList: boolean }) {
  const t = useTranslations('research.tabs');
  const pathname = usePathname();
  const tabs = [
    { href: '/research', key: 'projects' },
    ...(canList ? [{ href: '/research/mine', key: 'mine' }] : []),
    { href: '/research/requests', key: 'requests' },
    ...(canList ? [{ href: '/research/new', key: 'new' }] : []),
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

/** "First Last" with the student or resident mark, and the hospital. */
export function PersonLine({ person }: { person: ResearchPerson }) {
  const name = useLocalName();
  return (
    <span>
      {person.firstName} {person.lastName}
      <PersonMark mark={person.mark} />
      {person.hospital && <span className="text-text-muted">, {name(person.hospital)}</span>}
    </span>
  );
}

/** A project in a list: title, type and status, what it looks for, its lead. */
export function ProjectCard({ item }: { item: ProjectSummary }) {
  const t = useTranslations('research');
  const name = useLocalName();
  return (
    <article className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-primary">
        {t(`studyTypes.${item.studyType}`)} · {t(`statuses.${item.status}`)}
      </p>
      <h2 className="text-lg font-semibold">
        <Link href={`/research/${item.id}`} className="text-primary underline underline-offset-4">
          {item.title}
        </Link>
      </h2>
      <p className="text-text">{item.excerpt}</p>
      {item.needs.length > 0 && (
        <p className="text-sm text-text-muted">
          {t('list.lookingFor', { needs: item.needs.map((n) => t(`needs.${n}`)).join(', ') })}
        </p>
      )}
      {item.subspecialties.length > 0 && (
        <p className="text-sm text-text-muted">
          {item.subspecialties.map((s) => name(s)).join(', ')}
        </p>
      )}
      <p className="mt-auto pt-2 text-sm text-text-muted">
        {t('list.by', { name: `${item.lead.firstName} ${item.lead.lastName}` })}
      </p>
      <ProjectFlags item={item} />
    </article>
  );
}

/** Ended, closed to requests, or possibly out of date. */
export function ProjectFlags({ item }: { item: ProjectSummary | Project }) {
  const t = useTranslations('research.list');
  const flags = [
    item.ended ? t('ended') : !item.open ? t('closed') : null,
    item.stale && !item.ended ? t('stale') : null,
  ].filter(Boolean);
  if (flags.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-muted"
        >
          {flag}
        </span>
      ))}
    </p>
  );
}
