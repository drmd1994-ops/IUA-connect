'use client';

import type { components } from '@medconnect/api-client';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { isApiError } from '@/lib/api-errors';

type Schemas = components['schemas'];
export type Organisation = Schemas['OrganisationDto'];
export type Membership = Schemas['MyMembershipsDto']['items'][number];

/** The address of an organisation's section, or of a page inside it. */
export const sectionHref = (slug: string, inside = '') =>
  `/organisations/${encodeURIComponent(slug)}${inside ? `/${inside}` : ''}`;

/** The organisation's own words about itself, in the page's language when it wrote them. */
export function useDescription() {
  const locale = useLocale();
  return (organisation: Organisation) =>
    (locale === 'he' ? organisation.descriptionHe : organisation.descriptionEn) ??
    organisation.descriptionHe ??
    organisation.descriptionEn;
}

/** The organisations that have a section (a public list). Undefined while loading. */
export function useOrganisations(): Organisation[] | undefined {
  const { api, call } = useAuth();
  const [items, setItems] = useState<Organisation[]>();
  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/organisations'))
      .then((result) => active && setItems(result.items))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [api, call]);
  return items;
}

/** One organisation by its address name. Undefined while loading, null when there is none. */
export function useOrganisation(slug: string): {
  organisation: Organisation | null | undefined;
  error: unknown;
} {
  const { api, call } = useAuth();
  const [state, setState] = useState<{
    slug: string;
    organisation: Organisation | null;
    error: unknown;
  }>();
  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/organisations/{slugOrId}', { params: { path: { slugOrId: slug } } }),
    )
      .then((organisation) => active && setState({ slug, organisation, error: null }))
      .catch((caught: unknown) => {
        if (!active) return;
        const missing = isApiError(caught, 'NOT_FOUND') || isApiError(caught, 'VALIDATION_ERROR');
        setState({ slug, organisation: null, error: missing ? null : caught });
      });
    return () => {
      active = false;
    };
  }, [api, call, slug]);
  if (state?.slug !== slug) return { organisation: undefined, error: null };
  return { organisation: state.organisation, error: state.error };
}

/** The signed-in person's memberships, one per organisation. Undefined while loading. */
export function useMyMemberships(): Membership[] | undefined {
  const { api, call, status } = useAuth();
  const [items, setItems] = useState<Membership[]>();
  useEffect(() => {
    if (status !== 'signedIn') return;
    let active = true;
    call(() => api.GET('/api/v1/me/memberships'))
      .then((result) => active && setItems(result.items))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [api, call, status]);
  return status === 'signedIn' ? items : status === 'signedOut' ? [] : undefined;
}
