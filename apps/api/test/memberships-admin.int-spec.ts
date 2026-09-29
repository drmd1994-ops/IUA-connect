import { errorEnvelopeSchema } from '@iua/shared';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  signIn,
  signInAdmin,
  startHarness,
} from './auth-harness';

/** M2 checkpoint 4: admins create, renew, suspend, reinstate and expire memberships. */
describe('membership administration (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string };
  let types: Record<string, string>;
  let number = (Date.now() % 1_000_000_000) + 500_000;

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h);
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  const as = () => bearer(admin.accessToken);
  const details = (body: unknown) => errorEnvelopeSchema.parse(body).error.details;
  const year = () => Number(new Date().toISOString().slice(0, 4));

  /** A member with a membership created by an admin; returns its ID. */
  async function member(type = 'HONORARY_MEMBER', identifier?: string) {
    const email = await createVerifiedUser(h, 'admin-managed');
    const res = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as())
      .send({ email, typeId: types[type], ...(identifier ? { identifier } : {}) })
      .expect(201);
    return { email, id: res.body.membership.id as string, body: res.body };
  }

  const action = (id: string, name: string, body: object = {}) =>
    h.http().post(`/api/v1/admin/memberships/${id}/${name}`).set(as()).send(body);

  /** Moves the end date into the past, as if the year had ended. */
  const lapse = (id: string) =>
    h.db.query(
      `UPDATE memberships SET start_date = DATE '2024-01-01', end_date = DATE '2024-12-31' WHERE id = $1`,
      [id],
    );

  it('is admin-only on every route', async () => {
    const { id } = await member();
    const base = '/api/v1/admin/memberships';
    await expectAdminOnly(h, 'get', base);
    await expectAdminOnly(h, 'get', `${base}/${id}`);
    await expectAdminOnly(h, 'post', base, { email: 'x@example.test', typeId: types.STUDENT });
    for (const name of ['renew', 'reinstate', 'expire']) {
      await expectAdminOnly(h, 'post', `${base}/${id}/${name}`, {});
    }
    await expectAdminOnly(h, 'post', `${base}/${id}/suspend`, { reason: 'x' });
    await expectAdminOnly(h, 'patch', `${base}/${id}/payment-status`, { paymentStatus: 'PAID' });
  });

  it('creates memberships by hand, including honorary ones', async () => {
    const honorary = await member();
    expect(honorary.body).toMatchObject({
      membership: {
        type: { key: 'HONORARY_MEMBER' },
        status: 'ACTIVE',
        endDate: `${year()}-12-31`,
        source: 'MANUAL',
        identifierOnFile: false,
      },
      history: [{ event: 'CREATED', toStatus: 'ACTIVE', details: { type: 'HONORARY_MEMBER' } }],
    });

    const certificate = String(++number);
    const full = await member('FULL_MEMBER', certificate);
    expect(full.body.membership.identifierOnFile).toBe(true);
    expect(JSON.stringify(full.body)).not.toContain(certificate);

    // The same number can't be used twice; the type's rules apply.
    const other = await createVerifiedUser(h, 'dup');
    const dup = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as())
      .send({ email: other, typeId: types.FULL_MEMBER, identifier: certificate })
      .expect(409);
    expect(details(dup.body)).toEqual([{ field: 'identifier', code: 'identifierInUse' }]);
    await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as())
      .send({ email: other, typeId: types.FULL_MEMBER })
      .expect(400);
    const again = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as())
      .send({ email: honorary.email, typeId: types.STUDENT })
      .expect(409);
    expect(details(again.body)).toEqual([{ field: 'email', code: 'membershipExists' }]);
    await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as())
      .send({ email: 'nobody-here@example.test', typeId: types.STUDENT })
      .expect(404);

    // The member sees it.
    const { accessToken } = await signIn(h, honorary.email);
    const mine = await h.http().get('/api/v1/me/membership').set(bearer(accessToken)).expect(200);
    expect(mine.body.membership).toMatchObject({
      status: 'ACTIVE',
      type: { key: 'HONORARY_MEMBER' },
    });
  });

  it('suspends with a reason and reinstates', async () => {
    const { id } = await member();
    await action(id, 'suspend', {}).expect(400);
    const suspended = await action(id, 'suspend', { reason: 'Unpaid dues' }).expect(200);
    expect(suspended.body.membership.status).toBe('SUSPENDED');
    const twice = await action(id, 'suspend', { reason: 'Again' }).expect(422);
    expect(details(twice.body)).toEqual([{ code: 'alreadySuspended' }]);

    const reinstated = await action(id, 'reinstate').expect(200);
    expect(reinstated.body.membership.status).toBe('ACTIVE');
    await action(id, 'reinstate').expect(422);
    expect(reinstated.body.history.slice(0, 2)).toMatchObject([
      { event: 'REINSTATED', fromStatus: 'SUSPENDED', toStatus: 'ACTIVE' },
      { event: 'SUSPENDED', fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason: 'Unpaid dues' },
    ]);
  });

  it('renews for the next calendar year, or this year once lapsed', async () => {
    const { id } = await member();
    const renewed = await action(id, 'renew', { reason: 'Paid' }).expect(200);
    expect(renewed.body.membership.endDate).toBe(`${year() + 1}-12-31`);
    expect(renewed.body.history[0]).toMatchObject({
      event: 'RENEWED',
      details: { endDate: `${year() + 1}-12-31` },
      reason: 'Paid',
    });

    const lapsed = await member();
    await lapse(lapsed.id);
    const before = await h.http().get(`/api/v1/admin/memberships/${lapsed.id}`).set(as());
    expect(before.body.membership.status).toBe('EXPIRED');
    const back = await action(lapsed.id, 'renew').expect(200);
    expect(back.body.membership).toMatchObject({
      status: 'ACTIVE',
      endDate: `${year()}-12-31`,
    });
    expect(back.body.history[0]).toMatchObject({ fromStatus: 'EXPIRED', toStatus: 'ACTIVE' });
  });

  it('expires a membership from today', async () => {
    const { id } = await member();
    const expired = await action(id, 'expire', { reason: 'Left the association' }).expect(200);
    expect(expired.body.membership.status).toBe('EXPIRED');
    expect(expired.body.membership.endDate < expired.body.membership.startDate).toBe(false);
    expect(expired.body.history[0]).toMatchObject({
      event: 'EXPIRED',
      fromStatus: 'ACTIVE',
      toStatus: 'EXPIRED',
    });
    const again = await action(id, 'expire').expect(422);
    expect(details(again.body)).toEqual([{ code: 'alreadyExpired' }]);
  });

  it('records payment status by hand', async () => {
    const { id } = await member();
    const res = await h
      .http()
      .patch(`/api/v1/admin/memberships/${id}/payment-status`)
      .set(as())
      .send({ paymentStatus: 'WAIVED', reason: 'Board decision' })
      .expect(200);
    expect(res.body.membership.paymentStatus).toBe('WAIVED');
    expect(res.body.history[0]).toMatchObject({
      event: 'PAYMENT_STATUS_CHANGED',
      details: { from: 'NOT_REQUIRED', to: 'WAIVED' },
    });
    await h
      .http()
      .patch(`/api/v1/admin/memberships/${id}/payment-status`)
      .set(as())
      .send({ paymentStatus: 'WAIVED' })
      .expect(422);
    await h
      .http()
      .patch(`/api/v1/admin/memberships/${id}/payment-status`)
      .set(as())
      .send({ paymentStatus: 'FREE' })
      .expect(400);
  });

  it('lists with filters, search and paging', async () => {
    const active = await member();
    const suspended = await member();
    await action(suspended.id, 'suspend', { reason: 'Test' }).expect(200);
    const expired = await member();
    await lapse(expired.id);

    const ids = async (query: string) => {
      const res = await h.http().get(`/api/v1/admin/memberships?${query}`).set(as()).expect(200);
      return (res.body.items as { id: string }[]).map((i) => i.id);
    };
    const inList = (list: string[]) =>
      [active.id, suspended.id, expired.id].filter((id) => list.includes(id));
    expect(inList(await ids('status=ACTIVE&pageSize=100'))).toEqual([active.id]);
    expect(inList(await ids('status=SUSPENDED&pageSize=100'))).toEqual([suspended.id]);
    expect(inList(await ids('status=EXPIRED&pageSize=100'))).toEqual([expired.id]);
    expect(await ids(`q=${encodeURIComponent(active.email.toUpperCase())}`)).toEqual([active.id]);
    expect(await ids('type=NO_SUCH_TYPE')).toEqual([]);

    const page = await h
      .http()
      .get('/api/v1/admin/memberships?pageSize=2&page=1')
      .set(as())
      .expect(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBeGreaterThanOrEqual(3);
    await h.http().get('/api/v1/admin/memberships?pageSize=1000').set(as()).expect(400);
  });

  it('audits every change', async () => {
    const { id } = await member();
    await action(id, 'suspend', { reason: 'Test' }).expect(200);
    await action(id, 'reinstate').expect(200);
    await action(id, 'renew').expect(200);
    const { rows } = await h.db.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY at`,
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual([
      'membership.admin.create',
      'membership.admin.suspended',
      'membership.admin.reinstated',
      'membership.admin.renewed',
    ]);
  });
});
