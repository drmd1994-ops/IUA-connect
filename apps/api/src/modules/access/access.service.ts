import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { effectiveStatus, todayInIsrael } from '../membership';
import {
  ANONYMOUS,
  type AccessTier,
  type Tiered,
  type Viewer,
  canSee,
  organisationsOf,
  typesOf,
} from './access-policy';

/** Content kinds that carry an access tier (`content_access_rules.entity_type`). */
export type ContentEntity = 'news' | 'guideline' | 'event' | 'education' | 'exam_question';

/** The kinds an organisation may own; the others are the platform's alone (M16 plan §3). */
export type OwnedEntity = 'news' | 'event';

const OWNED: ReadonlySet<ContentEntity> = new Set<ContentEntity>(['news', 'event']);

export const isOwnedEntity = (entity: ContentEntity): entity is OwnedEntity => OWNED.has(entity);

interface PlainFilter {
  accessTier?: AccessTier;
  id?: { in: string[] };
}

interface OwnedFilter extends PlainFilter {
  organisationId?: { in: string[] };
}

/** An item as the access check needs it; the platform's own kinds have no owner column. */
export interface TieredItem {
  id: string;
  accessTier: AccessTier;
  organisationId?: string | null;
}

/**
 * Applies access tiers to content reads (M3 plan §2.5; M16). Lists leave out what the viewer may
 * not see; a direct fetch of such an item answers 404, the same as a missing one
 * (API_DESIGN.md §4).
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async viewerOf(principal: Principal | null): Promise<Viewer> {
    if (!principal) return ANONYMOUS;
    return {
      verified: principal.verified,
      memberships: await this.activeMemberships(principal.userId),
    };
  }

  /** The same for a person other than the caller (whether they may be made a moderator). */
  async viewerOfUser(userId: string): Promise<Viewer> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, verifiedAt: true },
    });
    if (!user || user.status !== 'ACTIVE') return ANONYMOUS;
    return {
      verified: user.verifiedAt !== null,
      memberships: await this.activeMemberships(userId),
    };
  }

  private async activeMemberships(userId: string): Promise<Viewer['memberships']> {
    const rows = await this.prisma.membership.findMany({
      where: { userId, organisation: { active: true } },
      select: { status: true, endDate: true, typeId: true, organisationId: true },
    });
    const today = todayInIsrael();
    return rows
      .filter((row) => effectiveStatus(row, today) === 'ACTIVE')
      .map(({ organisationId, typeId }) => ({ organisationId, typeId }));
  }

  /**
   * A `where` fragment for an entity with an `accessTier` column: the items the viewer may see.
   * The TYPES check is resolved to item IDs first (the rules table serves several entities).
   */
  visibleWhere(entity: OwnedEntity, viewer: Viewer): Promise<{ OR: OwnedFilter[] }>;
  visibleWhere(
    entity: Exclude<ContentEntity, OwnedEntity>,
    viewer: Viewer,
  ): Promise<{ OR: PlainFilter[] }>;
  async visibleWhere(entity: ContentEntity, viewer: Viewer): Promise<{ OR: OwnedFilter[] }> {
    const OR: OwnedFilter[] = [{ accessTier: 'PUBLIC' }];
    if (viewer.verified) OR.push({ accessTier: 'VERIFIED' });
    if (viewer.memberships.length === 0) return { OR };
    if (isOwnedEntity(entity)) {
      OR.push({ accessTier: 'MEMBERS', organisationId: { in: organisationsOf(viewer) } });
    }
    const rules = await this.prisma.contentAccessRule.findMany({
      where: { entityType: entity, membershipTypeId: { in: typesOf(viewer) } },
      select: { entityId: true },
    });
    if (rules.length) OR.push({ id: { in: rules.map((rule) => rule.entityId) } });
    return { OR };
  }

  async canSeeItem(entity: ContentEntity, item: TieredItem, viewer: Viewer): Promise<boolean> {
    const tiered: Tiered = {
      accessTier: item.accessTier,
      organisationId: item.organisationId ?? null,
    };
    if (item.accessTier !== 'TYPES') return canSee(viewer, tiered, []);
    return canSee(viewer, tiered, await this.allowedTypes(entity, item.id));
  }

  async allowedTypes(entity: ContentEntity, entityId: string): Promise<string[]> {
    const rules = await this.prisma.contentAccessRule.findMany({
      where: { entityType: entity, entityId },
      select: { membershipTypeId: true },
    });
    return rules.map((rule) => rule.membershipTypeId);
  }

  /**
   * The membership types an item of that owner may name: an organisation's item names its own
   * types; the platform's may name any. Returns the ones that do not fit.
   */
  async typesNotOf(organisationId: string | null, typeIds: readonly string[]): Promise<string[]> {
    if (typeIds.length === 0) return [];
    const known = await this.prisma.membershipType.findMany({
      where: { id: { in: [...typeIds] }, ...(organisationId ? { organisationId } : {}) },
      select: { id: true },
    });
    const fits = new Set(known.map((type) => type.id));
    return typeIds.filter((id) => !fits.has(id));
  }

  /** Replaces an item's tier rules (inside the caller's transaction). Non-TYPES tiers keep none. */
  async setRules(
    tx: Prisma.TransactionClient,
    entity: ContentEntity,
    entityId: string,
    tier: AccessTier,
    typeIds: readonly string[],
  ): Promise<void> {
    await tx.contentAccessRule.deleteMany({ where: { entityType: entity, entityId } });
    if (tier !== 'TYPES' || typeIds.length === 0) return;
    await tx.contentAccessRule.createMany({
      data: [...new Set(typeIds)].map((membershipTypeId) => ({
        entityType: entity,
        entityId,
        membershipTypeId,
      })),
    });
  }
}
