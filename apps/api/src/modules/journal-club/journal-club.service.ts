import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, getMessages, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { markOf } from '../../common/verified-as';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { refusePatientDetails } from '../community';
import { ContentAnnouncer, Notifier } from '../notifications';
import { PubMedSource, cleanDoi, cleanPmid } from '../publications';
import {
  type JournalClubAdminEntryDto,
  type JournalClubAdminListDto,
  type JournalClubAdminListQueryDto,
  type JournalClubArticleDto,
  type JournalClubEntryDto,
  type JournalClubHistoryDto,
  type JournalClubInputDto,
  type JournalClubListDto,
  type JournalClubListQueryDto,
  type JournalClubLookupDto,
  type JournalClubPollDto,
  type JournalClubScopeDto,
  type JournalClubTransitionDto,
} from './journal-club.dto';
import {
  type JournalClubAction,
  type PollAnswer,
  monthStart,
  planJournalClubTransition,
  showsTotals,
} from './journal-club-workflow';

const PAGE_SIZE = 12;
const EXCERPT = 240;
const SUBSPECIALTY_ROLE = 'SUBSPECIALTY_ADMIN';
const NAME_REF = { id: true, nameHe: true, nameEn: true } as const;
const SUBSPECIALTY_REF = { ...NAME_REF, key: true } as const;

const AUTHOR = {
  id: true,
  email: true,
  verifiedAs: true,
  profile: { select: { firstName: true, lastName: true, hospital: { select: NAME_REF } } },
} satisfies Prisma.UserSelect;

const ENTRY_INCLUDE = {
  subspecialty: { select: SUBSPECIALTY_REF },
  summaryAuthor: { select: AUTHOR },
  commentaryAuthor: { select: AUTHOR },
  post: { select: { id: true, removedAt: true, community: { select: { slug: true } } } },
} satisfies Prisma.JournalClubEntryInclude;

type EntryRow = Prisma.JournalClubEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;
type AuthorRow = Prisma.UserGetPayload<{ select: typeof AUTHOR }>;

/** Where an editor may work: every subspecialty, or the ones they are appointed to. */
interface Rights {
  principal: Principal;
  all: boolean;
  subspecialtyIds: Set<string>;
}

/**
 * The journal club (M31 plan; owner answers §10). Editors (`journalclub.manage`, or a
 * subspecialty admin for their own subspecialty) write an entry about an article, linked and
 * never copied, with a summary and an expert's commentary by named members; another editor
 * publishes it. Publishing opens its discussion post in the subspecialty's community and
 * announces it. Verified people read entries and answer the anonymous poll.
 */
@Injectable()
export class JournalClubService {
  private readonly logger = new Logger(JournalClubService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
    private readonly announcer: ContentAnnouncer,
    private readonly pubmed: PubMedSource,
  ) {}

  // --- Members ----------------------------------------------------------------------------------

  async list(principal: Principal, query: JournalClubListQueryDto): Promise<JournalClubListDto> {
    ensureVerified(principal);
    const where: Prisma.JournalClubEntryWhereInput = {
      status: { in: ['PUBLISHED', 'ARCHIVED'] },
      ...(query.subspecialty ? { subspecialty: { key: query.subspecialty } } : {}),
      ...(query.year
        ? {
            month: {
              gte: new Date(Date.UTC(query.year, 0, 1)),
              lt: new Date(Date.UTC(query.year + 1, 0, 1)),
            },
          }
        : {}),
    };
    const order: Prisma.JournalClubEntryOrderByWithRelationInput[] = [
      { month: 'desc' },
      { publishedAt: 'desc' },
    ];
    const [rows, total, current] = await Promise.all([
      this.prisma.journalClubEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: order,
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.journalClubEntry.count({ where }),
      this.prisma.journalClubEntry.findFirst({
        where: { status: 'PUBLISHED' },
        include: ENTRY_INCLUDE,
        orderBy: order,
      }),
    ]);
    return {
      items: rows.map(summaryView),
      current: current ? summaryView(current) : null,
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
    };
  }

