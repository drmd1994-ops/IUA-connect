'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { StoredImage } from '@/features/content/files';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { useMemberName } from './directory-page';

type Member = components['schemas']['DirectoryMemberDto'];

const link = 'font-semibold text-primary underline underline-offset-4';

/** One listed member, with the fields they chose to show to members. */
export function MemberPage({ id }: { id: string }) {
  return <RequireSignIn>{() => <MemberView id={id} />}</RequireSignIn>;
}

function MemberView({ id }: { id: string }) {
  const t = useTranslations();
  const m = (key: string, values?: Record<string, string>) => t(`directory.member.${key}`, values);
  const locale = useLocale();
  const name = useLocalName();
  const memberName = useMemberName();
  const { api, call } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/members/{id}', { params: { path: { id } } }))
      .then((result) => active && setMember(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  if (error !== null) {
    return (
      <PageFrame>
        <Link href="/members" className={link}>
          {m('back')}
        </Link>
        <Alert tone={isApiError(error, 'FORBIDDEN') ? 'info' : 'error'}>
          {isApiError(error, 'FORBIDDEN')
            ? t('directory.list.membersOnly')
            : errorMessage(error, t)}
        </Alert>
      </PageFrame>
    );
  }
  if (!member) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }

  const shown = memberName(member);
  const languages = new Intl.DisplayNames([locale], { type: 'language' });
  const institution = [name(member.hospital), name(member.department)].filter(Boolean).join(', ');
  const rows: [string, ReactNode][] = [];
  if (member.position) rows.push([m('position'), member.position]);
  if (institution) rows.push([m('institution'), institution]);
  if (member.subspecialties.length > 0) {
    rows.push([m('subspecialties'), member.subspecialties.map((s) => name(s)).join(', ')]);
  }
  if (member.languages.length > 0) {
    rows.push([
      m('languages'),
      member.languages.map((code) => languages.of(code) ?? code).join(', '),
    ]);
  }
  if (member.orcid) {
    rows.push([
      m('orcid'),
      <a key="orcid" href={`https://orcid.org/${member.orcid}`} className={link} dir="ltr">
        {member.orcid}
      </a>,
    ]);
  }
  if (member.contactEmail) {
    rows.push([
      m('contactEmail'),
      <a key="email" href={`mailto:${member.contactEmail}`} className={link} dir="ltr">
        {member.contactEmail}
      </a>,
    ]);
  }
  if (member.contactPhone) {
    rows.push([
      m('contactPhone'),
      <span key="phone" dir="ltr">
        {member.contactPhone}
      </span>,
    ]);
  }
  const nameOnly = rows.length === 0 && !member.title && !member.bio && !member.researchInterests;

  return (
    <PageFrame>
      <Link href="/members" className={link}>
        {m('back')}
      </Link>
      <article data-testid="directory-member" className="flex flex-col gap-6">
        <div className="flex items-center gap-5">
          {member.photoFileId && (
            <StoredImage
              fileId={member.photoFileId}
              alt={m('photoAlt', { name: shown })}
              className="size-24 shrink-0 rounded-full object-cover"
            />
          )}
          <div>
            <h1 className="text-3xl font-semibold text-brand-900">{shown}</h1>
            {member.title && <p className="mt-1 text-text-muted">{member.title}</p>}
          </div>
        </div>
        {nameOnly && <p className="text-text-muted">{m('nameOnly')}</p>}
        {rows.length > 0 && (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-semibold">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {member.bio && (
          <section aria-labelledby="member-bio">
            <h2 id="member-bio" className="text-xl font-semibold">
              {m('bio')}
            </h2>
            <p className="mt-2 whitespace-pre-line">{member.bio}</p>
          </section>
        )}
        {member.researchInterests && (
          <section aria-labelledby="member-research">
            <h2 id="member-research" className="text-xl font-semibold">
              {m('researchInterests')}
            </h2>
            <p className="mt-2 whitespace-pre-line">{member.researchInterests}</p>
          </section>
        )}
      </article>
    </PageFrame>
  );
}
