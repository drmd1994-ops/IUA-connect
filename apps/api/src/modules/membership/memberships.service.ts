import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
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

type MembershipWithType = Prisma.MembershipGetPayload<{ include: { type: true } }>;

/** Members' memberships: the current one per user, with its append-only history. */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(userId: string): Promise<MyMembershipDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
      include: { type: true, history: { orderBy: { at: 'desc' } } },
    });
    if (!membership) return { membership: null, history: [] };
    return {
      membership: describe(membership),
      history: membership.history.map((row) => ({
        event: row.event,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        details: (row.details as Record<string, unknown> | null) ?? null,
        reason: row.reason,
        at: row.at.toISOString(),
      })),
    };
  }

  /**
   * Makes the user a member of the type, for the current calendar year (inside the caller's
   * transaction). An existing membership changes type and is reactivated; its period is kept
   * unless it has lapsed. Returns the end date.
   */
  async grant(tx: Tx, input: Grant): Promise<Date> {
    const today = todayInIsrael();
    const type = await tx.membershipType.findUniqueOrThrow({ where: { id: input.typeId } });
    const paymentStatus = type.annualFee ? 'UNPAID' : 'NOT_REQUIRED';
    const existing = await tx.membership.findUnique({
      where: { userId: input.userId },
      include: { type: true },
    });

    if (!existing) {
      const endDate = endOfYear(today);
      const id = uuidv7();
      await tx.membership.create({
        data: {
          id,
          userId: input.userId,
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

function effectiveStatus(membership: { status: string; endDate: Date }, today: Date): string {
  if (membership.status === 'SUSPENDED') return 'SUSPENDED';
  return isExpired(membership.endDate, today) ? 'EXPIRED' : membership.status;
}

export function describe(
  membership: MembershipWithType,
  today = todayInIsrael(),
): NonNullable<MyMembershipDto['membership']> {
  return {
    id: membership.id,
    type: {
      id: membership.type.id,
      key: membership.type.key,
      nameHe: membership.type.nameHe,
      nameEn: membership.type.nameEn,
    },
    status: effectiveStatus(membership, today) as 'ACTIVE' | 'SUSPENDED' | 'EXPIRED',
    startDate: isoDate(membership.startDate),
    endDate: isoDate(membership.endDate),
    paymentStatus: membership.paymentStatus,
  };
}

async function history(
  tx: Tx,
  membershipId: string,
  event: 'CREATED' | 'TYPE_CHANGED',
  fromStatus: string | null,
  toStatus: string,
  input: Grant,
  details: Record<string, string>,
): Promise<void> {
  await tx.membershipHistory.create({
    data: {
      id: uuidv7(),
      membershipId,
      event,
      fromStatus,
      toStatus,
      details,
      changedBy: input.changedBy,
      reason: input.reason ?? null,
    },
  });
}
