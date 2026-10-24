import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, getMessages, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
import { fileTypeFromBuffer } from 'file-type';
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
import { type FileView, FilesService } from '../files';
import { ImagingService } from '../imaging';
import { Notifier } from '../notifications';
import {
  type CaseDto,
  type CaseHistoryDto,
  type CaseInputDto,
  type CaseListDto,
  type CaseListQueryDto,
  type CasePollDto,
  type CaseQueueDto,
  type CaseReviewInputDto,
  type MyCasesDto,
} from './cases.dto';
import {
  type CaseStatus,
  EDITABLE,
  MAX_OPEN_CASES,
  type ReviewAction,
  VISIBLE,
  planReview,
} from './case-rules';

const PAGE_SIZE = 12;
const NAME_REF = { id: true, nameHe: true, nameEn: true } as const;

const AUTHOR = {
  id: true,
  verifiedAs: true,
  profile: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;

const CASE_INCLUDE = {
  subspecialty: { select: { ...NAME_REF, key: true } },
  author: { select: AUTHOR },
  files: { orderBy: { position: 'asc' }, select: { fileId: true } },
  options: { orderBy: { position: 'asc' }, select: { id: true, text: true } },
  post: {
    select: {
      id: true,
      removedAt: true,
      commentCount: true,
      community: { select: { slug: true } },
    },
  },
} satisfies Prisma.ClinicalCaseInclude;

type CaseRow = Prisma.ClinicalCaseGetPayload<{ include: typeof CASE_INCLUDE }>;
type Template = 'caseApproved' | 'caseReturned' | 'caseWaiting' | 'caseReported';

/** Where a reader reviews cases: every subspecialty (platform moderators), or their communities'. */
interface Reviewing {
  all: boolean;
  subspecialtyIds: Set<string>;
}

/**
 * Case discussions (M26 plan; owner answers §10). A verified person writes a made-up or
 * de-identified case in a fixed form, checked for patient details; nobody else sees it until a
 * reviewer of its subspecialty (the community's moderators, or the platform's chat moderators)
 * approves it. Approval opens its discussion as a post in the subspecialty's community. A report
 * hides it at once, for the reviewers to restore or remove. Every step is in its history and the
 * audit log.
 */
@Injectable()
export class CasesService implements OnModuleInit {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly imaging: ImagingService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
  ) {}

  /** A case's pictures and scans are for whoever may read the case, and nobody else. */
  onModuleInit(): void {
    this.imaging.registerReadRule({
      canRead: async (place, principal) => {
        if (!place.caseId) return null;
        if (!principal) return false;
        const row = await this.prisma.clinicalCase.findUnique({
          where: { id: place.caseId },
          select: { authorId: true, status: true, subspecialtyId: true },
        });
        return row ? this.mayRead(principal, row) : false;
      },
    });
    this.files.registerReadRule({
      canRead: async (fileId, principal) => {
        const used = await this.prisma.caseFile.findUnique({
          where: { fileId },
          select: { case: { select: { authorId: true, status: true, subspecialtyId: true } } },
        });
        if (!used) return null;
        if (!principal) return false;
        return this.mayRead(principal, used.case);
      },
    });
  }

  // --- Reading ----------------------------------------------------------------------------------

  async list(principal: Principal, query: CaseListQueryDto): Promise<CaseListDto> {
    ensureVerified(principal);
    const where: Prisma.ClinicalCaseWhereInput = {
      status: 'PUBLISHED',
      ...(query.subspecialty ? { subspecialty: { key: query.subspecialty } } : {}),
    };
    const [rows, total, week, reviewing] = await Promise.all([
      this.prisma.clinicalCase.findMany({
        where,
        include: CASE_INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.clinicalCase.count({ where }),
      this.prisma.clinicalCase.findFirst({
        where: { status: 'PUBLISHED', weekAt: { not: null } },
        include: CASE_INCLUDE,
        orderBy: { weekAt: 'desc' },
      }),
      this.reviewing(principal),
    ]);
    return {
      items: rows.map(summary),
      week: week ? summary(week) : null,
      reviewer: reviewing.all || reviewing.subspecialtyIds.size > 0,
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
    };
  }

  async mine(principal: Principal): Promise<MyCasesDto> {
    ensureVerified(principal);
    const rows = await this.prisma.clinicalCase.findMany({
      where: { authorId: principal.userId },
      include: CASE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return { items: rows.map((row) => ({ ...summary(row), reviewNote: row.reviewNote })) };
  }

  async get(principal: Principal, id: string): Promise<CaseDto> {
    ensureVerified(principal);
    const row = await this.readable(principal, id);
    const reviewing = await this.reviewing(principal);
    const canReview = covers(reviewing, row.subspecialtyId);
    const mine = row.authorId === principal.userId;
    const [poll, reports, week, scans] = await Promise.all([
      this.poll(row, principal.userId),
      canReview
        ? this.prisma.caseReport.findMany({
            where: { caseId: id, closedAt: null },
            orderBy: { createdAt: 'asc' },
            select: { reason: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.prisma.clinicalCase.findFirst({
        where: { status: 'PUBLISHED', weekAt: { not: null } },
        orderBy: { weekAt: 'desc' },
        select: { id: true },
      }),
      this.imaging.listFor({ caseId: id }),
    ]);
    return {
      ...summary(row),
      history: row.history,
      examination: row.examination,
      labs: row.labs,
      imaging: row.imaging,
      pathology: row.pathology,
      management: row.management,
      fileIds: row.files.map((f) => f.fileId),
      scans,
      poll,
      discussion:
        row.status === 'PUBLISHED' && row.post && !row.post.removedAt
          ? { communitySlug: row.post.community.slug, postId: row.post.id }
          : null,
      week: week?.id === row.id,
      reviewNote: mine || canReview ? row.reviewNote : null,
      mine,
      canEdit: mine && EDITABLE.includes(row.status),
      canReview,
      reports: reports.map((r) => ({ reason: r.reason, createdAt: r.createdAt.toISOString() })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // --- Writing ----------------------------------------------------------------------------------

  async create(principal: Principal, input: CaseInputDto, meta: RequestMeta): Promise<CaseDto> {
    ensureVerified(principal);
    const open = await this.prisma.clinicalCase.count({
      where: { authorId: principal.userId, status: { in: ['DRAFT', 'IN_REVIEW', 'RETURNED'] } },
    });
    if (open >= MAX_OPEN_CASES) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'casesTooMany' }]);
    }
    await this.check(input);
    const fileIds = await this.checkFiles(principal, input.fileIds, null);
    const scanIds = await this.imaging.checkAttachable(principal.userId, input.scanIds, {});
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalCase.create({
        data: { id, authorId: principal.userId, ...fields(input) },
      });
      await this.writeParts(tx, id, input, fileIds);
      await this.imaging.attach(tx, { caseId: id }, scanIds);
      await addHistory(tx, id, 'create', null, 'DRAFT', principal.userId);
    });
    for (const fileId of fileIds) await this.files.markAttached(fileId);
    await this.record('cases.create', id, principal, meta);
    return this.get(principal, id);
  }

  async update(
    principal: Principal,
    id: string,
    input: CaseInputDto,
    meta: RequestMeta,
  ): Promise<CaseDto> {
    const row = await this.own(principal, id);
    if (!EDITABLE.includes(row.status)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'caseNotEditable' }]);
    }
    await this.check(input);
    const fileIds = await this.checkFiles(principal, input.fileIds, id);
    const scanIds = await this.imaging.checkAttachable(principal.userId, input.scanIds, {
      caseId: id,
    });
    const before = row.files.map((f) => f.fileId);
    const droppedScans = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.clinicalCase.updateMany({
        where: { id, status: row.status },
        data: fields(input),
      });
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'caseChanged' }]);
      await tx.caseFile.deleteMany({ where: { caseId: id } });
      await tx.casePollOption.deleteMany({ where: { caseId: id } });
      await this.writeParts(tx, id, input, fileIds);
      return this.imaging.attach(tx, { caseId: id }, scanIds);
    });
    for (const fileId of fileIds) await this.files.markAttached(fileId);
    // Pictures and scans taken out of the case are deleted.
    for (const fileId of before.filter((f) => !fileIds.includes(f)))
      await this.files.remove(fileId);
    await this.imaging.deleteMany(droppedScans);
    await this.record('cases.update', id, principal, meta);
    return this.get(principal, id);
  }

  /** Sends a draft or a returned case for review. */
  async submit(principal: Principal, id: string, meta: RequestMeta): Promise<CaseDto> {
    const row = await this.own(principal, id);
    if (!EDITABLE.includes(row.status)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'caseNotEditable' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.clinicalCase.updateMany({
        where: { id, status: row.status },
        data: { status: 'IN_REVIEW', submittedAt: new Date() },
      });
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'caseChanged' }]);
      await addHistory(tx, id, 'submit', row.status, 'IN_REVIEW', principal.userId);
    });
    await this.record('cases.submit', id, principal, meta);
    await this.tellReviewers(row, 'caseWaiting');
    return this.get(principal, id);
  }

  /**
   * The author deletes their case, with its pictures and scans; its discussion post is taken down
   * too.
   */
  async remove(principal: Principal, id: string, meta: RequestMeta): Promise<void> {
    const row = await this.own(principal, id);
    await this.imaging.deleteFor({ caseId: id });
    await this.prisma.$transaction(async (tx) => {
      if (row.postId) {
        await tx.post.updateMany({
          where: { id: row.postId, removedAt: null },
          data: { removedAt: new Date(), removedBy: principal.userId, body: '', title: '—' },
        });
      }
      await tx.clinicalCase.delete({ where: { id } });
    });
    for (const file of row.files) await this.files.remove(file.fileId);
    await this.record('cases.delete', id, principal, meta);
  }

  /** A picture for a case: JPEG or PNG only, confirmed by its author, stripped on upload. */
  async uploadPicture(
    principal: Principal,
    input: { buffer: Buffer; originalname: string } | undefined,
    meta: RequestMeta,
  ): Promise<FileView> {
    ensureVerified(principal);
    if (!input) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'fileMissing' }]);
    }
    const type = await fileTypeFromBuffer(input.buffer);
    if (type?.mime !== 'image/jpeg' && type?.mime !== 'image/png') {
      throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'casePictureType' }]);
    }
    return this.files.upload(input, 'CASE', principal.userId, meta);
  }

  // --- Poll and reports -------------------------------------------------------------------------

  async vote(principal: Principal, id: string, optionId: string): Promise<CasePollDto> {
    ensureVerified(principal);
    const row = await this.readable(principal, id);
    if (row.status !== 'PUBLISHED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'casePollClosed' }]);
    }
    if (!row.options.some((option) => option.id === optionId)) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'optionId', code: 'caseOptionUnknown' },
      ]);
    }
    await this.prisma.caseVote.upsert({
      where: { caseId_userId: { caseId: id, userId: principal.userId } },
      create: { caseId: id, userId: principal.userId, optionId },
      update: { optionId },
    });
    return (await this.poll(row, principal.userId))!;
  }

  /** A report hides a published case at once, for its reviewers to restore or remove. */
  async report(principal: Principal, id: string, reason: string, meta: RequestMeta) {
    ensureVerified(principal);
    const row = await this.readable(principal, id);
    if (row.status !== 'PUBLISHED' && row.status !== 'HIDDEN') throw new AppException('NOT_FOUND');
    if (row.authorId === principal.userId) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'caseOwnReport' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.caseReport.create({
        data: { id: uuidv7(), caseId: id, reporterId: principal.userId, reason },
      });
      if (row.status === 'PUBLISHED') {
        await tx.clinicalCase.update({ where: { id }, data: { status: 'HIDDEN' } });
        await addHistory(tx, id, 'report', 'PUBLISHED', 'HIDDEN', principal.userId);
      }
    });
    await this.record('cases.report', id, principal, meta);
    if (row.status === 'PUBLISHED') await this.tellReviewers(row, 'caseReported');
  }

  // --- Review -----------------------------------------------------------------------------------

  /** Cases waiting for the reader's review, and reported ones, oldest first. */
  async queue(principal: Principal): Promise<CaseQueueDto> {
    ensureVerified(principal);
    const reviewing = await this.reviewing(principal);
    if (!reviewing.all && reviewing.subspecialtyIds.size === 0) throw new AppException('FORBIDDEN');
    const rows = await this.prisma.clinicalCase.findMany({
      where: {
        status: { in: ['IN_REVIEW', 'HIDDEN'] },
        ...(reviewing.all ? {} : { subspecialtyId: { in: [...reviewing.subspecialtyIds] } }),
      },
      include: {
        ...CASE_INCLUDE,
        reports: { where: { closedAt: null }, select: { createdAt: true } },
      },
    });
    const items = rows.map((row) => {
      const firstReport = row.reports.map((r) => r.createdAt).sort((a, b) => +a - +b)[0];
      const since = row.status === 'HIDDEN' ? firstReport : row.submittedAt;
      return {
        ...summary(row),
        waitingSince: (since ?? row.updatedAt).toISOString(),
        openReports: row.reports.length,
      };
    });
    items.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
    return { items };
  }

  async review(
    principal: Principal,
    id: string,
    input: CaseReviewInputDto,
    meta: RequestMeta,
  ): Promise<CaseDto> {
    ensureVerified(principal);
    const row = await this.readable(principal, id);
    const reviewing = await this.reviewing(principal);
    const action = input.action as ReviewAction;
    const plan = planReview(action, {
      status: row.status,
      isAuthor: row.authorId === principal.userId,
      canReview: covers(reviewing, row.subspecialtyId),
      ...(input.note ? { note: input.note } : {}),
    });
    if (!plan.ok) throw new AppException(plan.error, [{ code: plan.code }]);
    const community =
      action === 'APPROVE' && !row.postId ? await this.community(row.subspecialtyId) : null;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ClinicalCaseUpdateManyMutationInput = { status: plan.to };
      if (action === 'WEEK') data.weekAt = now;
      else {
        data.reviewedBy = principal.userId;
        data.reviewedAt = now;
        data.reviewNote = input.note?.trim() || null;
      }
      if (action === 'APPROVE') data.publishedAt = row.publishedAt ?? now;
      if (action === 'TAKE_BACK' || action === 'REMOVE') data.weekAt = null;
      const { count } = await tx.clinicalCase.updateMany({
        where: { id, status: row.status },
        data,
      });
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'caseChanged' }]);
      if (community) await this.openDiscussion(tx, row, community.id, now);
      if (action === 'REMOVE' && row.postId) {
        await tx.post.updateMany({
          where: { id: row.postId, removedAt: null },
          data: {
            removedAt: now,
            removedBy: principal.userId,
            removedReason: input.note?.trim() ?? null,
          },
        });
      }
      if (action === 'RESTORE' || action === 'REMOVE') {
        await tx.caseReport.updateMany({
          where: { caseId: id, closedAt: null },
          data: { closedAt: now },
        });
      }
      await addHistory(
        tx,
        id,
        action.toLowerCase(),
        row.status,
        plan.to,
        principal.userId,
        input.note,
      );
    });
    await this.record('cases.review', id, principal, meta, {
      action,
      from: row.status,
      to: plan.to,
    });
    if (action === 'APPROVE') await this.tellAuthor(row, 'caseApproved');
    if (action === 'RETURN' || action === 'TAKE_BACK' || action === 'REMOVE') {
      await this.tellAuthor(row, 'caseReturned', input.note);
    }
    return this.get(principal, id);
  }

  async history(principal: Principal, id: string): Promise<CaseHistoryDto> {
    ensureVerified(principal);
    const row = await this.readable(principal, id);
    const reviewing = await this.reviewing(principal);
    if (row.authorId !== principal.userId && !covers(reviewing, row.subspecialtyId)) {
      throw new AppException('NOT_FOUND');
    }
    const rows = await this.prisma.caseHistory.findMany({
      where: { caseId: id },
      orderBy: { at: 'asc' },
    });
    const people = new Map(
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
        actor: (r.actorUserId && people.get(r.actorUserId)) || null,
        note: r.note,
        at: r.at.toISOString(),
      })),
    };
  }

  // --- internals --------------------------------------------------------------------------------

  /** Where the reader reviews: platform moderators everywhere; community moderators in theirs. */
  private async reviewing(principal: Principal): Promise<Reviewing> {
    if (principal.permissions.has('chat.moderate')) {
      return { all: true, subspecialtyIds: new Set() };
    }
    if (!principal.verified) return { all: false, subspecialtyIds: new Set() };
    const rows = await this.prisma.communityModerator.findMany({
      where: { userId: principal.userId, community: { archivedAt: null } },
      select: { community: { select: { subspecialtyId: true } } },
    });
    return {
      all: false,
      subspecialtyIds: new Set(
        rows.flatMap((r) => (r.community.subspecialtyId ? [r.community.subspecialtyId] : [])),
      ),
    };
  }

  private async mayRead(
    principal: Principal,
    row: { authorId: string | null; status: CaseStatus; subspecialtyId: string },
  ): Promise<boolean> {
    if (!principal.verified && !principal.permissions.has('chat.moderate')) return false;
    if (VISIBLE.includes(row.status)) return true;
    if (row.authorId === principal.userId && row.status !== 'REMOVED') return true;
    return covers(await this.reviewing(principal), row.subspecialtyId);
  }

  /** A case the reader may read; any other reads as "not found". */
  private async readable(principal: Principal, id: string): Promise<CaseRow> {
    const row = await this.prisma.clinicalCase.findUnique({ where: { id }, include: CASE_INCLUDE });
    if (!row || !(await this.mayRead(principal, row))) throw new AppException('NOT_FOUND');
    return row;
  }

  /** The reader's own case. */
  private async own(principal: Principal, id: string): Promise<CaseRow> {
    ensureVerified(principal);
    const row = await this.prisma.clinicalCase.findFirst({
      where: { id, authorId: principal.userId, status: { not: 'REMOVED' } },
      include: CASE_INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  /** The subspecialty exists, and nothing in the text looks like a patient's details. */
  private async check(input: CaseInputDto): Promise<void> {
    const found = await this.prisma.subspecialty.count({ where: { id: input.subspecialtyId } });
    if (!found) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'subspecialtyId', code: 'unknownSubspecialty' },
      ]);
    }
    refusePatientDetails({
      title: input.title,
      history: input.history,
      examination: input.examination ?? undefined,
      labs: input.labs ?? undefined,
      imaging: input.imaging ?? undefined,
      pathology: input.pathology ?? undefined,
      management: input.management ?? undefined,
      question: input.question,
      pollOptions: input.pollOptions.join('\n'),
    });
  }

  /** Pictures the author uploaded for cases, not yet used elsewhere (or already this case's). */
  private async checkFiles(
    principal: Principal,
    fileIds: readonly string[],
    caseId: string | null,
  ): Promise<string[]> {
    const ids = [...new Set(fileIds)];
    if (ids.length === 0) return [];
    const found = await this.prisma.storedFile.findMany({
      where: {
        id: { in: ids },
        ownerUserId: principal.userId,
        purpose: 'CASE',
        kind: 'IMAGE',
        OR: [{ attachedAt: null }, ...(caseId ? [{ caseFile: { caseId } }] : [])],
      },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'fileIds', code: 'unknownFile' }]);
    }
    return ids;
  }

  private async writeParts(
    tx: Prisma.TransactionClient,
    caseId: string,
    input: CaseInputDto,
    fileIds: string[],
  ): Promise<void> {
    if (fileIds.length > 0) {
      await tx.caseFile.createMany({
        data: fileIds.map((fileId, position) => ({ caseId, fileId, position })),
      });
    }
    if (input.pollOptions.length >= 2) {
      await tx.casePollOption.createMany({
        data: input.pollOptions.map((text, i) => ({
          id: uuidv7(),
          caseId,
          position: i + 1,
          text,
        })),
      });
    }
  }

  private async poll(row: CaseRow, userId: string): Promise<CasePollDto | null> {
    if (row.options.length === 0) return null;
    const mine = await this.prisma.caseVote.findUnique({
      where: { caseId_userId: { caseId: row.id, userId } },
      select: { optionId: true },
    });
    const groups = await this.prisma.caseVote.groupBy({
      by: ['optionId'],
      where: { caseId: row.id },
      _count: { _all: true },
    });
    const total = groups.reduce((sum, g) => sum + g._count._all, 0);
    // Totals after answering, or once the case no longer takes answers.
    const shows = mine !== null || row.status !== 'PUBLISHED';
    return {
      options: row.options,
      open: row.status === 'PUBLISHED',
      mine: mine?.optionId ?? null,
      totals: shows
        ? Object.fromEntries(
            row.options.map((o) => [
              o.id,
              groups.find((g) => g.optionId === o.id)?._count._all ?? 0,
            ]),
          )
        : null,
      total: shows ? total : 0,
    };
  }

  private async community(subspecialtyId: string) {
    const community = await this.prisma.community.findFirst({
      where: { subspecialtyId, archivedAt: null },
      select: { id: true },
    });
    if (!community) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'caseNoCommunity' }]);
    }
    return community;
  }

  /**
   * The case's discussion (owner answer §10.4): a post in the subspecialty's community, under its
   * author, in the author's language, with the question and a link back to the case.
   */
  private async openDiscussion(
    tx: Prisma.TransactionClient,
    row: CaseRow,
    communityId: string,
    now: Date,
  ): Promise<void> {
    const author = row.authorId
      ? await tx.user.findUnique({ where: { id: row.authorId }, select: { locale: true } })
      : null;
    const locale: Locale = author && isLocale(author.locale) ? author.locale : DEFAULT_LOCALE;
    const texts = getMessages(locale).cases.discussion;
    const link = new URL(`/${locale}/cases/${row.id}`, this.env.APP_BASE_URL).toString();
    const postId = uuidv7();
    await tx.post.create({
      data: {
        id: postId,
        communityId,
        authorId: row.authorId,
        kind: 'QUESTION',
        title: texts.title.replace('{title}', row.title).slice(0, 200),
        body: `${texts.intro}\n\n${row.question}\n\n${texts.link.replace('{link}', link)}`,
        activityAt: now,
        createdAt: now,
        ...(row.authorId ? { follows: { create: { userId: row.authorId } } } : {}),
      },
    });
    await tx.clinicalCase.update({ where: { id: row.id }, data: { postId } });
  }

  private async tellAuthor(row: CaseRow, template: Template, reason = ''): Promise<void> {
    if (!row.authorId) return;
    await this.tell(row.authorId, row, template, reason);
  }

  /** The community's moderators of the case's subspecialty. */
  private async tellReviewers(row: CaseRow, template: Template): Promise<void> {
    const moderators = await this.prisma.communityModerator.findMany({
      where: { community: { subspecialtyId: row.subspecialtyId, archivedAt: null } },
      select: { userId: true },
    });
    for (const { userId } of moderators) {
      if (userId !== row.authorId) await this.tell(userId, row, template);
    }
  }

  private async tell(userId: string, row: CaseRow, template: Template, reason = '') {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, locale: true },
      });
      if (!user) return;
      const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
      const path =
        template === 'caseWaiting' || template === 'caseReported'
          ? `/${locale}/cases/review`
          : `/${locale}/cases/${row.id}`;
      const link = new URL(path, this.env.APP_BASE_URL).toString();
      const base = { userId: user.id, kind: 'CASES' as const, to: user.email, locale };
      if (template === 'caseReturned') {
        await this.notifier.send({ ...base, template, params: { title: row.title, reason, link } });
      } else {
        await this.notifier.send({ ...base, template, params: { title: row.title, link } });
      }
    } catch (error) {
      this.logger.warn({ err: error, caseId: row.id, template }, 'Case notice failed');
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
      entityType: 'case',
      entityId: id,
      ...(changes ? { changes } : {}),
    });
  }
}

