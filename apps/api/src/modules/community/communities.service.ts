import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { markOf } from '../../common/verified-as';
import { type Prisma } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import {
  type AdminCommunityDto,
  type AdminCommunityInputDto,
  type AdminCommunityListDto,
  type BanInputDto,
  type BanListDto,
  type CommunityDto,
  type CommunityListDto,
} from './community.dto';
import { banInForce } from './community-rules';

const DAY = 24 * 60 * 60 * 1000;

const COMMUNITY_INCLUDE = {
  subspecialty: { select: { id: true, key: true, nameHe: true, nameEn: true } },
} satisfies Prisma.CommunityInclude;
type CommunityRow = Prisma.CommunityGetPayload<{ include: typeof COMMUNITY_INCLUDE }>;

export interface Author {
  id: string;
  firstName: string;
  lastName: string;
  mark: 'STUDENT' | 'RESIDENT' | null;
}

/** What the reader may do in one community. */
export interface Standing {
  community: { id: string; slug: string; nameHe: string; nameEn: string; archived: boolean };
  canWrite: boolean;
  canModerate: boolean;
  banned: { reason: string; until: Date | null } | null;
}

/** Staff who see every community: those who run them, and chat's moderators (§10.2). */
export const isCommunityStaff = (principal: Principal): boolean =>
  principal.permissions.has('communities.manage') || principal.permissions.has('chat.moderate');

/**
 * Communities (M25 plan §2; owner answers §10.1 to §10.3): one for each subspecialty and others
 * the staff open, for every verified person. Staff appoint moderators for each; chat's
 * moderators act in all of them. A banned person reads but does not write.
 */
