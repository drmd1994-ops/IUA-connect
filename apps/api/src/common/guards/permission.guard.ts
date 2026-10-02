import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type PermissionKey } from '@iua/shared';
import {
  IS_AUTHENTICATED_KEY,
  IS_PUBLIC_KEY,
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../decorators/access.decorators';
import { AppException } from '../errors/app.exception';
import { PrincipalResolver, type RequestWithPrincipal } from '../auth/principal';

/**
 * Deny by default (SECURITY_MODEL.md §3). Registered globally:
 * - @Public()                → allowed;
 * - @Authenticated()         → 401 without a valid session;
 * - @RequirePermission(...)  → 401 without a valid session, 403 unless it holds every permission;
 * - @RequireAnyPermission(…) → 401 without a valid session, 403 unless it holds one of them;
 * - none of these            → 403. Such a route is also caught by the route-declaration test.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly resolver?: PrincipalResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      IS_AUTHENTICATED_KEY,
      targets,
    );
    const required = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const anyOf = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      ANY_PERMISSIONS_KEY,
      targets,
    );
    if (!authenticatedOnly && !required?.length && !anyOf?.length) {
      this.logger.error(
        { handler: `${context.getClass().name}.${context.getHandler().name}` },
        'Route has no access declaration (@Public, @Authenticated or @RequirePermission); denied',
      );
      throw new AppException('FORBIDDEN');
    }

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (request.principal === undefined) {
      request.principal = this.resolver ? await this.resolver.resolve(request) : null;
    }
    const { principal } = request;
    if (!principal) {
      throw new AppException('UNAUTHENTICATED');
    }
    if (required?.length && !required.every((key) => principal.permissions.has(key))) {
      throw new AppException('FORBIDDEN');
    }
    if (anyOf?.length && !anyOf.some((key) => principal.permissions.has(key))) {
      throw new AppException('FORBIDDEN');
    }
    return true;
  }
}
