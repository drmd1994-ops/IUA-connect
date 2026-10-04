'use client';

import { useTranslations } from 'next-intl';
import { StoredImage } from '@/features/content/files';
import type { ChatEvent } from './chat-events';
import { type Person, initials, personName } from './chat-model';

/** How the parts of the chat page listen to the page's one stream of events. */
export type Subscribe = (listener: (event: ChatEvent) => void) => () => void;

export const chatLink = 'font-semibold text-primary underline underline-offset-4';

/** A person's photo when they show it, otherwise a circle with their first letters. */
export function Avatar({ person, size = 'size-11' }: { person: Person; size?: string }) {
  if (person.photoFileId) {
    return (
      <StoredImage
        fileId={person.photoFileId}
        variant="thumb"
        alt=""
        placeholder
        className={`${size} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${size} grid shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-900`}
    >
      {initials(person)}
    </span>
  );
}

/** The name to show for the other person of a conversation. */
export function usePersonLabel() {
  const t = useTranslations('chat.list');
  return (person: Pick<Person, 'id' | 'firstName' | 'lastName'>) =>
    personName(person) ?? (person.id ? t('unknownPerson') : t('deletedAccount'));
}
