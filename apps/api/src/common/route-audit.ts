import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { type DiscoveryService, type MetadataScanner, type Reflector } from '@nestjs/core';
import {
  ANY_PERMISSIONS_KEY,
  ANY_SCOPED_PERMISSIONS_KEY,
  IS_AUTHENTICATED_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  SCOPED_PERMISSIONS_KEY,
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
      const permissions = [
        ...(reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? []),
        ...(reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, targets) ?? []),
        ...(reflector.getAllAndOverride<string[]>(SCOPED_PERMISSIONS_KEY, targets) ?? []),
        ...(reflector.getAllAndOverride<string[]>(ANY_SCOPED_PERMISSIONS_KEY, targets) ?? []),
      ];
      if (!isPublic && !isAuthenticated && !permissions.length) {
        undeclared.push({ controller: metatype.name, handler: methodName });
      }
    }
  }
  return undeclared;
}

export interface DeclaredRoute extends RouteDeclaration {
  /** "GET", "POST", … */
  method: string;
  /** The path under the API prefix, e.g. "admin/users/:id". */
  path: string;
  access: 'public' | 'authenticated' | 'permission' | 'undeclared';
  /**
   * The permission may be held inside an organisation (M16): the handler checks whose thing it
   * touches. Such a route needs a test with two organisations.
   */
  scoped: boolean;
}

/** Every controller route with its method, path and access declaration. */
export function listRoutes(
  discovery: DiscoveryService,
  scanner: MetadataScanner,
  reflector: Reflector,
): DeclaredRoute[] {
  const routes: DeclaredRoute[] = [];
  const paths = (value: unknown): string[] =>
    (Array.isArray(value) ? value : [value]).map((part) => String(part ?? ''));

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName];
      if (typeof handler !== 'function') continue;
      const handlerPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
      if (handlerPath === undefined) continue; // not a route

      const targets = [handler, metatype];
      // A route that also names a platform permission is the platform's staff's alone, whatever
      // its controller says: the guard asks for both.
      const platformOnly = Boolean(
        reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets)?.length ||
        reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, targets)?.length,
      );
      const scoped =
        !platformOnly &&
        Boolean(
          reflector.getAllAndOverride<string[]>(SCOPED_PERMISSIONS_KEY, targets)?.length ||
          reflector.getAllAndOverride<string[]>(ANY_SCOPED_PERMISSIONS_KEY, targets)?.length,
        );
      const access = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)
        ? 'public'
        : scoped ||
            reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets)?.length ||
            reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, targets)?.length
          ? 'permission'
          : reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, targets)
            ? 'authenticated'
            : 'undeclared';
      const method =
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? 'GET';
      for (const base of paths(Reflect.getMetadata(PATH_METADATA, metatype))) {
        for (const tail of paths(handlerPath)) {
          const path = [base, tail]
            .map((part) => part.replace(/^\/+|\/+$/g, ''))
            .filter(Boolean)
            .join('/');
          routes.push({
            controller: metatype.name,
            handler: methodName,
            method,
            path,
            access,
            scoped,
          });
        }
      }
    }
  }
  return routes;
}
