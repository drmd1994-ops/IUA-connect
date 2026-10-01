'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Link } from '@/i18n/navigation';

export type EducationStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type EducationAction = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'TAKE_DOWN' | 'ARCHIVE';
type History = components['schemas']['EducationHistoryDto']['items'];

export const EDUCATION_STATUSES: EducationStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
];

/**
 * Who may change the text (the API enforces the same): an editor while it is a draft, a reviewer
 * while it is in review.
 */
export function useCanEdit(status: EducationStatus | null): boolean {
  const { me } = useAuth();
  if (status === null || status === 'DRAFT') return true;
  return status === 'IN_REVIEW' && !!me?.permissions.some((p) => p === 'education.review');
}

/** The review steps of an education item or an exam question (M6 plan §3). */
export function ReviewPanel({
  status,
  everPublished,
  publicHref,
  pending,
  onAction,
  onDelete,
}: {
  status: EducationStatus;
  everPublished: boolean;
  /** Where readers see it, once published. */
  publicHref: string | null;
  pending: boolean;
  onAction: (action: EducationAction, comment?: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('education.admin.actions');
  const { me } = useAuth();
  const [comment, setComment] = useState('');
  const reviewer = !!me?.permissions.some((p) => p === 'education.review');
  const deletable = status === 'DRAFT' && !everPublished;
  if (!(deletable || (reviewer && status !== 'DRAFT' && status !== 'ARCHIVED'))) return null;

  return (
    <section
      aria-labelledby="review-title"
      className="flex flex-col gap-4 rounded-md border border-border p-5"
    >
      <h2 id="review-title" className="text-xl font-semibold">
        {t('title')}
      </h2>

      {status === 'IN_REVIEW' && reviewer && (
        <>
          <TextareaField
            label={t('comment')}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            rows={2}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !comment.trim()}
              onClick={() => onAction('SEND_BACK', comment.trim())}
            >
              {t('SEND_BACK')}
            </Button>
            <Button type="button" disabled={pending} onClick={() => onAction('PUBLISH')}>
              {t('PUBLISH')}
            </Button>
          </div>
        </>
      )}

      {status === 'PUBLISHED' && reviewer && (
        <>
          <p className="text-sm text-text-muted">{t('takeDownHint')}</p>
          <div className="flex flex-wrap items-center gap-4">
            {publicHref && (
              <Link
                href={publicHref}
                className="font-semibold text-primary underline underline-offset-4"
              >
                {t('viewPublic')}
              </Link>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onAction('TAKE_DOWN')}
            >
              {t('TAKE_DOWN')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => onAction('ARCHIVE')}
            >
              {t('ARCHIVE')}
            </Button>
          </div>
        </>
      )}

      {deletable && (
        <div>
          <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>
            {t('delete')}
          </Button>
        </div>
      )}
    </section>
  );
}

/** The item's history, oldest first. */
export function HistoryList({ history }: { history: History | null }) {
  const t = useTranslations('education.admin');
  const format = useFormatter();
  if (!history || history.length === 0) return null;
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="text-xl font-semibold">
        {t('history.title')}
      </h2>
      <ol className="mt-3 flex flex-col gap-2 text-sm" data-testid="education-history">
        {history.map((entry, index) => (
          <li key={`${entry.at}:${index}`}>
            <time dateTime={entry.at} className="text-text-muted">
              {format.dateTime(new Date(entry.at), { dateStyle: 'medium', timeStyle: 'short' })}
            </time>
            {' · '}
            {entry.action === 'correct' ? t('history.corrected') : t(`statuses.${entry.toStatus}`)}
            {entry.comment && ` · ${entry.comment}`}
          </li>
        ))}
      </ol>
    </section>
  );
}
