import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ORGANISATION_REF } from '../organisations';
import { type MyMembershipDto } from './membership.dto';
import { endOfYear, isExpired, isoDate, todayInIsrael } from './period';

type Tx = Prisma.TransactionClient;

export interface Grant {
  userId: string;
  typeId: string;
  identifierEnc: string | null;
  identifierHash: string | null;
  changedBy: string | null;
  source: 'MANUAL' | 'IMPORT';
  reason?: string | null;
}

export const MEMBERSHIP_PARTS = {
  type: true,
  organisation: { select: ORGANISATION_REF },
} satisfies Prisma.MembershipInclude;

type MembershipWithType = Prisma.MembershipGetPayload<{ include: typeof MEMBERSHIP_PARTS }>;

/**
 * Members' memberships: one per person in an organisation, with its append-only history. A
 * person may belong to several organisations (M16).
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The person's membership in one organisation. */
  async mine(userId: string, organisationId: string): Promise<MyMembershipDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
      include: { ...MEMBERSHIP_PARTS, history: { orderBy: { at: 'desc' } } },
    });
    if (!membership) return { membership: null, history: [] };
    return {
      membership: describe(membership),
      history: membership.history.map(historyEntry),
    };
  }

  /** Every membership the person holds, the organisations in name order. */
  async all(userId: string): Promise<NonNullable<MyMembershipDto['membership']>[]> {
    const rows = await this.prisma.membership.findMany({
      where: { userId, organisation: { active: true } },
      include: MEMBERSHIP_PARTS,
      orderBy: [{ organisation: { nameEn: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((row) => describe(row));
  }

  /**
   * Makes the user a member of the type, in the type's organisation, for the current calendar year (inside the caller's
   * transaction). An existing membership changes type and is reactivated; its period is kept
   * unless it has lapsed. Returns the end date.
   */
  async grant(tx: Tx, input: Grant): Promise<Date> {
    const today = todayInIsrael();
    const type = await tx.membershipType.findUniqueOrThrow({ where: { id: input.typeId } });
    const paymentStatus = type.annualFee ? 'UNPAID' : 'NOT_REQUIRED';
    const existing = await tx.membership.findUnique({
      where: {
        userId_organisationId: { userId: input.userId, organisationId: type.organisationId },
      },
      include: { type: true },
    });
    // Whoever an organisation accepts as a member is known to the platform as a physician.
    await tx.user.updateMany({
      where: { id: input.userId, verifiedAt: null },
      data: { verifiedAt: new Date() },
    });

    if (!existing) {
      const endDate = endOfYear(today);
      const id = uuidv7();
      await tx.membership.create({
        data: {
          id,
          userId: input.userId,
          organisationId: type.organisationId,
          typeId: type.id,
          status: 'ACTIVE',
          startDate: today,
          endDate,
          paymentStatus,
          source: input.source,
          identifierEnc: input.identifierEnc,
          identifierHash: input.identifierHash,
        },
      });
      await history(tx, id, 'CREATED', null, 'ACTIVE', input, {
        type: type.key,
        endDate: isoDate(endDate),
      });
      return endDate;
    }

    const lapsed = isExpired(existing.endDate, today);
    const endDate = lapsed ? endOfYear(today) : existing.endDate;
    await tx.membership.update({
      where: { id: existing.id },
      data: {
        typeId: type.id,
        status: 'ACTIVE',
        ...(lapsed ? { startDate: today, endDate } : {}),
        ...(input.identifierHash
          ? { identifierEnc: input.identifierEnc, identifierHash: input.identifierHash }
          : {}),
      },
    });
    await history(
      tx,
      existing.id,
      'TYPE_CHANGED',
      effectiveStatus(existing, today),
      'ACTIVE',
      input,
      {
        fromType: existing.type.key,
        type: type.key,
        endDate: isoDate(endDate),
      },
    );
    return endDate;
  }
}

export type EffectiveStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

/** SUSPENDED wins; otherwise EXPIRED once the end date has passed (never stored). */
export function effectiveStatus(
  membership: { status: string; endDate: Date },
  today: Date,
): EffectiveStatus {
  if (membership.status === 'SUSPENDED') return 'SUSPENDED';
  return isExpired(membership.endDate, today) ? 'EXPIRED' : 'ACTIVE';
}

export function historyEntry(row: {
  event: HistoryEvent;
  fromStatus: string | null;
  toStatus: string | null;
  details: unknown;
  reason: string | null;
  at: Date;
}): MyMembershipDto['history'][number] {
  return {
    event: row.event,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    details: (row.details as Record<string, unknown> | null) ?? null,
    reason: row.reason,
    at: row.at.toISOString(),
  };
}

export function describe(
  membership: MembershipWithType,
  today = todayInIsrael(),
): NonNullable<MyMembershipDto['membership']> {
  return {
    id: membership.id,
    organisation: membership.organisation,
    type: {
      id: membership.type.id,
      key: membership.type.key,
      nameHe: membership.type.nameHe,
      nameEn: membership.type.nameEn,
    },
    status: effectiveStatus(membership, today),
    startDate: isoDate(membership.startDate),
    endDate: isoDate(membership.endDate),
    paymentStatus: membership.paymentStatus,
  };
}

export type HistoryEvent = MyMembershipDto['history'][number]['event'];

export interface HistoryInput {
  membershipId: string;
  event: HistoryEvent;
  fromStatus: string | null;
  toStatus: string | null;
  details?: Record<string, string>;
  changedBy: string | null;
  reason?: string | null;
}

/** Appends to membership_history (the table rejects updates and deletes). */
export async function recordHistory(tx: Tx, input: HistoryInput): Promise<void> {
  await tx.membershipHistory.create({
    data: {
      id: uuidv7(),
      membershipId: input.membershipId,
      event: input.event,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      ...(input.details ? { details: input.details } : {}),
      changedBy: input.changedBy,
      reason: input.reason ?? null,
    },
  });
}

const history = (
  tx: Tx,
  membershipId: string,
  event: HistoryEvent,
  fromStatus: string | null,
  toStatus: string,
  input: Grant,
  details: Record<string, string>,
) =>
  recordHistory(tx, {
    membershipId,
    event,
    fromStatus,
    toStatus,
    details,
    changedBy: input.changedBy,
    reason: input.reason,
  });
