'use client';

import { NewsList } from '@/features/content/news-list';
import { EventList } from '@/features/events/event-list';
import { WithOrganisation } from './organisation-page';

/** All the news of one organisation that the reader may see. */
export function OrganisationNews({ slug }: { slug: string }) {
  return (
    <WithOrganisation slug={slug}>
      {(organisation) => <NewsList organisation={organisation} />}
    </WithOrganisation>
  );
}

/** All the events of one organisation that the reader may see. */
export function OrganisationEvents({ slug }: { slug: string }) {
  return (
    <WithOrganisation slug={slug}>
      {(organisation) => <EventList organisation={organisation} />}
    </WithOrganisation>
  );
}