  async get(principal: Principal, id: string): Promise<JournalClubEntryDto> {
    ensureVerified(principal);
    const row = await this.prisma.journalClubEntry.findFirst({
      where: { id, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      include: ENTRY_INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    return {
      ...summaryView(row),
      summary: row.summary,
      summaryAuthor: authorView(row.summaryAuthor),
      commentary: row.commentary,
      commentaryAuthor: authorView(row.commentaryAuthor),
      keyPoints: row.keyPoints,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      poll: await this.poll(row.id, row.status, principal.userId),
      discussion:
        row.post && !row.post.removedAt
          ? { communitySlug: row.post.community.slug, postId: row.post.id }
          : null,
    };
  }

  /** The reader's answer; given again, it replaces the one before. Only while published. */
  async vote(principal: Principal, id: string, answer: PollAnswer): Promise<JournalClubPollDto> {
    ensureVerified(principal);
    const row = await this.prisma.journalClubEntry.findFirst({
      where: { id, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      select: { id: true, status: true },
    });
    if (!row) throw new AppException('NOT_FOUND');
    if (row.status !== 'PUBLISHED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'journalClubPollClosed' }]);
    }
    await this.prisma.journalClubVote.upsert({
      where: { entryId_userId: { entryId: id, userId: principal.userId } },
      create: { entryId: id, userId: principal.userId, answer },
      update: { answer },
    });
    return this.poll(id, row.status, principal.userId);
  }

  private async poll(
    entryId: string,
    status: EntryRow['status'],
    userId: string,
  ): Promise<JournalClubPollDto> {
    const mine = await this.prisma.journalClubVote.findUnique({
      where: { entryId_userId: { entryId, userId } },
      select: { answer: true },
    });
    let totals: JournalClubPollDto['totals'] = null;
    if (showsTotals(status, mine !== null)) {
      const groups = await this.prisma.journalClubVote.groupBy({
        by: ['answer'],
        where: { entryId },
        _count: { _all: true },
      });
      const count = (answer: PollAnswer) =>
        groups.find((group) => group.answer === answer)?._count._all ?? 0;
      totals = {
        YES: count('YES'),
        PERHAPS: count('PERHAPS'),
        NO: count('NO'),
        total: groups.reduce((sum, group) => sum + group._count._all, 0),
      };
    }
    return { open: status === 'PUBLISHED', mine: mine?.answer ?? null, totals };
  }

  // --- Editors ----------------------------------------------------------------------------------

  async scope(principal: Principal): Promise<JournalClubScopeDto> {
    const rights = await this.rights(principal);
    return { all: rights.all, subspecialtyIds: [...rights.subspecialtyIds] };
  }

  async adminList(
    principal: Principal,
    query: JournalClubAdminListQueryDto,
  ): Promise<JournalClubAdminListDto> {
    const rights = await this.rights(principal);
    const where: Prisma.JournalClubEntryWhereInput = {
      ...ownWhere(rights),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.journalClubEntry.findMany({
        where,
        include: { subspecialty: { select: SUBSPECIALTY_REF } },
        orderBy: [{ month: 'desc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.journalClubEntry.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        subspecialty: row.subspecialty,
        month: monthText(row.month),
        articleTitle: row.articleTitle,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
    };
  }

  async adminGet(principal: Principal, id: string): Promise<JournalClubAdminEntryDto> {
    const rights = await this.rights(principal);
    return adminView(await this.mine(rights, id), principal.userId);
  }

  async create(
    principal: Principal,
    input: JournalClubInputDto,
    meta: RequestMeta,
  ): Promise<JournalClubAdminEntryDto> {
    const rights = await this.rights(principal);
    const data = await this.fields(rights, input);
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.journalClubEntry.create({ data: { id, ...data, createdBy: principal.userId } });
      await addHistory(tx, id, 'create', null, 'DRAFT', principal.userId);
    });
    await this.record('journalclub.create', id, principal, meta);
    return this.adminGet(principal, id);
  }

  /** Changes a draft. A published entry is taken back first, and reviewed again. */
  async update(
    principal: Principal,
    id: string,
    input: JournalClubInputDto,
    meta: RequestMeta,
  ): Promise<JournalClubAdminEntryDto> {
    const rights = await this.rights(principal);
    const row = await this.mine(rights, id);
    if (row.status !== 'DRAFT') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'journalClubNotDraft' }]);
    }
    const data = await this.fields(rights, input);
    const { count } = await this.prisma.journalClubEntry.updateMany({
      where: { id, status: 'DRAFT' },
      data,
    });
    if (count === 0) throw new AppException('CONFLICT', [{ code: 'journalClubChanged' }]);
    await this.record('journalclub.update', id, principal, meta);
    return this.adminGet(principal, id);
  }

  async transition(
    principal: Principal,
    id: string,
    input: JournalClubTransitionDto,
    meta: RequestMeta,
  ): Promise<JournalClubAdminEntryDto> {
    const rights = await this.rights(principal);
    const row = await this.mine(rights, id);
    const action = input.action as JournalClubAction;
    const plan = planJournalClubTransition(action, {
      status: row.status,
      submittedBy: row.submittedBy,
      actorUserId: principal.userId,
      canEdit: covers(rights, row.subspecialtyId),
      ...(input.comment ? { comment: input.comment } : {}),
    });
    if (!plan.ok) throw new AppException(plan.error, [{ code: plan.code }]);
    const community =
      action === 'PUBLISH' && !row.postId ? await this.community(row.subspecialtyId) : null;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.JournalClubEntryUpdateManyMutationInput = { status: plan.to };
      if (action === 'SUBMIT') data.submittedBy = principal.userId;
      if (action === 'SEND_BACK' || action === 'TAKE_BACK') data.submittedBy = null;
      if (action === 'PUBLISH') {
        data.publishedBy = principal.userId;
        data.publishedAt = row.publishedAt ?? now;
      }
      const { count } = await tx.journalClubEntry.updateMany({
        where: { id, status: row.status },
        data,
      });
      // Someone else moved it first.
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'journalClubChanged' }]);
      if (community) await this.openDiscussion(tx, row, community, now);
      await addHistory(
        tx,
        id,
        action.toLowerCase(),
        row.status,
        plan.to,
        principal.userId,
        input.comment,
      );
    });
    await this.record('journalclub.transition', id, principal, meta, {
      action,
      from: row.status,
      to: plan.to,
    });
    if (action === 'SEND_BACK') await this.tellWriter(row, 'journalClubSentBack', input.comment);
    if (action === 'PUBLISH') {
      await this.tellWriter(row, 'journalClubPublished');
      // Announced once: publishing again after a correction finds the announcement and is quiet.
      await this.announcer.announce({
        entityType: 'journal_club',
        entityId: row.id,
        kind: 'JOURNAL_CLUB',
        type: 'contentJournalClub',
        translations: [
          { locale: 'he', title: row.articleTitle },
          { locale: 'en', title: row.articleTitle },
        ],
        link: `/journal-club/${row.id}`,
        accessTier: 'VERIFIED',
      });
    }
    return this.adminGet(principal, id);
  }

  async history(principal: Principal, id: string): Promise<JournalClubHistoryDto> {
    const rights = await this.rights(principal);
    await this.mine(rights, id);
    const rows = await this.prisma.journalClubHistory.findMany({
      where: { entryId: id },
      orderBy: { at: 'asc' },
    });
    const actors = new Map(
      (
        await this.prisma.profile.findMany({
          where: { userId: { in: rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])) } },
          select: { userId: true, firstName: true, lastName: true },
        })
      ).map((p) => [p.userId, { firstName: p.firstName ?? '', lastName: p.lastName ?? '' }]),
    );
    return {
      items: rows.map((r) => ({
        action: r.action,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        actor: (r.actorUserId && actors.get(r.actorUserId)) || null,
        comment: r.comment,
        at: r.at.toISOString(),
      })),
    };
  }

  /** Fills an article from PubMed by its PubMed ID or DOI. Nothing is saved. */
  async lookup(principal: Principal, input: JournalClubLookupDto): Promise<JournalClubArticleDto> {
    await this.rights(principal);
    const pmid = input.pmid ? cleanPmid(input.pmid) : null;
    const doi = input.doi ? cleanDoi(input.doi) : null;
    if (!pmid && !doi) {
      throw new AppException('VALIDATION_FAILED', [
        { field: input.pmid ? 'pmid' : 'doi', code: 'publicationIdInvalid' },
      ]);
    }
    const result = await this.pubmed.find(pmid ? { pmid } : { doi: doi! });
    if (!result.ok) {
      throw result.reason === 'notFound'
        ? new AppException('NOT_FOUND', [{ code: 'publicationNotFound' }])
        : new AppException('SERVICE_UNAVAILABLE', [{ code: 'publicationSourceDown' }]);
    }
    const draft = result.drafts[0]!;
    return {
      articleTitle: draft.title,
      articleAuthors: draft.authors,
      journal: draft.journal,
      year: draft.year,
      doi: draft.doi,
      pmid: draft.pmid,
    };
  }

  // --- internals --------------------------------------------------------------------------------

  private async rights(principal: Principal): Promise<Rights> {
    const all = principal.permissions.has('journalclub.manage');
    let subspecialtyIds = new Set<string>();
    if (!all && principal.permissions.has('journalclub.subspecialty')) {
      const grants = await this.prisma.userRole.findMany({
        where: {
          userId: principal.userId,
          role: { key: SUBSPECIALTY_ROLE },
          scopeType: 'SUBSPECIALTY',
          organisationId: null,
        },
        select: { scopeId: true },
      });
      subspecialtyIds = new Set(grants.flatMap((grant) => (grant.scopeId ? [grant.scopeId] : [])));
    }
    if (!all && subspecialtyIds.size === 0) throw new AppException('FORBIDDEN');
    return { principal, all, subspecialtyIds };
  }

  /** An entry the editor may work on; any other reads as "not found". */
  private async mine(rights: Rights, id: string): Promise<EntryRow> {
    const row = await this.prisma.journalClubEntry.findFirst({
      where: { id, ...ownWhere(rights) },
      include: ENTRY_INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  /** The stored fields of an input, checked: the subspecialty, the month, the named authors. */
  private async fields(rights: Rights, input: JournalClubInputDto) {
    if (!covers(rights, input.subspecialtyId)) {
      throw invalid('subspecialtyId', 'journalClubSubspecialtyNotYours');
    }
    const subspecialty = await this.prisma.subspecialty.count({
      where: { id: input.subspecialtyId },
    });
    if (!subspecialty) throw invalid('subspecialtyId', 'unknownSubspecialty');
    const month = monthStart(input.month);
    if (!month) throw invalid('month', 'journalClubMonthInvalid');
    refusePatientDetails({
      summary: input.summary,
      commentary: input.commentary ?? undefined,
      keyPoints: input.keyPoints.join('\n'),
    });
    const summaryAuthor = await this.author(input.summaryAuthorEmail, 'summaryAuthorEmail');
    const commentaryAuthor =
      input.commentary && input.commentaryAuthorEmail
        ? await this.author(input.commentaryAuthorEmail, 'commentaryAuthorEmail')
        : null;
    return {
      subspecialtyId: input.subspecialtyId,
      month,
      locale: input.locale,
      articleTitle: input.articleTitle,
      articleAuthors: input.articleAuthors,
      journal: input.journal,
      year: input.year,
      doi: input.doi ? (cleanDoi(input.doi) ?? input.doi) : null,
      pmid: input.pmid,
      summary: input.summary,
      summaryAuthorId: summaryAuthor,
      commentary: input.commentary || null,
      commentaryAuthorId: commentaryAuthor,
      keyPoints: input.keyPoints,
    };
  }

  /** A named author: a verified person with an active account. */
  private async author(email: string, field: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: 'insensitive' },
        status: 'ACTIVE',
        verifiedAt: { not: null },
      },
      select: { id: true, verifiedUntil: true },
    });
    if (!user || (user.verifiedUntil && user.verifiedUntil <= new Date())) {
      throw invalid(field, 'journalClubAuthorUnknown');
    }
    return user.id;
  }

  /** The subspecialty's open community, where the discussion goes. */
  private async community(subspecialtyId: string) {
    const community = await this.prisma.community.findFirst({
      where: { subspecialtyId, archivedAt: null },
      select: { id: true },
    });
    if (!community) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'journalClubNoCommunity' }]);
    }
    return community;
  }

  /**
   * The entry's discussion: a post in the subspecialty's community, under the summary's author,
   * in the entry's language, with a link back. Moderation, reports and following work on it as on
   * any post (owner answer §10.3).
   */
  private async openDiscussion(
    tx: Prisma.TransactionClient,
    row: EntryRow,
    community: { id: string },
    now: Date,
  ): Promise<void> {
    const locale: Locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE;
    const texts = getMessages(locale).journalClub.discussion;
    const link = new URL(`/${locale}/journal-club/${row.id}`, this.env.APP_BASE_URL).toString();
    const postId = uuidv7();
    await tx.post.create({
      data: {
        id: postId,
        communityId: community.id,
        authorId: row.summaryAuthorId,
        kind: 'DISCUSSION',
        title: texts.title.replace('{title}', row.articleTitle).slice(0, 200),
        body: `${texts.intro}\n\n${row.summary}\n\n${texts.link.replace('{link}', link)}`.slice(
          0,
          10_000,
        ),
        activityAt: now,
        createdAt: now,
        ...(row.summaryAuthorId ? { follows: { create: { userId: row.summaryAuthorId } } } : {}),
      },
    });
    await tx.journalClubEntry.update({ where: { id: row.id }, data: { postId } });
  }

  /** Tells the one who submitted it that it was sent back or published. */
  private async tellWriter(
    row: EntryRow,
    template: 'journalClubSentBack' | 'journalClubPublished',
    reason = '',
  ): Promise<void> {
    const writerId = row.submittedBy ?? row.createdBy;
    if (!writerId) return;
    try {
      const writer = await this.prisma.user.findUnique({
        where: { id: writerId },
        select: { id: true, email: true, locale: true },
      });
      if (!writer) return;
      const locale: Locale = isLocale(writer.locale) ? writer.locale : DEFAULT_LOCALE;
      const path =
        template === 'journalClubSentBack'
          ? `/${locale}/admin/journal-club/${row.id}`
          : `/${locale}/journal-club/${row.id}`;
      const link = new URL(path, this.env.APP_BASE_URL).toString();
      if (template === 'journalClubSentBack') {
        await this.notifier.send({
          userId: writer.id,
          kind: 'WORK',
          to: writer.email,
          locale,
          template,
          params: { title: row.articleTitle, reason, link },
        });
      } else {
        await this.notifier.send({
          userId: writer.id,
          kind: 'WORK',
          to: writer.email,
          locale,
          template,
          params: { title: row.articleTitle, link },
        });
      }
    } catch (error) {
      this.logger.warn({ err: error, entryId: row.id, template }, 'Journal club notice failed');
    }
  }

  private async record(
    action: string,
    id: string,
    principal: Principal,
    meta: RequestMeta,
    changes?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'journal_club',
      entityId: id,
      ...(changes ? { changes } : {}),
    });
  }
}

