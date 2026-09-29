import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { correlationIdOf } from './correlation';

/** Who is calling from where, for audit entries and session records. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  correlationId: string;
}

export function requestMeta(request: Request): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    correlationId: correlationIdOf(request),
  };
}

/** Controller parameter: `@Meta() meta: RequestMeta`. */
export const Meta = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  requestMeta(context.switchToHttp().getRequest<Request>()),
);