function ensureVerified(principal: Principal): void {
  if (!principal.verified && !principal.permissions.has('chat.moderate')) {
    throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
  }
}

function covers(reviewing: Reviewing, subspecialtyId: string): boolean {
  return reviewing.all || reviewing.subspecialtyIds.has(subspecialtyId);
}

function fields(input: CaseInputDto) {
  return {
    subspecialtyId: input.subspecialtyId,
    title: input.title,
    ageRange: input.ageRange,
    sex: input.sex,
    history: input.history,
    examination: input.examination || null,
    labs: input.labs || null,
    imaging: input.imaging || null,
    pathology: input.pathology || null,
    management: input.management || null,
    question: input.question,
  };
}

async function addHistory(
  tx: Prisma.TransactionClient,
  caseId: string,
  action: string,
  fromStatus: CaseStatus | null,
  toStatus: CaseStatus,
  actorUserId: string,
  note?: string,
): Promise<void> {
  await tx.caseHistory.create({
    data: {
      id: uuidv7(),
      caseId,
      action,
      fromStatus,
      toStatus,
      actorUserId,
      note: note?.trim() || null,
    },
  });
}

function summary(row: CaseRow) {
  const author = row.author;
  return {
    id: row.id,
    title: row.title,
    subspecialty: row.subspecialty,
    ageRange: row.ageRange,
    sex: row.sex,
    question: row.question,
    author: author
      ? {
          id: author.id,
          firstName: author.profile?.firstName ?? '',
          lastName: author.profile?.lastName ?? '',
          mark: markOf(author.verifiedAs),
        }
      : null,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    pictures: row.files.length,
    comments: row.post && !row.post.removedAt ? row.post.commentCount : 0,
  };
}
