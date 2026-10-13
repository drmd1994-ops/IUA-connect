import { type Locale } from '@iua/i18n';

/** The kinds of content the search covers. Members are found through the directory. */
export const CONTENT_SEARCH_TYPES = ['news', 'events', 'education', 'guidelines'] as const;
export type ContentSearchType = (typeof CONTENT_SEARCH_TYPES)[number];

/** Who is searching, as the access tiers see them (the same as `Viewer` of the access module). */
export interface SearchViewer {
  /** Known to the platform as a physician. */
  verified: boolean;
  /** The active memberships: the organisation and the membership type of each. */
  memberships: readonly { organisationId: string; typeId: string }[];
}

export interface SearchHit {
  id: string;
  title: string;
  /** A short piece of plain text about the item, or null. */
  excerpt: string | null;
  /** A path inside the site, without the language prefix. */
  link: string;
  /** The language of the title and excerpt. */
  locale: string;
}

export interface SearchPage {
  items: SearchHit[];
  total: number;
}

export interface ContentSearchRequest {
  type: ContentSearchType;
  /** What the person typed. */
  query: string;
  /** The language to show results in, when the item has it. */
  locale: Locale;
  viewer: SearchViewer;
  limit: number;
  offset: number;
}

/**
 * The search engine behind /search (ARCHITECTURE.md §5). The first implementation is
 * PostgreSQL full-text search; another engine can replace it without touching the callers.
 * An implementation must apply the access tiers itself: it never returns an item the viewer
 * may not open.
 */
export abstract class SearchProvider {
  abstract content(request: ContentSearchRequest): Promise<SearchPage>;
}
