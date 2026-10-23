import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService } from '../access';
import { DirectoryService } from '../profiles';
import { SearchProvider } from './search-provider';
import { prepareQuery } from './search-query';
import {
  SEARCH_PAGE_SIZE,
  SEARCH_PREVIEW_SIZE,
  SEARCH_TYPES,
  type SearchQueryDto,
  type SearchResultsDto,
} from './search.dto';

type Group = SearchResultsDto['groups'][number];

/**
 * Global search (M7 plan §2.7): news, events, education and guidelines through the search
 * provider, and listed members through the directory. What the reader may not open is not
 * found: content follows the access tiers, and members are found only by active members.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly provider: SearchProvider,
    private readonly access: AccessService,
    private readonly directory: DirectoryService,
    private readonly prisma: PrismaService,
  ) {}

  async search(principal: Principal | null, query: SearchQueryDto): Promise<SearchResultsDto> {
    const types = SEARCH_TYPES.filter((type) => !query.types || query.types.includes(type));
    // One type: its pages. Several: the first few of each.
    const single = types.length === 1;
    const limit = single ? SEARCH_PAGE_SIZE : SEARCH_PREVIEW_SIZE;
    const offset = single ? (query.page - 1) * SEARCH_PAGE_SIZE : 0;
    const viewer = await this.access.viewerOf(principal);

    const groups = await Promise.all(
      types.map(async (type): Promise<Group> => {
        if (type === 'members') return this.members(principal, query, limit, offset);
        if (type === 'posts') return this.posts(principal, query, limit, offset);
        const page = await this.provider.content({
          type,
          query: query.q,
          locale: query.locale,
          viewer,
          limit,
          offset,
        });
        return { type, total: page.total, items: page.items };
      }),
    );
    return {
      groups: groups.filter((group) => group.total > 0),
      page: single ? query.page : 1,
      pageSize: limit,
    };
  }

  /**
   * Posts in communities (M25) whose title or text matches, or one of whose comments does. For
   * verified people only, as communities are; removed posts and comments are never found.
   */
  private async posts(
    principal: Principal | null,
    query: SearchQueryDto,
    limit: number,
    offset: number,
  ): Promise<Group> {
    const prepared = prepareQuery(query.q);
    if (!principal?.verified || !prepared) return { type: 'posts', total: 0, items: [] };
    const rows = await this.prisma.$queryRaw<
      { id: string; title: string; body: string; slug: string; total: bigint }[]
    >`
      WITH q AS (SELECT to_tsquery('simple', ${prepared.tsquery}) AS tsq)
      SELECT p.id, p.title, p.body, c.slug, count(*) OVER () AS total
      FROM posts p JOIN communities c ON c.id = p.community_id, q
      WHERE p.removed_at IS NULL AND c.archived_at IS NULL
        AND (p.search_vector @@ q.tsq OR EXISTS (
          SELECT 1 FROM post_comments pc
          WHERE pc.post_id = p.id AND pc.removed_at IS NULL AND pc.search_vector @@ q.tsq))
      ORDER BY ts_rank(p.search_vector, q.tsq) DESC, p.activity_at DESC, p.id
      LIMIT ${limit} OFFSET ${offset}`;
    return {
      type: 'posts',
      total: rows.length > 0 ? Number(rows[0]!.total) : 0,
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: row.body.replace(/\s+/g, ' ').trim().slice(0, 200) || null,
        link: `/communities/${row.slug}/${row.id}`,
        // A post is in the language it was written in.
        locale: /[֐-׿]/.test(row.title) ? 'he' : 'en',
      })),
    };
  }

  /** Listed people whose visible name matches. Nothing for anyone but a verified person. */
  private async members(
    principal: Principal | null,
    query: SearchQueryDto,
    limit: number,
    offset: number,
  ): Promise<Group> {
    if (!principal?.verified) return { type: 'members', total: 0, items: [] };
    const found = await this.directory.find(query.q, limit, offset);
    return {
      type: 'members',
      total: found.total,
      items: found.items.map((member) => ({
        id: member.id,
        title: [member.firstName, member.lastName].filter(Boolean).join(' '),
        excerpt:
          [
            member.title,
            member.position,
            query.locale === 'he' ? member.hospital?.nameHe : member.hospital?.nameEn,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        link: `/members/${member.id}`,
        locale: query.locale,
      })),
    };
  }
}
