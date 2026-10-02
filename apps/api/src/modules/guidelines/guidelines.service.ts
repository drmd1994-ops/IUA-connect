import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ContentAnnouncer } from '../notifications';
import { AccessService } from '../access';
import { AuditService } from '../audit';
import {
  type AdminGuidelineDto,
  type AdminGuidelineListDto,
  type AdminGuidelineListQueryDto,
  type CreateGuidelineDto,
  type GuidelineVersionInputDto,
  type PublicGuidelineDto,
  type PublicGuidelineListDto,
  type PublicGuidelineQueryDto,
  type UpdateGuidelineDto,
} from './guidelines.dto';

const INCLUDE = {
  translations: true,
  subspecialty: true,
  versions: { orderBy: [{ publishedOn: 'desc' }, { createdAt: 'desc' }] },
} satisfies Prisma.GuidelineInclude;

type Row = Prisma.GuidelineGetPayload<{ include: typeof INCLUDE }>;
type Locale = 'he' | 'en';
export interface GuidelineActor {
  userId: string;
  meta: RequestMeta;
}

/**
 * Guidelines (M3 plan §2.6): metadata, the official link, a version history and an optional
 * IUA-written summary. Third-party documents are never copied (spec §14). Public reads follow
 * the access tiers: hidden guidelines are left out of lists and answer 404 by link.
 */