function ensureVerified(principal: Principal): void {
  if (!principal.verified) throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
}

function covers(rights: Rights, subspecialtyId: string): boolean {
  return rights.all || rights.subspecialtyIds.has(subspecialtyId);
}

function ownWhere(rights: Rights): Prisma.JournalClubEntryWhereInput {
  return rights.all ? {} : { subspecialtyId: { in: [...rights.subspecialtyIds] } };
}

function invalid(field: string, code: string): AppException {
  return new AppException('VALIDATION_FAILED', [{ field, code }]);
}

/** "2026-10". */
function monthText(month: Date): string {
  return month.toISOString().slice(0, 7);
}

async function addHistory(
  tx: Prisma.TransactionClient,
  entryId: string,
  action: string,
  fromStatus: EntryRow['status'] | null,
  toStatus: EntryRow['status'],
  actorUserId: string,
  comment?: string,
): Promise<void> {
  await tx.journalClubHistory.create({
    data: {
      id: uuidv7(),
      entryId,
      action,
      fromStatus,
      toStatus,
      actorUserId,
      comment: comment?.trim() || null,
    },
  });
}

function summaryView(row: EntryRow) {
  return {
    id: row.id,
    month: monthText(row.month),
    locale: (row.locale === 'en' ? 'en' : 'he') as 'he' | 'en',
    articleTitle: row.articleTitle,
    articleAuthors: row.articleAuthors,
    journal: row.journal,
    year: row.year,
    doi: row.doi,
    pmid: row.pmid,
    subspecialty: row.subspecialty,
    excerpt:
      row.summary.length > EXCERPT ? `${row.summary.slice(0, EXCERPT).trimEnd()}…` : row.summary,
    archived: row.status === 'ARCHIVED',
  };
}

function authorView(row: AuthorRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.profile?.firstName ?? '',
    lastName: row.profile?.lastName ?? '',
    mark: markOf(row.verifiedAs),
    hospital: row.profile?.hospital ?? null,
  };
}

function adminPerson(row: AuthorRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.profile?.firstName ?? '',
    lastName: row.profile?.lastName ?? '',
    email: row.email,
  };
}

function adminView(row: EntryRow, readerId: string): JournalClubAdminEntryDto {
  return {
    id: row.id,
    subspecialty: row.subspecialty,
    month: monthText(row.month),
    locale: row.locale === 'en' ? 'en' : 'he',
    articleTitle: row.articleTitle,
    articleAuthors: row.articleAuthors,
    journal: row.journal,
    year: row.year,
    doi: row.doi,
    pmid: row.pmid,
    summary: row.summary,
    summaryAuthor: adminPerson(row.summaryAuthor),
    commentary: row.commentary,
    commentaryAuthor: adminPerson(row.commentaryAuthor),
    keyPoints: row.keyPoints,
    status: row.status,
    ownSubmission: row.status === 'IN_REVIEW' && row.submittedBy === readerId,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    postId: row.postId,
    updatedAt: row.updatedAt.toISOString(),
  };
}
