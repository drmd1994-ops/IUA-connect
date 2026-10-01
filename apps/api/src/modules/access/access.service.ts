import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { effectiveStatus, todayInIsrael } from '../membership';
import { ANONYMOUS, type AccessTier, type Viewer, canSee } from './access-policy';

/** Content kinds that carry an access tier (`content_access_rules.entity_type`). */
export type ContentEntity = 'news' | 'guideline' | 'event' | 'education' | 'exam_question';

/**
 * Applies access tiers to content reads (M3 plan §2.5). Lists leave out what the viewer may not
 * see; a direct fetch of such an item answers 404, the same as a missing one (API_DESIGN.md §4).
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async viewerOf(principal: Principal | null): Promise<Viewer> {
    if (!principal) return ANONYMOUS;
    const membership = await this.prisma.membership.findUnique({
      where: { userId: principal.userId },
      select: { status: true, endDate: true, typeId: true },
    });
    if (!membership || effectiveStatus(membership, todayInIsrael()) !== 'ACTIVE') return ANONYMOUS;
    return { activeTypeId: membership.typeId };
  }

  /**
   * A `where` fragment for an entity with an `accessTier` column: the items the viewer may see.
   * The TYPES check is resolved to item IDs first (the rules table serves several entities).
   */
  async visibleWhere(
    entity: ContentEntity,
    viewer: Viewer,
  ): Promise<{ OR: { accessTier?: AccessTier; id?: { in: string[] } }[] }> {
    if (!viewer.activeTypeId) return { OR: [{ accessTier: 'PUBLIC' }] };
    const rules = await this.prisma.contentAccessRule.findMany({
      where: { entityType: entity, membershipTypeId: viewer.activeTypeId },
      select: { entityId: true },
    });
    return {
      OR: [
        { accessTier: 'PUBLIC' },
        { accessTier: 'MEMBERS' },
        ...(rules.length ? [{ id: { in: rules.map((rule) => rule.entityId) } }] : []),
      ],
    };
  }

  async canSeeItem(
    entity: ContentEntity,
    item: { id: string; accessTier: AccessTier },
    viewer: Viewer,
  ): Promise<boolean> {
    if (item.accessTier !== 'TYPES') return canSee(viewer, item.accessTier, []);
    return canSee(viewer, 'TYPES', await this.allowedTypes(entity, item.id));
  }

  async allowedTypes(entity: ContentEntity, entityId: string): Promise<string[]> {
    const rules = await this.prisma.contentAccessRule.findMany({
      where: { entityType: entity, entityId },
      select: { membershipTypeId: true },
    });
    return rules.map((rule) => rule.membershipTypeId);
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
