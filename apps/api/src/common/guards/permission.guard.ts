import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type PermissionKey } from '@iua/shared';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators/access.decorators';
import { AppException } from '../errors/app.exception';
import { type RequestWithPrincipal } from '../auth/principal';

/**
 * Deny by default (SECURITY_MODEL.md §3). Registered globally:
 * - @Public()                → allowed;
 * - @RequirePermission(...)  → 401 without a principal, 403 unless it holds every permission;
 * - neither                  → 403. Such a route is also caught by the route-declaration test.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (!required?.length) {
      this.logger.error(
        { handler: `${context.getClass().name}.${context.getHandler().name}` },
        'Route declares neither @Public() nor @RequirePermission(); access denied',
      );
      throw new AppException('FORBIDDEN');
    }

    const { principal } = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!principal) {
      throw new AppException('UNAUTHENTICATED');
    }
    if (!required.every((permission) => principal.permissions.has(permission))) {
      throw new AppException('FORBIDDEN');
    }
    return true;
  }
}
