import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { type PermissionKey, uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import {
  OWNER_PROBLEM_CODES,
  covers,
  ownedWhere,
  ownerOfNew,
  scopeOf,
  scopeOfAny,
} from '../../common/auth/scope';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { parseIfMatch, sanitizeMarkdown } from '../news';
import { ContentAnnouncer, Notifier } from '../notifications';
import { ORGANISATION_REF } from '../organisations';
import {
  type AdminPositionDto,
  type AdminPositionListDto,
  type AdminPositionListQueryDto,
  type PositionHistoryDto,
  type PositionInputDto,
  type PositionScopeDto,
  type PositionTransitionDto,
} from './positions.dto';
import {
  POSITION_INCLUDE,
  type PositionRow,
  commonView,
  dateOf,
  titles,
  translationsView,
} from './positions-view';
import { type PositionAction, planPositionTransition } from './positions-workflow';

type Tx = Prisma.TransactionClient;

/** Whoever holds one of these somewhere works on positions there. */
export const POSITION_STAFF = [
  'positions.manage',
  'positions.review',
  'positions.post.department',
] as const satisfies readonly PermissionKey[];

const DIRECTOR_ROLE = 'DEPARTMENT_DIRECTOR';

/** What the caller may do with positions, worked out once per request. */
interface Rights {
  principal: Principal;
  /** The departments they direct, when they may post for them. */
  departments: Set<string>;
}

/**
 * Writing and reviewing positions (M28 plan §2, owner answer §10.1). Platform and organisation
 * staff with `positions.manage` write for their owner; a department director writes the
 * platform's positions for the departments they direct. Someone with `positions.review` for the
 * owner publishes, never the person who submitted it. Every step goes into the position's
 * append-only history and the audit log. A position of an owner the caller does not work for
 * reads as "not found".
 */
@Injectable()
export class PositionsAdminService {
  private readonly logger = new Logger(PositionsAdminService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
    private readonly announcer: ContentAnnouncer,
  ) {}

  // --- Rights ---------------------------------------------------------------------------------

  private async rights(principal: Principal): Promise<Rights> {
    if (!principal.permissions.has('positions.post.department')) {
      return { principal, departments: new Set() };
    }
    const grants = await this.prisma.userRole.findMany({
      where: {
        userId: principal.userId,
        role: { key: DIRECTOR_ROLE },
        scopeType: 'DEPARTMENT',
        organisationId: null,
      },
      select: { scopeId: true },
    });
    return { principal, departments: new Set(grants.map((grant) => grant.scopeId!)) };
  }

  private canWrite(
    rights: Rights,
    row: { organisationId: string | null; departmentId: string | null },
  ) {
    if (covers(scopeOf(rights.principal, 'positions.manage'), row.organisationId)) return true;
    return (
      row.organisationId === null &&
      row.departmentId !== null &&
      rights.departments.has(row.departmentId)
    );
  }

  private canReview(rights: Rights, row: { organisationId: string | null }) {
    return covers(scopeOf(rights.principal, 'positions.review'), row.organisationId);
  }

  /** The positions the caller works on, as a database filter. */
  private visibleWhere(rights: Rights): Prisma.PositionWhereInput {
    const staff = scopeOfAny(rights.principal, ['positions.manage', 'positions.review']);
    return {
      OR: [
        ownedWhere(staff),
        ...(rights.departments.size
          ? [{ organisationId: null, departmentId: { in: [...rights.departments] } }]
          : []),
      ],
    };
  }

  async scope(principal: Principal): Promise<PositionScopeDto> {
    const rights = await this.rights(principal);
    const manage = scopeOf(principal, 'positions.manage');
    const review = scopeOf(principal, 'positions.review');
    const [organisations, departments] = await Promise.all([
      this.prisma.organisation.findMany({
        where: {
          active: true,
          ...(manage.everywhere ? {} : { id: { in: [...manage.organisationIds] } }),
        },
        select: ORGANISATION_REF,
        orderBy: { nameEn: 'asc' },
      }),
      this.prisma.department.findMany({
        where: { id: { in: [...rights.departments] } },
        select: {
          id: true,
          nameHe: true,
          nameEn: true,
          hospital: { select: { id: true, nameHe: true, nameEn: true } },
        },
        orderBy: { nameEn: 'asc' },
      }),
    ]);
    return {
      platform: manage.platform,
      organisations,
      departments,
      review: review.platform || review.everywhere || review.organisationIds.length > 0,
    };
  }

  // --- Reading --------------------------------------------------------------------------------

  async list(
    principal: Principal,
    query: AdminPositionListQueryDto,
  ): Promise<AdminPositionListDto> {
    const rights = await this.rights(principal);
    const where: Prisma.PositionWhereInput = {
      AND: [
        this.visibleWhere(rights),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.q
          ? [
              {
                translations: {
                  some: { title: { contains: query.q, mode: 'insensitive' as const } },
                },
              },
            ]
          : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.position.findMany({
        where,
        include: POSITION_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.position.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ...commonView(row),
        ...titles(row),
        status: row.status,
        submittedBy: row.submittedBy,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(principal: Principal, id: string): Promise<AdminPositionDto> {
    const rights = await this.rights(principal);
    return this.view(rights, await this.mine(rights, id));
  }

  async history(principal: Principal, id: string): Promise<PositionHistoryDto> {
    await this.mine(await this.rights(principal), id);
    const rows = await this.prisma.positionHistory.findMany({
      where: { positionId: id },
      orderBy: { at: 'asc' },
    });
    return {
      items: rows.map((row) => ({
        action: row.action,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        actorUserId: row.actorUserId,
        comment: row.comment,
        at: row.at.toISOString(),
      })),
    };
  }

  /** A position the caller works on, or "not found". */
  private async mine(rights: Rights, id: string): Promise<PositionRow> {
    const row = await this.prisma.position.findFirst({
      where: { AND: [{ id }, this.visibleWhere(rights)] },
      include: POSITION_INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  // --- Writing --------------------------------------------------------------------------------

  async create(
    input: PositionInputDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminPositionDto> {
    const rights = await this.rights(principal);
    const organisationId = this.ownerOfNew(rights, input);
    await this.validate(rights, input, organisationId);
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.position.create({
        data: {
          id,
          status: 'DRAFT',
          organisationId,
          authorUserId: principal.userId,
          ...fields(input),
        },
      });
      await replaceParts(tx, id, input);
      await addHistory(tx, id, 'create', null, 'DRAFT', principal.userId);
    });
    await this.record('positions.create', id, principal.userId, meta);
    return this.view(rights, await this.mine(rights, id));
  }

  /** Replaces a draft (If-Match must carry its current version). */
  async update(
    id: string,
    input: PositionInputDto,
    ifMatch: string | undefined,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminPositionDto> {
    const rights = await this.rights(principal);
    const row = await this.mine(rights, id);
    if (!this.canWrite(rights, row)) {
      throw new AppException('FORBIDDEN', [{ code: 'positionActionNotAllowed' }]);
    }
    if (input.organisationId !== undefined && input.organisationId !== row.organisationId) {
      throw invalid('organisationId', 'ownerCannotChange');
    }
    if (parseIfMatch(ifMatch) !== row.version) {
      throw new AppException('PRECONDITION_FAILED', [{ code: 'positionChanged' }]);
    }
    if (row.status !== 'DRAFT') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'positionNotEditable' }]);
    }
    await this.validate(rights, input, row.organisationId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.position.updateMany({
        where: { id, version: row.version, status: 'DRAFT' },
        data: { ...fields(input), version: { increment: 1 } },
      });
      if (count === 0) {
        throw new AppException('PRECONDITION_FAILED', [{ code: 'positionChanged' }]);
      }
      await replaceParts(tx, id, input);
    });
    await this.record('positions.update', id, principal.userId, meta);
    return this.view(rights, await this.mine(rights, id));
  }

  /** Deletes a draft that was never published. */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const rights = await this.rights(principal);
    const row = await this.mine(rights, id);
    if (!this.canWrite(rights, row)) {
      throw new AppException('FORBIDDEN', [{ code: 'positionActionNotAllowed' }]);
    }
    if (row.status !== 'DRAFT' || row.publishedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'positionNotDeletable' }]);
    }
    await this.prisma.position.delete({ where: { id } });
    await this.record('positions.delete', id, principal.userId, meta);
  }

  // --- Review ---------------------------------------------------------------------------------

  async transition(
    id: string,
    input: PositionTransitionDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminPositionDto> {
    const rights = await this.rights(principal);
    const row = await this.mine(rights, id);
    const action = input.action as PositionAction;
    const plan = planPositionTransition(action, {
      status: row.status,
      submittedBy: row.submittedBy,
      actorUserId: principal.userId,
      canWrite: this.canWrite(rights, row),
      canReview: this.canReview(rights, row),
      ...(input.comment ? { comment: input.comment } : {}),
    });
    if (!plan.ok) throw new AppException(plan.error, [{ code: plan.code }]);
    if (action === 'SUBMIT' && !row.translations.some((t) => t.title.trim())) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'positionTitleRequired' }]);
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.PositionUpdateManyMutationInput = {
        status: plan.to,
        version: { increment: 1 },
      };
      if (action === 'SUBMIT') data.submittedBy = principal.userId;
      if (action === 'SEND_BACK' || action === 'TAKE_BACK') data.submittedBy = null;
      if (action === 'PUBLISH') {
        data.reviewedBy = principal.userId;
        data.publishedAt = row.publishedAt ?? now;
      }
      if (action === 'ARCHIVE') data.archivedAt = now;
      const { count } = await tx.position.updateMany({ where: { id, status: row.status }, data });
      // Someone else moved it first.
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'positionChanged' }]);
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
    await this.audit.record({
      action: 'positions.transition',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'position',
      entityId: id,
      changes: { action, from: row.status, to: plan.to },
    });
    if (action === 'SEND_BACK') await this.notifyAuthor(row, 'positionSentBack', input.comment);
    if (action === 'PUBLISH') {
      await this.notifyAuthor(row, 'positionPublished');
      // Announced once: publishing again after a correction finds the announcement and is quiet.
      await this.announcer.announce({
        entityType: 'position',
        entityId: row.id,
        kind: 'POSITIONS',
        type: 'contentPosition',
        translations: row.translations,
        link: `/positions/${row.id}`,
        accessTier: 'PUBLIC',
        organisationId: row.organisationId,
      });
    }
    return this.view(rights, await this.mine(rights, id));
  }

  // --- internals ------------------------------------------------------------------------------

  /** The owner of a new position: see the input's `organisationId`. */
  private ownerOfNew(rights: Rights, input: PositionInputDto): string | null {
    const manage = scopeOf(rights.principal, 'positions.manage');
    const directsIt = input.departmentId !== null && rights.departments.has(input.departmentId);
    if (input.organisationId === null || input.organisationId === undefined) {
      // The platform's own: as its staff, or as the director of the position's department.
      if (manage.platform || directsIt) return null;
      // A director only, writing for a department they don't direct.
      if (rights.departments.size && !manage.everywhere && !manage.organisationIds.length) {
        throw invalid('departmentId', 'notYourDepartment');
      }
      if (input.organisationId === null) throw invalid('organisationId', 'unknownOrganisation');
    }
    const owner = ownerOfNew(manage, input.organisationId);
    if ('problem' in owner) {
      throw invalid('organisationId', OWNER_PROBLEM_CODES[owner.problem]);
    }
    return owner.organisationId;
  }

  private async validate(
    rights: Rights,
    input: PositionInputDto,
    organisationId: string | null,
  ): Promise<void> {
    // A director without the platform's own right writes only for their departments.
    const manage = scopeOf(rights.principal, 'positions.manage');
    if (
      !covers(manage, organisationId) &&
      !(input.departmentId !== null && rights.departments.has(input.departmentId))
    ) {
      throw invalid('departmentId', 'notYourDepartment');
    }
    if (input.hospitalId) {
      const hospital = await this.prisma.hospital.findFirst({
        where: { id: input.hospitalId, active: true },
        select: { id: true },
      });
      if (!hospital) throw invalid('hospitalId', 'unknownHospital');
    }
    if (input.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: input.departmentId, hospitalId: input.hospitalId ?? undefined, active: true },
        select: { id: true },
      });
      if (!department) throw invalid('departmentId', 'unknownDepartment');
    }
    const subspecialties = [...new Set(input.subspecialtyIds)];
    if (subspecialties.length) {
      const found = await this.prisma.subspecialty.count({
        where: { id: { in: subspecialties }, active: true },
      });
      if (found !== subspecialties.length) throw invalid('subspecialtyIds', 'unknownSubspecialty');
    }
  }

  private view(rights: Rights, row: PositionRow): AdminPositionDto {
    return {
      ...commonView(row),
      status: row.status,
      translations: translationsView(row),
      applyUrl: row.applyUrl,
      applyEmail: row.applyEmail,
      authorUserId: row.authorUserId,
      submittedBy: row.submittedBy,
      reviewedBy: row.reviewedBy,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      canWrite: this.canWrite(rights, row),
      canReview: this.canReview(rights, row),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private record(action: string, id: string, actorUserId: string, meta: RequestMeta) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId,
      actorIp: meta.ip,
      entityType: 'position',
      entityId: id,
    });
  }

  /** Tells the position's writer, in their language. A failed email never undoes the step. */
  private async notifyAuthor(
    row: PositionRow,
    template: 'positionSentBack' | 'positionPublished',
    reason = '',
  ): Promise<void> {
    if (!row.authorUserId) return;
    const author = await this.prisma.user.findUnique({ where: { id: row.authorUserId } });
    if (!author) return;
    const locale: Locale = isLocale(author.locale) ? author.locale : DEFAULT_LOCALE;
    const text =
      row.translations.find((t) => t.locale === locale) ??
      row.translations.find((t) => t.locale === 'he') ??
      row.translations[0];
    const path =
      template === 'positionSentBack'
        ? `/${locale}/admin/positions/${row.id}`
        : `/${locale}/positions/${row.id}`;
    const link = new URL(path, this.env.APP_BASE_URL).toString();
    const title = text?.title ?? '';
    try {
      if (template === 'positionSentBack') {
        await this.notifier.send({
          userId: author.id,
          kind: 'WORK',
          to: author.email,
          locale,
          template,
          params: { title, reason, link },
        });
      } else {
        await this.notifier.send({
          userId: author.id,
          kind: 'WORK',
          to: author.email,
          locale,
          template,
          params: { title, link },
        });
      }
    } catch (error) {
      this.logger.error({ err: error, positionId: row.id, template }, 'Position email failed');
    }
  }
}