@Injectable()
export class CommunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Who --------------------------------------------------------------------------------------

  /** Reading needs a verified person, or staff. */
  ensureReader(principal: Principal): void {
    if (!principal.verified && !isCommunityStaff(principal)) {
      throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
    }
  }

  /** The reader's standing in a community; an unknown one reads as "not found". */
  async standing(
    principal: Principal,
    idOrSlug: { id?: string; slug?: string },
  ): Promise<Standing> {
    this.ensureReader(principal);
    const row = await this.prisma.community.findFirst({
      where: idOrSlug.id ? { id: idOrSlug.id } : { slug: idOrSlug.slug ?? '' },
      select: {
        id: true,
        slug: true,
        nameHe: true,
        nameEn: true,
        archivedAt: true,
        moderators: { where: { userId: principal.userId }, select: { userId: true } },
        bans: { where: { userId: principal.userId }, select: { reason: true, until: true } },
      },
    });
    // An archived community is for staff only.
    if (!row || (row.archivedAt && !isCommunityStaff(principal))) {
      throw new AppException('NOT_FOUND');
    }
    const ban = row.bans[0] ?? null;
    const banned = banInForce(ban) ? ban : null;
    return {
      community: {
        id: row.id,
        slug: row.slug,
        nameHe: row.nameHe,
        nameEn: row.nameEn,
        archived: row.archivedAt !== null,
      },
      canWrite: principal.verified && !banned && row.archivedAt === null,
      canModerate: row.moderators.length > 0 || principal.permissions.has('chat.moderate'),
      banned,
    };
  }

  /** People as readers see them: name and mark. People without a profile are left out. */
  async authors(ids: readonly (string | null)[]): Promise<Map<string, Author>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const rows = await this.prisma.profile.findMany({
      where: { userId: { in: wanted } },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        user: { select: { verifiedAs: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.userId,
        {
          id: row.userId,
          firstName: row.firstName ?? '',
          lastName: row.lastName ?? '',
          mark: markOf(row.user.verifiedAs),
        },
      ]),
    );
  }

  // --- Reading ----------------------------------------------------------------------------------

  async list(principal: Principal): Promise<CommunityListDto> {
    this.ensureReader(principal);
    const rows = await this.prisma.community.findMany({
      where: { archivedAt: null },
      include: {
        ...COMMUNITY_INCLUDE,
        follows: { where: { userId: principal.userId }, select: { userId: true } },
        moderators: { where: { userId: principal.userId }, select: { userId: true } },
        _count: { select: { posts: { where: { removedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    return {
      items: rows.map((row) => ({
        ...communityView(row),
        postCount: row._count.posts,
        following: row.follows.length > 0,
        moderating: row.moderators.length > 0,
      })),
    };
  }

  async get(principal: Principal, slug: string): Promise<CommunityDto> {
    const standing = await this.standing(principal, { slug });
    const row = await this.prisma.community.findUniqueOrThrow({
      where: { id: standing.community.id },
      include: {
        ...COMMUNITY_INCLUDE,
        follows: { where: { userId: principal.userId }, select: { userId: true } },
        moderators: { select: { userId: true }, orderBy: { createdAt: 'asc' } },
        _count: { select: { posts: { where: { removedAt: null } } } },
      },
    });
    const people = await this.authors(row.moderators.map((m) => m.userId));
    return {
      ...communityView(row),
      postCount: row._count.posts,
      following: row.follows.length > 0,
      moderators: row.moderators.flatMap((m) => people.get(m.userId) ?? []),
      canWrite: standing.canWrite,
      canModerate: standing.canModerate,
      banned: standing.banned
        ? {
            reason: standing.banned.reason,
            until: standing.banned.until?.toISOString() ?? null,
          }
        : null,
      archived: standing.community.archived,
    };
  }

  async follow(principal: Principal, slug: string, on: boolean): Promise<void> {
    const { community } = await this.standing(principal, { slug });
    if (on) {
      await this.prisma.communityFollow.upsert({
        where: { communityId_userId: { communityId: community.id, userId: principal.userId } },
        create: { communityId: community.id, userId: principal.userId },
        update: {},
      });
    } else {
      await this.prisma.communityFollow.deleteMany({
        where: { communityId: community.id, userId: principal.userId },
      });
    }
  }

  // --- Bans (moderators) ------------------------------------------------------------------------

  async bans(principal: Principal, slug: string): Promise<BanListDto> {
    const { community } = await this.moderating(principal, slug);
    const rows = await this.prisma.communityBan.findMany({
      where: { communityId: community.id },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    const live = rows.filter((row) => banInForce(row, now));
    const people = await this.authors(live.map((row) => row.userId));
    return {
      items: live.flatMap((row) => {
        const person = people.get(row.userId);
        return person
          ? [
              {
                person,
                reason: row.reason,
                until: row.until?.toISOString() ?? null,
                createdAt: row.createdAt.toISOString(),
              },
            ]
          : [];
      }),
    };
  }

  async ban(principal: Principal, slug: string, input: BanInputDto, meta: RequestMeta) {
    const { community } = await this.moderating(principal, slug);
    if (input.userId === principal.userId) throw new AppException('NOT_FOUND');
    const person = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!person) throw new AppException('NOT_FOUND');
    // A moderator of this community, or staff, is not banned by another moderator.
    const protectedPerson = await this.prisma.communityModerator.count({
      where: { communityId: community.id, userId: input.userId },
    });
    if (protectedPerson) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'communityModeratorNotBanned' }]);
    }
    const until = input.days ? new Date(Date.now() + input.days * DAY) : null;
    await this.prisma.communityBan.upsert({
      where: { communityId_userId: { communityId: community.id, userId: input.userId } },
      create: {
        communityId: community.id,
        userId: input.userId,
        reason: input.reason,
        bannedBy: principal.userId,
        until,
      },
      update: { reason: input.reason, bannedBy: principal.userId, until, createdAt: new Date() },
    });
    await this.record('community.ban', community.id, principal, meta, {
      userId: input.userId,
      reason: input.reason,
      days: input.days ?? null,
    });
  }

  async liftBan(principal: Principal, slug: string, userId: string, meta: RequestMeta) {
    const { community } = await this.moderating(principal, slug);
    const { count } = await this.prisma.communityBan.deleteMany({
      where: { communityId: community.id, userId },
    });
    if (count === 0) throw new AppException('NOT_FOUND');
    await this.record('community.ban.lift', community.id, principal, meta, { userId });
  }

  private async moderating(principal: Principal, slug: string): Promise<Standing> {
    const standing = await this.standing(principal, { slug });
    if (!standing.canModerate) {
      throw new AppException('FORBIDDEN', [{ code: 'communityModeratorsOnly' }]);
    }
    return standing;
  }

  // --- Staff ------------------------------------------------------------------------------------

  async adminList(): Promise<AdminCommunityListDto> {
    const rows = await this.prisma.community.findMany({
      include: {
        ...COMMUNITY_INCLUDE,
        moderators: { select: { userId: true }, orderBy: { createdAt: 'asc' } },
        _count: { select: { posts: { where: { removedAt: null } } } },
      },
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
    });
    const people = await this.authors(rows.flatMap((row) => row.moderators.map((m) => m.userId)));
    return {
      items: rows.map((row) => ({
        ...communityView(row),
        sortOrder: row.sortOrder,
        archived: row.archivedAt !== null,
        postCount: row._count.posts,
        moderators: row.moderators.flatMap((m) => people.get(m.userId) ?? []),
      })),
    };
  }

  async adminGet(id: string): Promise<AdminCommunityDto> {
    const found = (await this.adminList()).items.find((item) => item.id === id);
    if (!found) throw new AppException('NOT_FOUND');
    return found;
  }

  async create(
    principal: Principal,
    input: AdminCommunityInputDto,
    meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    const id = uuidv7();
    try {
      await this.prisma.community.create({ data: { id, ...input } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'slug', code: 'slugTaken' }]);
      }
      throw error;
    }
    await this.record('community.create', id, principal, meta);
    return this.adminGet(id);
  }

  async update(
    principal: Principal,
    id: string,
    input: AdminCommunityInputDto,
    meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    await this.adminGet(id);
    try {
      await this.prisma.community.update({ where: { id }, data: input });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'slug', code: 'slugTaken' }]);
      }
      throw error;
    }
    await this.record('community.update', id, principal, meta);
    return this.adminGet(id);
  }

  async setArchived(
    principal: Principal,
    id: string,
    archived: boolean,
    meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    await this.adminGet(id);
    await this.prisma.community.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await this.record(archived ? 'community.archive' : 'community.restore', id, principal, meta);
    return this.adminGet(id);
  }

  async addModerator(
    principal: Principal,
    id: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    await this.adminGet(id);
    // A moderator is a verified person with a name.
    const person = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
        verifiedAt: { not: null },
        profile: { is: { firstName: { not: null }, lastName: { not: null } } },
      },
      select: { id: true },
    });
    if (!person) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'userId', code: 'communityModeratorNotVerified' },
      ]);
    }
    await this.prisma.communityModerator.upsert({
      where: { communityId_userId: { communityId: id, userId } },
      create: { communityId: id, userId, grantedBy: principal.userId },
      update: {},
    });
    await this.record('community.moderator.add', id, principal, meta, { userId });
    return this.adminGet(id);
  }

  async removeModerator(
    principal: Principal,
    id: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    await this.adminGet(id);
    await this.prisma.communityModerator.deleteMany({ where: { communityId: id, userId } });
    await this.record('community.moderator.remove', id, principal, meta, { userId });
    return this.adminGet(id);
  }

  private record(
    action: string,
    id: string,
    principal: Principal,
    meta: RequestMeta,
    changes?: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'community',
      entityId: id,
      ...(changes ? { changes } : {}),
    });
  }
}

function communityView(row: CommunityRow) {
  return {
    id: row.id,
    slug: row.slug,
    nameHe: row.nameHe,
    nameEn: row.nameEn,
    descriptionHe: row.descriptionHe,
    descriptionEn: row.descriptionEn,
    subspecialty: row.subspecialty,
  };
}
