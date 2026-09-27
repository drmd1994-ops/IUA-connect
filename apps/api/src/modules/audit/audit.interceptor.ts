import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { type Observable, concatMap, from, map } from 'rxjs';
import { type RequestWithPrincipal } from '../../common/auth/principal';
import { correlationIdOf } from '../../common/correlation';
import { AUDITED_KEY, type AuditedOptions } from './audited.decorator';
import { AuditService } from './audit.service';

/**
 * Pipeline step 8 (ARCHITECTURE.md §3). After an @Audited route succeeds, records who did what
 * to which entity, from where, under which correlation ID. The response is sent only after the
 * audit row is written, so an action is never reported as done without its audit entry.
 * Before/after digests are recorded by services that have them, through AuditService directly.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!options || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request & RequestWithPrincipal>();

    return next.handle().pipe(
      concatMap((result) =>
        from(
          this.audit.record({
            action: options.action,
            correlationId: correlationIdOf(request),
            actorUserId: request.principal?.userId ?? null,
            actorIp: request.ip ?? null,
            entityType: options.entityType ?? null,
            entityId: targetId(request, result, options.idParam ?? 'id'),
          }),
        ).pipe(map(() => result)),
      ),
    );
  }
}

function targetId(request: Request, result: unknown, idParam: string): string | null {
  const fromParams = request.params?.[idParam];
  if (typeof fromParams === 'string') return fromParams;
  const fromResult = (result as { id?: unknown } | null)?.id;
  return typeof fromResult === 'string' ? fromResult : null;
}