function fields(input: PositionInputDto) {
  return {
    kind: input.kind,
    hospitalId: input.hospitalId,
    departmentId: input.departmentId,
    institutionName: input.institutionName,
    // A hospital from the list brings its own city.
    city: input.hospitalId ? null : input.city,
    country: input.hospitalId ? 'IL' : input.country,
    audience: input.audience,
    applyUrl: input.applyUrl,
    applyEmail: input.applyEmail,
    closesOn: dateOf(input.closesOn),
  };
}

/** Translations and subspecialties, replaced as a whole. */
async function replaceParts(tx: Tx, id: string, input: PositionInputDto): Promise<void> {
  await tx.positionTranslation.deleteMany({ where: { positionId: id } });
  for (const [locale, text] of Object.entries(input.translations)) {
    if (!text) continue;
    await tx.positionTranslation.create({
      data: { positionId: id, locale, title: text.title, body: sanitizeMarkdown(text.body) },
    });
  }
  await tx.positionSubspecialty.deleteMany({ where: { positionId: id } });
  await tx.positionSubspecialty.createMany({
    data: [...new Set(input.subspecialtyIds)].map((subspecialtyId) => ({
      positionId: id,
      subspecialtyId,
    })),
  });
}

function addHistory(
  tx: Tx,
  positionId: string,
  action: string,
  fromStatus: PositionRow['status'] | null,
  toStatus: PositionRow['status'],
  actorUserId: string,
  comment?: string,
) {
  return tx.positionHistory.create({
    data: {
      id: uuidv7(),
      positionId,
      action,
      fromStatus,
      toStatus,
      actorUserId,
      comment: comment || null,
    },
  });
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);
