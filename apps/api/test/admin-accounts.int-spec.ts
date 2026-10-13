import {
  DEFAULT_ORGANISATION,
  type Harness,
  STRONG_PASSWORD,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  grantRole,
  signIn,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M8 checkpoints 1–3: accounts, roles and the audit log viewer in the admin area. */
describe('admin: accounts, roles and the audit log (integration)', () => {
  let h: Harness;
  let admin: { email: string; accessToken: string; userId: string };
  let superAdmin: { email: string; accessToken: string; userId: string };
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  const REASON = { reason: 'Asked for by the test.' };

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'accounts-admin');
    superAdmin = await signInWithMfa(h, 'accounts-super', (email) =>
      grantRole(h, email, 'SUPER_ADMIN'),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  async function person(label = 'account') {
    const email = await createVerifiedUser(h, label);
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { email, id: rows[0]!.id };
  }
  const account = async (id: string, who = admin) =>
    (await h.http().get(`/api/v1/admin/users/${id}`).set(as(who)).expect(200)).body;
  const act = (who: { accessToken: string }, id: string, action: string, body: object = REASON) =>
    h.http().post(`/api/v1/admin/users/${id}/${action}`).set(as(who)).send(body);
  const login = (email: string) =>
    h.http().post('/api/v1/auth/login').send({ email, password: STRONG_PASSWORD });
  const audited = async (id: string) =>
    (
      await h.db.query<{ action: string; actor_user_id: string; changes: Record<string, unknown> }>(
        `SELECT action, actor_user_id, changes FROM audit_logs
         WHERE entity_type = 'user' AND entity_id = $1 AND action LIKE 'account.%' ORDER BY at`,
        [id],
      )
    ).rows;

  describe('who may use it', () => {
    it('is for administrators in a verified session', async () => {
      const p = await person();
      await expectAdminOnly(h, 'get', '/api/v1/admin/users');
      await expectAdminOnly(h, 'get', `/api/v1/admin/users/${p.id}`);
      await expectAdminOnly(h, 'get', '/api/v1/admin/roles');
      await expectAdminOnly(h, 'get', '/api/v1/admin/audit-logs');
      for (const action of ['disable', 'enable', 'unlock', 'sessions/revoke']) {
        await expectAdminOnly(h, 'post', `/api/v1/admin/users/${p.id}/${action}`, REASON);
      }
      // A content editor is staff, but not for accounts or the audit log.
      const editor = await signInWithMfa(h, 'accounts-editor', (email) =>
        grantRole(h, email, 'CONTENT_EDITOR'),
      );
      await h.http().get('/api/v1/admin/users').set(as(editor)).expect(403);
      await h.http().get('/api/v1/admin/audit-logs').set(as(editor)).expect(403);
    });

    it('only a super admin gives and removes roles', async () => {
      const p = await person();
      const body = { role: 'CONTENT_EDITOR', ...REASON };
      await act(admin, p.id, 'roles', body).expect(403);
      await act(admin, p.id, 'roles/remove', body).expect(403);
      await act(superAdmin, p.id, 'roles', body).expect(200);
    });
  });

  describe('reading accounts', () => {
    it('lists and finds accounts, without anything secret', async () => {
      const p = await person('findable');
      const found = await h
        .http()
        .get(`/api/v1/admin/users?q=${encodeURIComponent(p.email.toUpperCase())}`)
        .set(as(admin))
        .expect(200);
      expect(found.body.total).toBe(1);
      expect(found.body.items[0]).toEqual({
        id: p.id,
        email: p.email,
        name: null,
        status: 'ACTIVE',
        lockedNow: false,
        emailVerified: true,
        roles: [],
        twoStep: false,
        lastLoginAt: null,
        createdAt: expect.any(String),
      });
      const text = JSON.stringify(found.body);
      expect(text).not.toMatch(/password|secret|hash|recovery/i);

      const mine = await account(admin.userId);
      // The administrator holds one role in the default organisation and one on the platform.
      // Memberships are an organisation's business: not shown to someone who may not look in.
      expect(mine).toMatchObject({
        roles: ['ORG_ADMIN', 'PLATFORM_ADMIN'],
        twoStep: true,
        memberships: null,
        verifiedAt: null,
      });
      expect(mine.openSessions).toBeGreaterThanOrEqual(1);
      const grant = { scope: 'NONE', grantedAt: expect.any(String), removable: true };
      expect(mine.roleGrants).toEqual([
        {
          ...grant,
          role: 'ORG_ADMIN',
          organisation: expect.objectContaining({ id: DEFAULT_ORGANISATION }),
        },
        { ...grant, role: 'PLATFORM_ADMIN', organisation: null },
      ]);
      expect(JSON.stringify(mine)).not.toMatch(/password|secret|hash|recovery/i);
      await h
        .http()
        .get('/api/v1/admin/users/0190a000-0000-7000-8000-00000000c0de')
        .set(as(admin))
        .expect(404);
    });

    it('filters by state and by role', async () => {
      const p = await person('to-disable');
      await act(admin, p.id, 'disable').expect(200);
      const list = async (query: string) =>
        (await h.http().get(`/api/v1/admin/users?${query}`).set(as(admin)).expect(200)).body
          .items as { id: string; status: string; roles: string[] }[];
      const disabled = await list(`status=DISABLED&q=${encodeURIComponent(p.email)}`);
      expect(disabled.map((item) => item.id)).toEqual([p.id]);
      expect(await list(`status=ACTIVE&q=${encodeURIComponent(p.email)}`)).toEqual([]);
      const supers = await list('role=SUPER_ADMIN&pageSize=100');
      expect(supers.map((item) => item.id)).toContain(superAdmin.userId);
      expect(supers.every((item) => item.roles.includes('SUPER_ADMIN'))).toBe(true);
      await h.http().get('/api/v1/admin/users?role=EMPEROR').set(as(admin)).expect(400);
    });
  });

  describe('disabling and enabling', () => {
    it('a disabled account is signed out at once and can’t sign in; enabling restores it', async () => {
      const p = await person();
      const session = await signIn(h, p.email);
      await h.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(200);

      await act(admin, p.id, 'disable', {}).expect(400); // a reason is required
      const disabled = await act(admin, p.id, 'disable').expect(200);
      expect(disabled.body).toMatchObject({ status: 'DISABLED', openSessions: 0 });
      await h.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(401);
      const refused = await login(p.email).expect(403);
      expect(refused.body.error.code).toBe('ACCOUNT_DISABLED');
      await act(admin, p.id, 'unlock').expect(422);

      const enabled = await act(admin, p.id, 'enable').expect(200);
      expect(enabled.body.status).toBe('ACTIVE');
      await login(p.email).expect(200);

      const log = await audited(p.id);
      expect(log.map((row) => row.action)).toEqual(['account.disable', 'account.enable']);
      expect(log[0]).toMatchObject({
        actor_user_id: admin.userId,
        changes: { reason: REASON.reason, sessionsEnded: 1 },
      });
    });

    it('nobody disables themselves, and only a super admin touches a super admin', async () => {
      const own = await act(admin, admin.userId, 'disable').expect(422);
      expect(own.body.error.details[0].code).toBe('accountSelf');
      await act(admin, admin.userId, 'sessions/revoke').expect(422);

      const refused = await act(admin, superAdmin.userId, 'disable').expect(403);
      expect(refused.body.error.details[0].code).toBe('accountSuperAdmin');
      await act(admin, superAdmin.userId, 'sessions/revoke').expect(403);
      expect((await account(superAdmin.userId)).status).toBe('ACTIVE');
      // A super admin may disable an association admin.
      const other = await signInAdmin(h, 'accounts-other-admin');
      await act(superAdmin, other.userId, 'disable').expect(200);
    });
  });

  describe('unlocking and ending sessions', () => {
    it('ends a lock that followed failed sign-ins', async () => {
      const p = await person();
      for (let i = 0; i < 5; i++) {
        await h
          .http()
          .post('/api/v1/auth/login')
          .send({ email: p.email, password: 'wrong passphrase x' })
          .expect(401);
      }
      expect(await account(p.id)).toMatchObject({ status: 'ACTIVE', lockedNow: true });
      expect((await account(p.id)).lockedUntil).not.toBeNull();
      const locked = await h
        .http()
        .get(`/api/v1/admin/users?status=LOCKED&q=${encodeURIComponent(p.email)}`)
        .set(as(admin))
        .expect(200);
      expect(locked.body.total).toBe(1);
      // A locked account answers like a wrong password, so nobody learns that it is locked.
      await login(p.email).expect(401);

      const unlocked = await act(admin, p.id, 'unlock').expect(200);
      expect(unlocked.body).toMatchObject({ lockedNow: false, lockedUntil: null });
      await login(p.email).expect(200);
    });

    it('signs a person out everywhere, and they can sign in again', async () => {
      const p = await person();
      const first = await signIn(h, p.email);
      const second = await signIn(h, p.email);
      const ended = await act(admin, p.id, 'sessions/revoke').expect(200);
      expect(ended.body.openSessions).toBe(0);
      await h.http().get('/api/v1/me').set(bearer(first.accessToken)).expect(401);
      await h.http().get('/api/v1/me').set(bearer(second.accessToken)).expect(401);
      await login(p.email).expect(200);
    });
  });

  describe('roles', () => {
    it('shows what each role may do', async () => {
      const res = await h.http().get('/api/v1/admin/roles').set(as(admin)).expect(200);
      const roles = Object.fromEntries(
        (
          res.body.items as { key: string; permissions: string[]; scope: string; holders: number }[]
        ).map((role) => [role.key, role]),
      );
      expect(roles.CONTENT_EDITOR!.permissions).toEqual(
        expect.arrayContaining(['news.create', 'education.manage']),
      );
      expect(roles.PLATFORM_ADMIN!.permissions).not.toContain('roles.manage');
      // The platform's administrator does not reach into organisations, nor run their offices.
      expect(roles.PLATFORM_ADMIN!.permissions).not.toContain('organisations.access');
      expect(roles.PLATFORM_ADMIN!.permissions).not.toContain('membership.read');
      expect(roles.ORG_ADMIN!.permissions).toContain('membership.read');
      expect(roles.ORG_ADMIN!.permissions).not.toContain('users.read');
      expect(roles.ORG_ADMIN).toMatchObject({ level: 'organisation' });
      expect(roles.PLATFORM_ADMIN).toMatchObject({ level: 'platform' });
      expect(roles.CONTENT_EDITOR).toMatchObject({ level: 'either' });
      expect(roles.SUPER_ADMIN!.permissions).toContain('roles.manage');
      expect(roles.DEPARTMENT_DIRECTOR!.scope).toBe('DEPARTMENT');
      expect(roles.SUPER_ADMIN!.holders).toBeGreaterThanOrEqual(1);
    });

    it('a role takes effect when it is given, and ends when it is removed', async () => {
      const p = await person('new-editor');
      const body = { role: 'CONTENT_EDITOR', ...REASON };
      const granted = await act(superAdmin, p.id, 'roles', body).expect(200);
      expect(granted.body.roles).toEqual(['CONTENT_EDITOR']);
      // Giving it twice changes nothing.
      await act(superAdmin, p.id, 'roles', body).expect(200);
      expect((await account(p.id)).roleGrants).toHaveLength(1);

      // The role needs two-step verification before it opens anything.
      const session = await signIn(h, p.email);
      const me = await h.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(200);
      expect(me.body.mfaEnrollmentRequired).toBe(true);
      await h.http().get('/api/v1/admin/news').set(bearer(session.accessToken)).expect(403);

      const removed = await act(superAdmin, p.id, 'roles/remove', body).expect(200);
      expect(removed.body).toMatchObject({ roles: [], openSessions: 0 });
      await h.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(401);

      const log = await audited(p.id);
      expect(log.map((row) => row.action)).toEqual(['account.role.grant', 'account.role.remove']);
      expect(log[0]!.changes).toMatchObject({ role: 'CONTENT_EDITOR', reason: REASON.reason });
    });

    it('nobody changes their own roles, and scoped or unknown roles are refused', async () => {
      const own = await act(superAdmin, superAdmin.userId, 'roles', {
        role: 'CONTENT_EDITOR',
        ...REASON,
      }).expect(422);
      expect(own.body.error.details[0].code).toBe('accountSelf');
      await act(superAdmin, superAdmin.userId, 'roles/remove', {
        role: 'SUPER_ADMIN',
        ...REASON,
      }).expect(422);

      const p = await person();
      const scoped = await act(superAdmin, p.id, 'roles', {
        role: 'DEPARTMENT_DIRECTOR',
        ...REASON,
      }).expect(400);
      expect(scoped.body.error.details[0].code).toBe('roleScoped');
      const unknown = await act(superAdmin, p.id, 'roles', { role: 'EMPEROR', ...REASON }).expect(
        400,
      );
      expect(unknown.body.error.details[0].code).toBe('roleUnknown');
      await act(superAdmin, p.id, 'roles', { role: 'CONTENT_EDITOR' }).expect(400);
    });
  });

  describe('the audit log', () => {
    it('lists entries newest first, with who did what, and filters them', async () => {
      const p = await person('audited');
      await act(admin, p.id, 'disable').expect(200);
      await act(admin, p.id, 'enable').expect(200);
      const logs = async (query: string) =>
        (await h.http().get(`/api/v1/admin/audit-logs?${query}`).set(as(admin)).expect(200))
          .body as {
          items: {
            action: string;
            actor: { id: string; email: string } | null;
            entityId: string;
            changes: Record<string, unknown>;
          }[];
          total: number;
        };

      const forAccount = await logs(`entityType=user&entityId=${p.id}&action=account.`);
      expect(forAccount.items.map((item) => item.action)).toEqual([
        'account.enable',
        'account.disable',
      ]);
      expect(forAccount.items[0]).toMatchObject({
        actor: { id: admin.userId, email: admin.email },
        entityId: p.id,
        changes: { reason: REASON.reason },
      });
      expect((await logs(`entityId=${p.id}&action=account.disable`)).total).toBe(1);
      // By who did it: an id, or part of the address.
      const mine = await logs(`actor=${admin.userId}&entityId=${p.id}`);
      expect(mine.total).toBeGreaterThanOrEqual(2);
      expect((await logs(`actor=${encodeURIComponent(admin.email)}&entityId=${p.id}`)).total).toBe(
        mine.total,
      );
      expect((await logs(`actor=${superAdmin.userId}&entityId=${p.id}`)).total).toBe(0);
      // By date: today is in, a past range is empty.
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(
        new Date(),
      );
      expect((await logs(`entityId=${p.id}&from=${today}&to=${today}&action=account.`)).total).toBe(
        2,
      );
      expect((await logs(`entityId=${p.id}&from=2020-01-01&to=2020-01-31`)).total).toBe(0);
      await h.http().get('/api/v1/admin/audit-logs?from=yesterday').set(as(admin)).expect(400);
      await h.http().get('/api/v1/admin/audit-logs?action=a;drop').set(as(admin)).expect(400);
    });

    it('records each look at the log, and offers no way to change an entry', async () => {
      const marker = `user`;
      await h
        .http()
        .get(`/api/v1/admin/audit-logs?entityType=${marker}&entityId=${admin.userId}`)
        .set(as(admin))
        .expect(200);
      const { rows } = await h.db.query<{ changes: { filters: Record<string, string> } }>(
        `SELECT changes FROM audit_logs
         WHERE action = 'audit.view' AND actor_user_id = $1 ORDER BY at DESC LIMIT 1`,
        [admin.userId],
      );
      expect(rows[0]!.changes.filters).toEqual({ entityType: marker, entityId: admin.userId });

      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        await h.http()[method]('/api/v1/admin/audit-logs').set(as(admin)).expect(404);
      }
      await expect(
        h.db.query(`UPDATE audit_logs SET action = 'x' WHERE action = 'audit.view'`),
      ).rejects.toThrow();
      await expect(
        h.db.query(`DELETE FROM audit_logs WHERE action = 'audit.view'`),
      ).rejects.toThrow();
    });
  });
});
