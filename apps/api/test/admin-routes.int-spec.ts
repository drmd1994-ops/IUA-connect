import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { type DeclaredRoute, listRoutes } from '../src/common/route-audit';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  startHarness,
} from './auth-harness';

/**
 * M8 exit criterion: every admin route refuses an anonymous caller (401), a signed-in member
 * (403) and an administrator whose session has not completed two-step verification (403).
 * The routes are read from the running application, so a route added later is covered without
 * anyone remembering to add a test. (The fourth part of the pattern, that an administrator in
 * a verified session gets through, is tested per screen, where the right request is known.)
 */
describe('every admin route (integration sweep)', () => {
  let h: Harness;
  let routes: DeclaredRoute[];
  let memberToken: string;
  let adminWithoutTwoStep: string;
  const ID = '0190a000-0000-7000-8000-00000000c0de';

  beforeAll(async () => {
    h = await startHarness();
    routes = listRoutes(
      new DiscoveryService(h.app.get(ModulesContainer)),
      new MetadataScanner(),
      new Reflector(),
    ).filter((route) => route.path === 'admin' || route.path.startsWith('admin/'));
    memberToken = (await signIn(h, await createVerifiedUser(h, 'sweep-member'))).accessToken;
    // Holds every permission, so only the missing two-step verification can be the reason.
    const superAdmin = await createVerifiedUser(h, 'sweep-super');
    await grantRole(h, superAdmin, 'SUPER_ADMIN');
    adminWithoutTwoStep = (await signIn(h, superAdmin)).accessToken;
  });

  afterAll(async () => {
    await h.close();
  });

  const call = (route: DeclaredRoute, token?: string) => {
    const path = `/api/v1/${route.path.replace(/:[A-Za-z]+/g, ID)}`;
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    const req = h.http()[method](path);
    return token ? req.set(bearer(token)) : req;
  };

  it('finds the admin routes of the application', () => {
    // A sanity check on the sweep itself: it sees the screens that exist.
    const paths = routes.map((route) => `${route.method} ${route.path}`);
    expect(paths.length).toBeGreaterThan(80);
    for (const expected of [
      'GET admin/users',
      'POST admin/users/:id/disable',
      'GET admin/audit-logs',
      'GET admin/memberships',
      'POST admin/broadcasts/:id/approve',
      'GET admin/news',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it('declares a permission on every one of them', () => {
    const open = routes
      .filter((route) => route.access !== 'permission')
      .map((route) => `${route.method} ${route.path} (${route.access})`);
    expect(open).toEqual([]);
  });

  it('refuses an anonymous caller with 401', async () => {
    const wrong: string[] = [];
    for (const route of routes) {
      const res = await call(route);
      if (res.status !== 401) wrong.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('refuses a signed-in member with 403', async () => {
    const wrong: string[] = [];
    for (const route of routes) {
      const res = await call(route, memberToken);
      if (res.status !== 403) wrong.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('refuses an administrator without two-step verification with 403', async () => {
    const wrong: string[] = [];
    for (const route of routes) {
      const res = await call(route, adminWithoutTwoStep);
      if (res.status !== 403) wrong.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });
});
