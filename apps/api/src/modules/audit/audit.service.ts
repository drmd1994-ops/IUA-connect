import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { type Prisma } from '../../generated/prisma/client';
import { redact } from './redact';

export interface AuditEntry {
  action: string;
  correlationId: string;
  actorUserId?: string | null;
  actorIp?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Before/after digest or other context. Sensitive keys are redacted before storage. */
  changes?: Record<string, unknown> | null;
}

/**
 * Writes to the append-only audit log. There is intentionally no update or delete method:
 * the database rejects both (trigger + grants), and this service does not pretend otherwise.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<string> {
    const id = uuidv7();
    await this.prisma.auditLog.create({
      data: {
        id,
        action: entry.action,
        correlationId: entry.correlationId,
        actorUserId: entry.actorUserId ?? null,
        actorIp: entry.actorIp ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ...(entry.changes ? { changes: redact(entry.changes) as Prisma.InputJsonValue } : {}),
      },
    });
    return id;
  }
}
