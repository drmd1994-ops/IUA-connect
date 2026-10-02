import {
  type Harness,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  grantRole,
  signIn,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M8 checkpoint 4: the admin dashboard and the site settings. */
describe('admin: dashboard and settings (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string };
  let superAdmin: { accessToken: string; userId: string };
  let editor: { accessToken: string };
  let types: Record<string, string>;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  const dashboard = async (who: { accessToken: string }) =>
    (await h.http().get('/api/v1/admin/dashboard').set(as(who)).expect(200)).body;

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'dashboard-admin');
    superAdmin = await signInWithMfa(h, 'dashboard-super', (email) =>
      grantRole(h, email, 'SUPER_ADMIN'),
    );
    editor = await signInWithMfa(h, 'dashboard-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR'),
    );
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  describe('the dashboard', () => {
    it('is for people who work in the admin area, in a verified session', async () => {
      await expectAdminOnly(h, 'get', '/api/v1/admin/dashboard');
      // A department director approves applications on their own page, not in the admin area.
      const director = await createVerifiedUser(h, 'dashboard-director');
      await h
        .http()
        .get('/api/v1/admin/dashboard')
        .set(bearer((await signIn(h, director)).accessToken))
        .expect(403);
    });

    it('shows each person only the parts they may act on', async () => {
      const full = await dashboard(admin);
      for (const part of [
        'applications',
        'members',
        'review',
        'broadcasts',
        'events',
        'accounts',
      ]) {
        expect(full[part]).not.toBeNull();
      }
      expect(full.review).toEqual({
        news: expect.any(Number),
        education: expect.any(Number),
        examQuestions: expect.any(Number),
      });

      // A content editor writes; they don't review, approve or manage members.
      expect(await dashboard(editor)).toEqual({
        applications: null,
        members: null,
        review: null,
        broadcasts: null,
        events: null,
        accounts: null,
      });

      const eventAdmin = await signInWithMfa(h, 'dashboard-events', (email) =>
        grantRole(h, email, 'EVENT_ADMIN'),
      );
      const events = await dashboard(eventAdmin);
      expect(events.events).not.toBeNull();
      expect(events.members).toBeNull();
      expect(events.accounts).toBeNull();
    });

    it('counts what its tiles link to', async () => {
      const before = await dashboard(admin);

      // One more active member, one more suspended.
      const member = async (then?: 'suspend') => {
        const email = await createVerifiedUser(h, 'dashboard-member');
        const created = await h
          .http()
          .post('/api/v1/admin/memberships')
          .set(as(admin))
          .send({ email, typeId: types.STUDENT })
          .expect(201);
        if (then) {
          await h
            .http()
            .post(`/api/v1/admin/memberships/${created.body.membership.id}/suspend`)
            .set(as(admin))
            .send({ reason: 'Test' })
            .expect(200);
        }
      };
      await member();
      await member('suspend');

      // One more item waiting for review, one more message waiting for approval.
      const news = await h
        .http()
        .post('/api/v1/admin/news')
        .set(as(editor))
        .send({
          translations: { he: { title: `לבדיקה ${Date.now()}`, body: 'גוף', summary: 'תקציר' } },
        })
        .expect(201);
      await h
        .http()
        .post(`/api/v1/admin/news/${news.body.id}/transitions`)
        .set(as(editor))
        .send({ action: 'SUBMIT' })
        .expect(200);
      const message = await h
        .http()
        .post('/api/v1/admin/broadcasts')
        .set(as(superAdmin))
        .send({
          audience: { all: true },
          translations: { he: { title: `הודעה ${Date.now()}`, body: 'טקסט.' } },
        })
        .expect(201);
      await h
        .http()
        .post(`/api/v1/admin/broadcasts/${message.body.id}/submit`)
        .set(as(superAdmin))
        .expect(200);

      // One more event in the next 30 days, and one beyond them.
      const event = async (inDays: number) => {
        const start = new Date(Date.now() + inDays * 24 * 60 * 60 * 1000);
        const created = await h
          .http()
          .post('/api/v1/admin/events')
          .set(as(admin))
          .send({
            startAt: start.toISOString(),
            endAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
            locationName: 'Example Hall',
            registrationMode: 'INTERNAL',
            translations: { he: { title: `אירוע ללוח ${Date.now()} ${inDays}` } },
          })
          .expect(201);
        await h
          .http()
          .post(`/api/v1/admin/events/${created.body.id}/publish`)
          .set(as(admin))
          .expect(200);
      };
      await event(3);
      await event(90);

      // One more disabled account.
      const email = await createVerifiedUser(h, 'dashboard-disabled');
      const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
        email,
      ]);
      await h
        .http()
        .post(`/api/v1/admin/users/${rows[0]!.id}/disable`)
        .set(as(admin))
        .send({ reason: 'Test of the dashboard.' })
        .expect(200);

      const after = await dashboard(admin);
      expect(after.members.active).toBe(before.members.active + 1);
      expect(after.members.suspended).toBe(before.members.suspended + 1);
      const students = (d: typeof after) =>
        d.members.byType.find((type: { key: string }) => type.key === 'STUDENT').active;
      expect(students(after)).toBe(students(before) + 1);
      expect(after.review.news).toBe(before.review.news + 1);
      expect(after.broadcasts.waitingApproval).toBe(before.broadcasts.waitingApproval + 1);
      expect(after.events.upcomingTotal).toBe(before.events.upcomingTotal + 1);
      expect(after.events.upcoming.length).toBeLessThanOrEqual(5);
      expect(after.accounts.disabled).toBe(before.accounts.disabled + 1);
    });
  });

  describe('settings', () => {
    const settings = {
      contact: {
        email: 'office@example.test',
        phone: '+972 3-000-0000',
        addressHe: 'רחוב הדוגמה 1, תל אביב',
        addressEn: '1 Example Street, Tel Aviv',
      },
      notice: { enabled: true, textHe: 'הודעה לדוגמה.', textEn: 'A sample notice.' },
    };
    const put = (who: { accessToken: string }, body: object) =>
      h.http().put('/api/v1/admin/settings').set(as(who)).send(body);

    it('only a super admin reads and changes them', async () => {
      await expectAdminOnly(h, 'get', '/api/v1/admin/settings');
      await expectAdminOnly(h, 'put', '/api/v1/admin/settings', settings);
      // An association admin is not enough.
      await h.http().get('/api/v1/admin/settings').set(as(admin)).expect(403);
      await put(admin, settings).expect(403);
      await h.http().get('/api/v1/admin/settings').set(as(superAdmin)).expect(200);
    });

    it('saves them, shows them to everyone, and audits the change', async () => {
      const saved = await put(superAdmin, settings).expect(200);
      expect(saved.body).toEqual(settings);
      // Visitors get the contact details, and the notice while it is switched on.
      const open = await h.http().get('/api/v1/settings/public').expect(200);
      expect(open.body).toEqual({
        contact: settings.contact,
        notice: { textHe: 'הודעה לדוגמה.', textEn: 'A sample notice.' },
      });

      const off = { ...settings, notice: { ...settings.notice, enabled: false } };
      await put(superAdmin, off).expect(200);
      expect((await h.http().get('/api/v1/settings/public').expect(200)).body.notice).toBeNull();

      const { rows } = await h.db.query<{ changes: Record<string, unknown> }>(
        `SELECT changes FROM audit_logs WHERE action = 'settings.update' AND actor_user_id = $1
         ORDER BY at DESC LIMIT 1`,
        [superAdmin.userId],
      );
      // Only what changed is recorded.
      expect(Object.keys(rows[0]!.changes)).toEqual(['notice']);
    });

    it('refuses values that don’t fit', async () => {
      const bad = (patch: object) => put(superAdmin, { ...settings, ...patch }).expect(400);
      await bad({ contact: { ...settings.contact, email: 'not-an-address' } });
      await bad({ contact: { ...settings.contact, phone: 'call me' } });
      await bad({ contact: { ...settings.contact, website: 'https://example.test' } });
      await bad({ notice: { enabled: true, textHe: '', textEn: 'English only' } });
      await bad({ notice: { enabled: false, textHe: 'x'.repeat(301), textEn: '' } });
      await bad({ banner: true });
      // Empty contact details are allowed: nothing is shown.
      await put(superAdmin, {
        contact: { email: '', phone: '', addressHe: '', addressEn: '' },
        notice: { enabled: false, textHe: '', textEn: '' },
      }).expect(200);
    });

    it('accepts only the keys the application knows, also in the database', async () => {
      await expect(
        h.db.query(`INSERT INTO settings (key, value, updated_at) VALUES ('other', '{}', now())`),
      ).rejects.toThrow(/settings_known_key/);
    });
  });
});
