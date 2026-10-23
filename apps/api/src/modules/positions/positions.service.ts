import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { todayInIsrael } from '../membership';
import {
  type PositionDto,
  type PositionListDto,
  type PositionListQueryDto,
  type PositionSummaryDto,
  type SavedPositionListDto,
} from './positions.dto';
import {
  POSITION_INCLUDE,
  type PositionRow,
  commonView,
  titles,
  translationsView,
} from './positions-view';

/** Published, by an owner that shows: the platform, or an active organisation. */
const SHOWN: Prisma.PositionWhereInput = {
  status: 'PUBLISHED',
  OR: [{ organisationId: null }, { organisation: { active: true } }],
};

/**
 * Positions as everyone reads them (M28 plan §2; owner answer §10.4: visitors too). The list
 * holds the published ones whose closing date has not passed, the nearest closing first; a
 * closed one can still be opened by its address. Saving one is for a signed-in person, and
 * theirs alone.
 */
@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewer: Principal | null, query: PositionListQueryDto): Promise<PositionListDto> {
    const open: Prisma.PositionWhereInput = { ...SHOWN, closesOn: { gte: todayInIsrael() } };
    const where: Prisma.PositionWhereInput = {
      AND: [
        open,
        ...(query.kind ? [{ kind: query.kind }] : []),
        ...(query.audience ? [{ audience: query.audience }] : []),
        ...(query.hospital ? [{ hospitalId: query.hospital }] : []),
        ...(query.country ? [{ country: query.country }] : []),
        ...(query.subspecialty
          ? [{ subspecialties: { some: { subspecialty: { key: query.subspecialty } } } }]
          : []),
        ...(query.q ? [searchWhere(query.q)] : []),
      ],
    };
    const [rows, total, countries] = await Promise.all([
      this.prisma.position.findMany({
        where,
        include: POSITION_INCLUDE,
        orderBy: [{ closesOn: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.position.count({ where }),
      this.prisma.position.findMany({
        where: open,
        distinct: ['country'],
        select: { country: true },
        orderBy: { country: 'asc' },
      }),
    ]);
    const saved = await this.savedAmong(
      viewer,
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) => summary(row, saved.has(row.id))),
      page: query.page,
      pageSize: query.pageSize,
      total,
      countries: countries.map((row) => row.country),
    };
  }

  async get(viewer: Principal | null, id: string): Promise<PositionDto> {
    const row = await this.prisma.position.findFirst({
      where: { AND: [{ id }, SHOWN] },
      include: POSITION_INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    const saved = await this.savedAmong(viewer, [row.id]);
    return {
      ...commonView(row),
      translations: translationsView(row),
      applyUrl: row.applyUrl,
      applyEmail: row.applyEmail,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      closed: row.closesOn < todayInIsrael(),
      saved: saved.has(row.id),
    };
  }

  /** The reader's saved positions that still show, the nearest closing first. */
  async saved(principal: Principal): Promise<SavedPositionListDto> {
    const rows = await this.prisma.position.findMany({
      where: { AND: [SHOWN, { saves: { some: { userId: principal.userId } } }] },
      include: POSITION_INCLUDE,
      orderBy: [{ closesOn: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return { items: rows.map((row) => summary(row, true)) };
  }

  async save(principal: Principal, id: string): Promise<void> {
    const row = await this.prisma.position.findFirst({
      where: { AND: [{ id }, SHOWN] },
      select: { id: true },
    });
    if (!row) throw new AppException('NOT_FOUND');
    await this.prisma.savedPosition.upsert({
      where: { userId_positionId: { userId: principal.userId, positionId: id } },
      create: { userId: principal.userId, positionId: id },
      update: {},
    });
  }

  async unsave(principal: Principal, id: string): Promise<void> {
    await this.prisma.savedPosition.deleteMany({
      where: { userId: principal.userId, positionId: id },
    });
  }

  private async savedAmong(viewer: Principal | null, ids: string[]): Promise<Set<string>> {
    if (!viewer || ids.length === 0) return new Set();
    const rows = await this.prisma.savedPosition.findMany({
      where: { userId: viewer.userId, positionId: { in: ids } },
      select: { positionId: true },
    });
    return new Set(rows.map((row) => row.positionId));
  }
}

function summary(row: PositionRow, saved: boolean): PositionSummaryDto {
  return {
    ...commonView(row),
    ...titles(row),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    saved,
  };
}

/** Words in the title, the institution or the city, in either language. */
function searchWhere(q: string): Prisma.PositionWhereInput {
  const contains = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [
      { translations: { some: { title: contains } } },
      { institutionName: contains },
      { city: contains },
      { hospital: { OR: [{ nameHe: contains }, { nameEn: contains }] } },
      { hospital: { OR: [{ cityHe: contains }, { cityEn: contains }] } },
    ],
  };
}
