import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  type ContentSearchRequest,
  type ContentSearchType,
  type SearchPage,
  SearchProvider,
  type SearchViewer,
} from './search-provider';
import { prepareQuery } from './search-query';

interface Source {
  /** The item table, its translation table and the column that joins them. */
  table: string;
  translations: string;
  key: string;
  /** `content_access_rules.entity_type`. */
  entity: string;
  /** The translation column shown as the excerpt. */
  excerpt: string;
  /** Which items are public at all (the table is aliased `x`). */
  live: Prisma.Sql;
  /** The column the link is built from, and the path before it. */
  linkColumn: string;
  linkPrefix: string;
  /** Newest first among equally good matches. */
  recency: string;
}

const SOURCES: Record<ContentSearchType, Source> = {
  news: {
    table: 'news',
    translations: 'news_translations',
    key: 'news_id',
    entity: 'news',
    excerpt: 'summary',
    live: Prisma.sql`x.status = 'PUBLISHED' AND x.revision_of_id IS NULL`,
    linkColumn: 'slug',
    linkPrefix: '/news/',
    recency: 'published_at',
  },
  events: {
    table: 'events',
    translations: 'event_translations',
    key: 'event_id',
    entity: 'event',
    excerpt: 'summary',
    live: Prisma.sql`x.status IN ('PUBLISHED', 'CANCELLED')`,
    linkColumn: 'slug',
    linkPrefix: '/events/',
    recency: 'start_at',
  },
  education: {
    table: 'education_items',
    translations: 'education_translations',
    key: 'item_id',
    entity: 'education',
    excerpt: 'description',
    live: Prisma.sql`x.status = 'PUBLISHED'`,
    linkColumn: 'slug',
    linkPrefix: '/education/',
    recency: 'published_at',
  },
  guidelines: {
    table: 'guidelines',
    translations: 'guideline_translations',
    key: 'guideline_id',
    entity: 'guideline',
    excerpt: 'summary',
    live: Prisma.sql`true`,
    linkColumn: 'id',
    linkPrefix: '/guidelines/',
    recency: 'updated_at',
  },
};

interface Row {
  id: string;
  title: string;
  excerpt: string | null;
  link: string;
  locale: string;
  total: bigint;
}

const EXCERPT_LENGTH = 200;

/**
 * PostgreSQL full-text search (M7 plan §2.7). A text matches when it holds every word of the
 * query: in any of the word's forms and from the word's start, or, for longer words, close to
 * a word of the title (small typing mistakes). Titles weigh more than summaries, summaries more
 * than body text. The access tiers are part of the query: an item the viewer may not open is
 * never selected, so it can't leak through a count or an excerpt either.
 */
@Injectable()
export class PostgresSearch extends SearchProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async content(request: ContentSearchRequest): Promise<SearchPage> {
    const prepared = prepareQuery(request.query);
    if (!prepared) return { items: [], total: 0 };
    const source = SOURCES[request.type];
    const t = Prisma.raw(`"${source.translations}"`);
    const key = Prisma.raw(`"${source.key}"`);
    const table = Prisma.raw(`"${source.table}"`);
    const excerpt = Prisma.raw(`"${source.excerpt}"`);
    const linkColumn = Prisma.raw(`"${source.linkColumn}"`);
    const recency = Prisma.raw(`"${source.recency}"`);
    // Every word is needed: found in the text in one of its forms, or, for a word long enough
    // to judge, close to a word of the title (a small typing mistake).
    const everyTerm = Prisma.join(
      prepared.terms.map((term) =>
        term.fuzzy
          ? Prisma.sql`(t.search_vector @@ to_tsquery('simple', ${term.tsquery})
                        OR ${term.text} <% normalize_he(t.title))`
          : Prisma.sql`t.search_vector @@ to_tsquery('simple', ${term.tsquery})`,
      ),
      ' AND ',
    );

    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH q AS (SELECT to_tsquery('simple', ${prepared.tsquery}) AS tsq, ${prepared.text} AS text),
      matches AS (
        SELECT t.${key} AS id,
               max(ts_rank(t.search_vector, q.tsq)
                   + word_similarity(q.text, normalize_he(t.title))) AS rank
        FROM ${t} t, q
        WHERE ${everyTerm}
        GROUP BY t.${key}
        ${this.sessionMatches(request.type)}
      ),
      best AS (SELECT id, max(rank) AS rank FROM matches GROUP BY id)
      SELECT x.id,
             shown.title,
             left(regexp_replace(coalesce(shown.excerpt, ''), '[#*_>\`\\[\\]]+', '', 'g'),
                  ${EXCERPT_LENGTH}) AS excerpt,
             ${source.linkPrefix} || x.${linkColumn}::text AS link,
             shown.locale,
             count(*) OVER () AS total
      FROM best
      JOIN ${table} x ON x.id = best.id
      JOIN LATERAL (
        SELECT d.title, d.${excerpt} AS excerpt, d.locale
        FROM ${t} d
        WHERE d.${key} = x.id
        ORDER BY (d.locale = ${request.locale}) DESC, (d.locale = 'he') DESC
        LIMIT 1
      ) shown ON true
      WHERE ${source.live} AND ${visible(source.entity, request.viewer)}
      ORDER BY best.rank DESC, x.${recency} DESC NULLS LAST, x.id
      LIMIT ${request.limit} OFFSET ${request.offset}`;

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: row.excerpt?.trim() || null,
        link: row.link,
        locale: row.locale,
      })),
      total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    };
  }

  /** An event is also found by the titles of its sessions. */
  private sessionMatches(type: ContentSearchType): Prisma.Sql {
    if (type !== 'events') return Prisma.empty;
    return Prisma.sql`
      UNION ALL
      SELECT s.event_id AS id, max(ts_rank(st.search_vector, q.tsq)) * 0.5 AS rank
      FROM event_session_translations st
      JOIN event_sessions s ON s.id = st.session_id, q
      WHERE st.search_vector @@ q.tsq
      GROUP BY s.event_id`;
  }
}

/** The access tiers, for an item table aliased `x`. */
function visible(entity: string, viewer: SearchViewer): Prisma.Sql {
  if (!viewer.activeTypeId) return Prisma.sql`x.access_tier = 'PUBLIC'`;
  return Prisma.sql`(
    x.access_tier IN ('PUBLIC', 'MEMBERS')
    OR EXISTS (
      SELECT 1 FROM content_access_rules r
      WHERE r.entity_type = ${entity} AND r.entity_id = x.id
        AND r.membership_type_id = ${viewer.activeTypeId}::uuid
    )
  )`;
}
