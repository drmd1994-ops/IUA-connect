import { PATH_METADATA } from '@nestjs/common/constants';
import { type DiscoveryService, type MetadataScanner, type Reflector } from '@nestjs/core';
import {
  IS_AUTHENTICATED_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from './decorators/access.decorators';

export interface RouteDeclaration {
  controller: string;
  handler: string;
}

/**
 * Lists every controller route without an access declaration (@Public, @Authenticated or
 * @RequirePermission). The route-declaration test fails the build when this list is not empty.
 */
export function findUndeclaredRoutes(
  discovery: DiscoveryService,
  scanner: MetadataScanner,
  reflector: Reflector,
): RouteDeclaration[] {
  const undeclared: RouteDeclaration[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName];
      if (typeof handler !== 'function') continue;
      if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue; // not a route

      const targets = [handler, metatype];
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
      const isAuthenticated = reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, targets);
      const permissions = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
      if (!isPublic && !isAuthenticated && !permissions?.length) {
        undeclared.push({ controller: metatype.name, handler: methodName });
      }
    }
  }
  return undeclared;
}
