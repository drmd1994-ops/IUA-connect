import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DirectoryService } from '../profiles';
import {
  type PublicationDraftListDto,
  type PublicationDto,
  type PublicationInputDto,
  type PublicationListDto,
  type PublicationLookupDto,
} from './publications.dto';
import {
  type LookupResult,
  OrcidSource,
  PubMedSource,
  cleanDoi,
  cleanPmid,
} from './publication-sources';

const MAX_PUBLICATIONS = 500;

/**
 * Publications on a profile (M27 plan §2; owner answer §10.3). A person saves their own: typed
 * in, or filled from PubMed by a PubMed ID or a DOI, or chosen from their ORCID record. A lookup
 * only fills the form; nothing is saved until the person saves it. They show to members with the
 * visibility of the person's research interests, in the person's own order, the hidden ones not
 * at all.
 */
@Injectable()
export class PublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
    private readonly pubmed: PubMedSource,
    private readonly orcid: OrcidSource,
  ) {}

  async mine(principal: Principal): Promise<PublicationListDto> {
    const rows = await this.prisma.publication.findMany({
      where: { userId: principal.userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
    return { items: rows.map(view) };
  }

  /** A member's publications, as other verified people see them. */
  async ofMember(principal: Principal, userId: string): Promise<PublicationListDto> {
    if (!principal.verified) throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
    if (userId !== principal.userId && !(await this.directory.showsResearch(userId))) {
      throw new AppException('NOT_FOUND');
    }
    const rows = await this.prisma.publication.findMany({
      where: { userId, hidden: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
    return { items: rows.map(view) };
  }

  async create(principal: Principal, input: PublicationInputDto): Promise<PublicationDto> {
    const count = await this.prisma.publication.count({ where: { userId: principal.userId } });
    if (count >= MAX_PUBLICATIONS) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'publicationsTooMany' }]);
    }
    const row = await this.prisma.publication.create({
      data: { id: uuidv7(), userId: principal.userId, ...fields(input), position: count },
    });
    return view(row);
  }

  async update(
    principal: Principal,
    id: string,
    input: PublicationInputDto,
  ): Promise<PublicationDto> {
    await this.own(principal, id);
    return view(await this.prisma.publication.update({ where: { id }, data: fields(input) }));
  }

  async remove(principal: Principal, id: string): Promise<void> {
    await this.own(principal, id);
    await this.prisma.publication.delete({ where: { id } });
  }

  /** The person's own order: the ids given first, in that order, then any others. */
  async order(principal: Principal, ids: readonly string[]): Promise<PublicationListDto> {
    const rows = await this.prisma.publication.findMany({
      where: { userId: principal.userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    const known = new Set(rows.map((row) => row.id));
    const ordered = [
      ...[...new Set(ids)].filter((id) => known.has(id)),
      ...rows.map((row) => row.id).filter((id) => !ids.includes(id)),
    ];
    await this.prisma.$transaction(
      ordered.map((id, position) =>
        this.prisma.publication.update({ where: { id }, data: { position } }),
      ),
    );
    return this.mine(principal);
  }

  /** Fills a publication from PubMed by its PubMed ID or DOI. Nothing is saved. */
  async lookup(
    principal: Principal,
    input: PublicationLookupDto,
  ): Promise<PublicationDraftListDto> {
    const pmid = input.pmid ? cleanPmid(input.pmid) : null;
    const doi = input.doi ? cleanDoi(input.doi) : null;
    if (!pmid && !doi) {
      throw new AppException('VALIDATION_FAILED', [
        { field: input.pmid ? 'pmid' : 'doi', code: 'publicationIdInvalid' },
      ]);
    }
    const result = await this.pubmed.find(pmid ? { pmid } : { doi: doi! });
    return this.drafts(principal, 'PUBMED', result);
  }

  /** The works on the person's own ORCID record, to choose from. Nothing is saved. */
  async fromOrcid(principal: Principal): Promise<PublicationDraftListDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: principal.userId },
      select: { orcid: true },
    });
    if (!profile?.orcid) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'publicationsNoOrcid' }]);
    }
    return this.drafts(principal, 'ORCID', await this.orcid.works(profile.orcid));
  }

  private async drafts(
    principal: Principal,
    source: 'PUBMED' | 'ORCID',
    result: LookupResult,
  ): Promise<PublicationDraftListDto> {
    if (!result.ok) {
      throw result.reason === 'notFound'
        ? new AppException('NOT_FOUND', [{ code: 'publicationNotFound' }])
        : new AppException('SERVICE_UNAVAILABLE', [{ code: 'publicationSourceDown' }]);
    }
    const saved = await this.prisma.publication.findMany({
      where: { userId: principal.userId },
      select: { doi: true, pmid: true },
    });
    const dois = new Set(saved.map((p) => p.doi?.toLowerCase()).filter(Boolean));
    const pmids = new Set(saved.map((p) => p.pmid).filter(Boolean));
    return {
      source,
      items: result.drafts.map((draft) => ({
        ...draft,
        saved: Boolean((draft.doi && dois.has(draft.doi)) || (draft.pmid && pmids.has(draft.pmid))),
      })),
    };
  }

  private async own(principal: Principal, id: string): Promise<void> {
    const found = await this.prisma.publication.count({ where: { id, userId: principal.userId } });
    if (!found) throw new AppException('NOT_FOUND');
  }
}

function fields(input: PublicationInputDto) {
  return {
    title: input.title,
    authors: input.authors,
    journal: input.journal,
    year: input.year,
    doi: input.doi ? (cleanDoi(input.doi) ?? input.doi) : null,
    pmid: input.pmid,
    url: input.url,
    topics: [...new Set(input.topics)],
    source: input.source,
    hidden: input.hidden,
  };
}

function view(row: {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  doi: string | null;
  pmid: string | null;
  url: string | null;
  topics: string[];
  source: 'MANUAL' | 'PUBMED' | 'ORCID';
  hidden: boolean;
}): PublicationDto {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors,
    journal: row.journal,
    year: row.year,
    doi: row.doi,
    pmid: row.pmid,
    url: row.url,
    topics: row.topics,
    source: row.source,
    hidden: row.hidden,
  };
}