@Injectable()
export class GuidelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly announcer: ContentAnnouncer,
  ) {}

  // --- Admin --------------------------------------------------------------------------------

  async adminList(query: AdminGuidelineListQueryDto): Promise<AdminGuidelineListDto> {
    const where: Prisma.GuidelineWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { sourceOrg: { contains: query.q, mode: 'insensitive' } },
              { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.guideline.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.guideline.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        sourceOrg: row.sourceOrg,
        titleHe: row.translations.find((t) => t.locale === 'he')?.title ?? null,
        titleEn: row.translations.find((t) => t.locale === 'en')?.title ?? null,
        status: row.status,
        accessTier: row.accessTier,
        version: row.versions[0]?.version ?? null,
        publishedOn: row.versions[0] ? isoDate(row.versions[0].publishedOn) : null,
        yearOnly: row.versions[0]?.yearOnly ?? false,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async adminGet(id: string): Promise<AdminGuidelineDto> {
    const row = await this.prisma.guideline.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    const text = (locale: Locale) => {
      const t = row.translations.find((item) => item.locale === locale);
      return t ? { title: t.title, summary: t.summary } : undefined;
    };
    return {
      id: row.id,
      sourceOrg: row.sourceOrg,
      officialUrl: row.officialUrl,
      evidenceLevel: row.evidenceLevel,
      status: row.status,
      subspecialtyId: row.subspecialtyId,
      accessTier: row.accessTier,
      typeIds: await this.access.allowedTypes('guideline', id),
      translations: { he: text('he'), en: text('en') },
      versions: row.versions.map(versionView),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(input: CreateGuidelineDto, actor: GuidelineActor): Promise<AdminGuidelineDto> {
    await this.validate(input);
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.guideline.create({
        data: {
          id,
          ...columns(input),
          translations: { create: translations(input) },
          versions: { create: { id: uuidv7(), ...versionColumns(input.version) } },
        },
      });
      await this.access.setRules(tx, 'guideline', id, input.accessTier, input.typeIds);
    });
    await this.record('guideline.create', id, actor);
    if (input.status === 'CURRENT') {
      await this.announcer.announce({
        entityType: 'guideline',
        entityId: id,
        kind: 'GUIDELINES',
        type: 'contentGuideline',
        translations: translations(input),
        link: `/guidelines/${id}`,
        accessTier: input.accessTier,
      });
    }
    return this.adminGet(id);
  }

  async update(
    id: string,
    input: UpdateGuidelineDto,
    actor: GuidelineActor,
  ): Promise<AdminGuidelineDto> {
    const found = await this.prisma.guideline.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!found) throw new AppException('NOT_FOUND');
    await this.validate(input);
    await this.prisma.$transaction(async (tx) => {
      await tx.guidelineTranslation.deleteMany({ where: { guidelineId: id } });
      await tx.guideline.update({
        where: { id },
        data: { ...columns(input), translations: { create: translations(input) } },
      });
      await this.access.setRules(tx, 'guideline', id, input.accessTier, input.typeIds);
    });
    await this.record('guideline.update', id, actor, { from: found.status, to: input.status });
    return this.adminGet(id);
  }

  async remove(id: string, actor: GuidelineActor): Promise<void> {
    const found = await this.prisma.guideline.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new AppException('NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await this.access.setRules(tx, 'guideline', id, 'PUBLIC', []);
      await tx.guideline.delete({ where: { id } });
    });
    await this.record('guideline.delete', id, actor);
  }

  async addVersion(
    id: string,
    input: GuidelineVersionInputDto,
    actor: GuidelineActor,
  ): Promise<AdminGuidelineDto> {
    const found = await this.prisma.guideline.findUnique({
      where: { id },
      select: { status: true, accessTier: true, translations: true },
    });
    if (!found) throw new AppException('NOT_FOUND');
    const versionId = uuidv7();
    try {
      await this.prisma.$transaction([
        this.prisma.guidelineVersion.create({
          data: { id: versionId, guidelineId: id, ...versionColumns(input) },
        }),
        // Touch the guideline so lists ordered by last change show it first.
        this.prisma.guideline.update({ where: { id }, data: { updatedAt: new Date() } }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'version', code: 'guidelineVersionTaken' }]);
      }
      throw error;
    }
    await this.record('guideline.version.add', id, actor, { version: input.version });
    if (found.status === 'CURRENT') {
      await this.announcer.announce({
        entityType: 'guideline_version',
        entityId: versionId,
        kind: 'GUIDELINES',
        type: 'contentGuidelineVersion',
        translations: found.translations,
        link: `/guidelines/${id}`,
        accessTier: found.accessTier,
        rules: { entity: 'guideline', id },
      });
    }
    return this.adminGet(id);
  }

  async removeVersion(
    id: string,
    versionId: string,
    actor: GuidelineActor,
  ): Promise<AdminGuidelineDto> {
    const versions = await this.prisma.guidelineVersion.findMany({
      where: { guidelineId: id },
      select: { id: true, version: true },
    });
    const target = versions.find((v) => v.id === versionId);
    if (!target) throw new AppException('NOT_FOUND');
    if (versions.length === 1) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'guidelineLastVersion' }]);
    }
    await this.prisma.guidelineVersion.delete({ where: { id: versionId } });
    await this.record('guideline.version.remove', id, actor, { version: target.version });
    return this.adminGet(id);
  }

  // --- Public -------------------------------------------------------------------------------

  async list(
    principal: Principal | null,
    query: PublicGuidelineQueryDto,
  ): Promise<PublicGuidelineListDto> {
    const viewer = await this.access.viewerOf(principal);
    const where: Prisma.GuidelineWhereInput = {
      AND: [await this.access.visibleWhere('guideline', viewer)],
      ...(query.status ? { status: query.status } : {}),
      ...(query.subspecialty ? { subspecialty: { key: query.subspecialty } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.guideline.findMany({
        where,
        include: INCLUDE,
        // Current guidelines first (the enum's order), then the most recently added.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.guideline.count({ where }),
    ]);
    return {
      items: rows.map((row) => summary(row, query.locale)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(principal: Principal | null, id: string, locale: Locale): Promise<PublicGuidelineDto> {
    const row = await this.prisma.guideline.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    const viewer = await this.access.viewerOf(principal);
    if (!(await this.access.canSeeItem('guideline', row, viewer))) {
      throw new AppException('NOT_FOUND');
    }
    return { ...summary(row, locale), versions: row.versions.map(versionView) };
  }

  // --- Helpers ------------------------------------------------------------------------------

  private async validate(input: UpdateGuidelineDto): Promise<void> {
    if (input.subspecialtyId) {
      const found = await this.prisma.subspecialty.findFirst({
        where: { id: input.subspecialtyId, active: true },
        select: { id: true },
      });
      if (!found) throw invalid('subspecialtyId', 'unknownSubspecialty');
    }
    if (input.accessTier === 'TYPES') {
      const count = await this.prisma.membershipType.count({
        where: { id: { in: input.typeIds } },
      });
      if (count !== new Set(input.typeIds).size) throw invalid('typeIds', 'unknownMembershipType');
    }
  }

  private record(
    action: string,
    id: string,
    actor: GuidelineActor,
    changes?: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      correlationId: actor.meta.correlationId,
      actorUserId: actor.userId,
      actorIp: actor.meta.ip,
      entityType: 'guideline',
      entityId: id,
      ...(changes ? { changes } : {}),
    });
  }
}

function columns(input: UpdateGuidelineDto) {
  return {
    sourceOrg: input.sourceOrg,
    officialUrl: input.officialUrl,
    evidenceLevel: input.evidenceLevel || null,
    status: input.status,
    subspecialtyId: input.subspecialtyId ?? null,
    accessTier: input.accessTier,
  };
}

function translations(input: UpdateGuidelineDto) {
  return (['he', 'en'] as const).flatMap((locale) => {
    const text = input.translations[locale];
    return text ? [{ locale, title: text.title, summary: text.summary || null }] : [];
  });
}

function versionColumns(input: GuidelineVersionInputDto) {
  return {
    version: input.version,
    publishedOn: new Date(`${input.publishedOn}T00:00:00.000Z`),
    yearOnly: input.yearOnly,
    url: input.url ?? null,
    licenseNote: input.licenseNote || null,
  };
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function versionView(version: Row['versions'][number]) {
  return {
    id: version.id,
    version: version.version,
    publishedOn: isoDate(version.publishedOn),
    yearOnly: version.yearOnly,
    url: version.url,
    licenseNote: version.licenseNote,
  };
}

/** The requested language, else Hebrew, else whatever exists. */
function summary(row: Row, locale: Locale) {
  const wanted = row.translations.find((t) => t.locale === locale);
  const text = wanted ?? row.translations.find((t) => t.locale === 'he') ?? row.translations[0]!;
  const latest = row.versions[0];
  return {
    id: row.id,
    title: text.title,
    summary: text.summary,
    sourceOrg: row.sourceOrg,
    officialUrl: row.officialUrl,
    evidenceLevel: row.evidenceLevel,
    status: row.status,
    subspecialty: row.subspecialty
      ? {
          key: row.subspecialty.key,
          nameHe: row.subspecialty.nameHe,
          nameEn: row.subspecialty.nameEn,
        }
      : null,
    version: latest?.version ?? null,
    publishedOn: latest ? isoDate(latest.publishedOn) : null,
    yearOnly: latest?.yearOnly ?? false,
    accessTier: row.accessTier,
    locale: text.locale as Locale,
    fallback: !wanted,
  };
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);
