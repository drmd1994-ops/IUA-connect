import { errorEnvelopeSchema } from '@iua/shared';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantDepartmentRole,
  signIn,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M2 checkpoint 3: apply → department director → the organisation’s admin → membership. */
describe('membership workflow (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string };
  let types: Record<string, string>;

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

  const error = (body: unknown) => errorEnvelopeSchema.parse(body).error;
  let certificate = Date.now() % 1_000_000_000;
  /** A fresh, unused number (tests share one database). */
  const newNumber = () => String(++certificate);

  /** A new hospital with one department. */
  async function place() {
    const hospital = await h
      .http()
      .post('/api/v1/admin/institutions/hospitals')
      .set(bearer(admin.accessToken))
      .send({ nameHe: 'בית חולים', nameEn: 'Test Hospital', cityHe: 'עיר', cityEn: 'Town' })
      .expect(201);
    const department = await h
      .http()
      .post(`/api/v1/admin/institutions/hospitals/${hospital.body.id}/departments`)
      .set(bearer(admin.accessToken))
      .send({ nameHe: 'אורולוגיה', nameEn: 'Urology' })
      .expect(201);
    return { hospitalId: hospital.body.id as string, departmentId: department.body.id as string };
  }

  async function director(departmentId: string) {
    return signInWithMfa(h, 'director', (email) =>
      grantDepartmentRole(h, email, 'DEPARTMENT_DIRECTOR', departmentId),
    );
  }

  /** A verified member with a named profile. */
  async function applicant(label = 'applicant') {
    const email = await createVerifiedUser(h, label);
    const { accessToken } = await signIn(h, email);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: 'Dana', lastName: 'Fictional' })
      .expect(200);
    const apply = (body: object) =>
      h.http().post('/api/v1/verification-requests').set(bearer(accessToken)).send(body);
    return { email, accessToken, apply };
  }

  const decide = (token: string, id: string, body: object) =>
    h.http().post(`/api/v1/verification-requests/${id}/decisions`).set(bearer(token)).send(body);

  const queue = (token: string, stage: 'director' | 'admin') =>
    h.http().get(`/api/v1/verification-requests?stage=${stage}`).set(bearer(token));

  it('takes a full member from application to an active membership', async () => {
    const { hospitalId, departmentId } = await place();
    const boss = await director(departmentId);
    const member = await applicant();
    const number = newNumber();

    const applied = await member
      .apply({ typeId: types.FULL_MEMBER, hospitalId, departmentId, identifier: ` ${number} ` })
      .expect(201);
    expect(applied.body).toMatchObject({
      state: 'PENDING_DIRECTOR',
      type: { key: 'FULL_MEMBER' },
      department: { id: departmentId },
      identifierProvided: true,
      decisions: [],
    });
    expect(JSON.stringify(applied.body)).not.toContain(number);
    expect(h.mailer.count(member.email, 'membershipApplicationReceived')).toBe(1);
    const id = applied.body.id as string;

    // The director sees it in their queue (never the number), the admin doesn't yet.
    const directorQueue = await queue(boss.accessToken, 'director').expect(200);
    const item = (directorQueue.body.items as { id: string }[]).find((i) => i.id === id);
    expect(item).toMatchObject({
      applicant: { email: member.email, firstName: 'Dana', lastName: 'Fictional' },
      identifierProvided: true,
      flags: [],
    });
    expect(JSON.stringify(directorQueue.body)).not.toContain(number);
    const adminQueue = await queue(admin.accessToken, 'admin').expect(200);
    expect((adminQueue.body.items as { id: string }[]).map((i) => i.id)).not.toContain(id);

    const approved1 = await decide(boss.accessToken, id, { decision: 'APPROVE' }).expect(200);
    expect(approved1.body.state).toBe('PENDING_ADMIN');
    expect(h.mailer.count(member.email, 'membershipDirectorApproved')).toBe(1);

    const approved2 = await decide(admin.accessToken, id, {
      decision: 'APPROVE',
      reason: 'Welcome',
    }).expect(200);
    expect(approved2.body).toMatchObject({
      state: 'APPROVED',
      closedAt: expect.any(String),
      decisions: [
        { stage: 'DIRECTOR', decision: 'APPROVE', reason: null },
        { stage: 'ADMIN', decision: 'APPROVE', reason: 'Welcome' },
      ],
    });

    const mine = await h
      .http()
      .get('/api/v1/me/membership')
      .set(bearer(member.accessToken))
      .expect(200);
    const year = new Date().getUTCFullYear();
    expect(mine.body.membership).toMatchObject({
      type: { key: 'FULL_MEMBER' },
      status: 'ACTIVE',
      endDate: expect.stringMatching(/-12-31$/),
      paymentStatus: 'NOT_REQUIRED',
    });
    expect(Number(mine.body.membership.endDate.slice(0, 4))).toBeGreaterThanOrEqual(year);
    expect(mine.body.history).toEqual([
      expect.objectContaining({ event: 'CREATED', fromStatus: null, toStatus: 'ACTIVE' }),
    ]);
    const email = h.mailer.last(member.email, 'membershipApproved');
    expect(email?.params).toMatchObject({ typeName: 'Full member' });

    // Stored encrypted with a hash; never in the audit log.
    const stored = await h.db.query<{ identifier_enc: string; identifier_hash: string }>(
      `SELECT m.identifier_enc, m.identifier_hash FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE u.email = $1`,
      [member.email],
    );
    expect(stored.rows[0]!.identifier_enc).not.toContain(number);
    expect(stored.rows[0]!.identifier_hash).not.toContain(number);
    const audit = await h.db.query(
      `SELECT action, changes FROM audit_logs WHERE entity_id = $1 ORDER BY at`,
      [id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'membership.application.submit',
      'membership.application.decide',
      'membership.application.decide',
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(number);
  });

  it('sends students straight to the admin, without a number', async () => {
    const member = await applicant('student');
    const res = await member.apply({ typeId: types.STUDENT }).expect(201);
    expect(res.body).toMatchObject({ state: 'PENDING_ADMIN', identifierProvided: false });
    const adminQueue = await queue(admin.accessToken, 'admin').expect(200);
    expect(
      (adminQueue.body.items as { id: string; flags: string[] }[]).find(
        (i) => i.id === res.body.id,
      ),
    ).toMatchObject({ flags: [] });
    await decide(admin.accessToken, res.body.id, { decision: 'APPROVE' }).expect(200);

    await (
      await applicant('student')
    )
      .apply({ typeId: types.STUDENT, identifier: '123' })
      .expect(400);
  });

  it('flags applications that no director can decide', async () => {
    const lonely = await place();
    const member = await applicant();
    const res = await member
      .apply({ typeId: types.RESIDENT, ...lonely, identifier: newNumber() })
      .expect(201);
    expect(res.body.state).toBe('PENDING_ADMIN');
    const adminQueue = await queue(admin.accessToken, 'admin').expect(200);
    expect(
      (adminQueue.body.items as { id: string }[]).find((i) => i.id === res.body.id),
    ).toMatchObject({ flags: ['NO_DIRECTOR'] });

    // A director applying to the department they alone direct goes to the admin, flagged.
    const own = await place();
    const boss = await director(own.departmentId);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(boss.accessToken))
      .send({ firstName: 'Avi', lastName: 'Director' })
      .expect(200);
    const mine = await h
      .http()
      .post('/api/v1/verification-requests')
      .set(bearer(boss.accessToken))
      .send({ typeId: types.FULL_MEMBER, ...own, identifier: newNumber() })
      .expect(201);
    expect(mine.body.state).toBe('PENDING_ADMIN');
    const flagged = await queue(admin.accessToken, 'admin').expect(200);
    expect(
      (flagged.body.items as { id: string }[]).find((i) => i.id === mine.body.id),
    ).toMatchObject({ flags: ['APPLICANT_IS_DIRECTOR'] });
  });

  it('keeps directors to their own departments and away from their own application', async () => {
    const a = await place();
    const b = await place();
    const bossA = await director(a.departmentId);
    const bossB = await director(b.departmentId);
    const member = await applicant();
    const res = await member
      .apply({ typeId: types.NON_FULL_MEMBER, ...a, identifier: newNumber() })
      .expect(201);
    expect(res.body.state).toBe('PENDING_DIRECTOR');

    const other = await queue(bossB.accessToken, 'director').expect(200);
    expect((other.body.items as { id: string }[]).map((i) => i.id)).not.toContain(res.body.id);
    await decide(bossB.accessToken, res.body.id, { decision: 'APPROVE' }).expect(404);
    // A director has no admin stage.
    await queue(bossA.accessToken, 'admin').expect(403);

    // Two directors: when one applies, the other decides, and the applicant can't.
    const coDirector = await director(a.departmentId);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(coDirector.accessToken))
      .send({ firstName: 'Co', lastName: 'Director' })
      .expect(200);
    const own = await h
      .http()
      .post('/api/v1/verification-requests')
      .set(bearer(coDirector.accessToken))
      .send({ typeId: types.FULL_MEMBER, ...a, identifier: newNumber() })
      .expect(201);
    expect(own.body.state).toBe('PENDING_DIRECTOR');
    const ownQueue = await queue(coDirector.accessToken, 'director').expect(200);
    expect((ownQueue.body.items as { id: string }[]).map((i) => i.id)).not.toContain(own.body.id);
    const selfDecision = await decide(coDirector.accessToken, own.body.id, {
      decision: 'APPROVE',
    }).expect(403);
    expect(error(selfDecision.body).details).toEqual([{ code: 'ownApplication' }]);
    await decide(bossA.accessToken, own.body.id, { decision: 'APPROVE' }).expect(200);
  });

  it('requires a reason to reject, and tells the applicant', async () => {
    const { hospitalId, departmentId } = await place();
    const boss = await director(departmentId);
    const member = await applicant();
    const res = await member
      .apply({ typeId: types.FULL_MEMBER, hospitalId, departmentId, identifier: newNumber() })
      .expect(201);

    await decide(boss.accessToken, res.body.id, { decision: 'REJECT' }).expect(400);
    await decide(boss.accessToken, res.body.id, { decision: 'REJECT', reason: '   ' }).expect(400);
    await decide(boss.accessToken, res.body.id, {
      decision: 'REJECT',
      reason: 'Not a member of this department',
    }).expect(200);

    expect(h.mailer.last(member.email, 'membershipRejected')?.params).toMatchObject({
      reason: 'Not a member of this department',
    });
    const mine = await h
      .http()
      .get('/api/v1/verification-requests/mine')
      .set(bearer(member.accessToken))
      .expect(200);
    expect(mine.body.items[0]).toMatchObject({
      state: 'REJECTED',
      decisions: [
        { stage: 'DIRECTOR', decision: 'REJECT', reason: 'Not a member of this department' },
      ],
    });
    // Closed: no further decisions.
    const closed = await decide(admin.accessToken, res.body.id, { decision: 'APPROVE' }).expect(
      422,
    );
    expect(error(closed.body).details).toEqual([{ code: 'applicationClosed' }]);
    // The applicant may apply again.
    await member
      .apply({ typeId: types.FULL_MEMBER, hospitalId, departmentId, identifier: newNumber() })
      .expect(201);
  });

  it('allows one open application, which the applicant can withdraw', async () => {
    const { hospitalId, departmentId } = await place();
    const member = await applicant();
    const first = await member
      .apply({ typeId: types.RESIDENT, hospitalId, departmentId, identifier: newNumber() })
      .expect(201);
    const second = await member.apply({ typeId: types.STUDENT }).expect(409);
    expect(error(second.body).details).toEqual([{ field: 'typeId', code: 'applicationOpen' }]);

    const withdrawn = await h
      .http()
      .post(`/api/v1/verification-requests/${first.body.id}/withdraw`)
      .set(bearer(member.accessToken))
      .expect(200);
    expect(withdrawn.body.state).toBe('WITHDRAWN');
    await h
      .http()
      .post(`/api/v1/verification-requests/${first.body.id}/withdraw`)
      .set(bearer(member.accessToken))
      .expect(422);
    await member.apply({ typeId: types.STUDENT }).expect(201);

    // Someone else's application can't be withdrawn (it looks missing).
    const stranger = await applicant();
    await h
      .http()
      .post(`/api/v1/verification-requests/${first.body.id}/withdraw`)
      .set(bearer(stranger.accessToken))
      .expect(404);
  });

  it('refuses a number that another member or open application already uses', async () => {
    const number = newNumber();
    const place1 = await place();
    await (
      await applicant()
    )
      .apply({ typeId: types.FULL_MEMBER, ...place1, identifier: number })
      .expect(201);
    const taken = await (
      await applicant()
    )
      .apply({ typeId: types.FULL_MEMBER, ...place1, identifier: number })
      .expect(409);
    expect(error(taken.body).details).toEqual([{ field: 'identifier', code: 'identifierInUse' }]);
    // The same digits as a licence number are a different identifier.
    await (
      await applicant()
    )
      .apply({ typeId: types.RESIDENT, ...place1, identifier: number })
      .expect(201);
  });

  it('validates the application', async () => {
    const { hospitalId, departmentId } = await place();
    const other = await place();
    const member = await applicant();
    const detail = async (body: object, status = 400) =>
      error((await member.apply(body).expect(status)).body).details;

    expect(await detail({ typeId: types.FULL_MEMBER, hospitalId, departmentId })).toEqual([
      { field: 'identifier', code: 'identifierRequired' },
    ]);
    expect(
      await detail({ typeId: types.FULL_MEMBER, hospitalId, departmentId, identifier: 'MD-1' }),
    ).toEqual([{ field: 'identifier', code: 'identifierInvalid' }]);
    expect(await detail({ typeId: types.RESIDENT, identifier: '1' })).toEqual([
      { field: 'departmentId', code: 'departmentRequired' },
    ]);
    expect(
      await detail({
        typeId: types.RESIDENT,
        hospitalId: other.hospitalId,
        departmentId,
        identifier: '1',
      }),
    ).toEqual([{ field: 'departmentId', code: 'unknownDepartment' }]);
    expect(await detail({ typeId: types.HONORARY_MEMBER })).toEqual([
      { field: 'typeId', code: 'unknownMembershipType' },
    ]);

    const email = await createVerifiedUser(h, 'no-profile');
    const { accessToken } = await signIn(h, email);
    const res = await h
      .http()
      .post('/api/v1/verification-requests')
      .set(bearer(accessToken))
      .send({ typeId: types.STUDENT })
      .expect(422);
    expect(error(res.body).details).toEqual([{ field: 'profile', code: 'profileIncomplete' }]);
  });

  it('checks who may review', async () => {
    const member = await applicant();
    const app = await member.apply({ typeId: types.STUDENT }).expect(201);

    await h.http().get('/api/v1/verification-requests?stage=admin').expect(401);
    await h.http().post('/api/v1/verification-requests').send({}).expect(401);
    await h.http().get('/api/v1/me/membership').expect(401);
    await queue(member.accessToken, 'admin').expect(403);
    await queue(member.accessToken, 'director').expect(403);
    await decide(member.accessToken, app.body.id, { decision: 'APPROVE' }).expect(403);
    await h
      .http()
      .get('/api/v1/verification-requests?stage=everyone')
      .set(bearer(admin.accessToken))
      .expect(400);

    // Roles count only in a session that completed MFA.
    const { departmentId } = await place();
    const noMfa = await createVerifiedUser(h, 'director-no-mfa');
    await grantDepartmentRole(h, noMfa, 'DEPARTMENT_DIRECTOR', departmentId);
    await queue((await signIn(h, noMfa)).accessToken, 'director').expect(403);
  });

  it('keeps decisions and membership history append-only', async () => {
    await expect(h.db.query(`UPDATE verification_decisions SET reason = 'x'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(h.db.query(`DELETE FROM membership_history`)).rejects.toThrow(/append-only/);
  });

  it('still removes history and decisions when the account itself is deleted', async () => {
    const member = await applicant('deleted');
    const app = await member.apply({ typeId: types.STUDENT }).expect(201);
    await decide(admin.accessToken, app.body.id, { decision: 'APPROVE' }).expect(200);
    await h.db.query('DELETE FROM users WHERE email = $1', [member.email]);
    const left = await h.db.query(
      `SELECT (SELECT count(*) FROM verification_decisions WHERE request_id = $1)::int AS decisions,
              (SELECT count(*) FROM verification_requests WHERE id = $1)::int AS requests`,
      [app.body.id],
    );
    expect(left.rows[0]).toEqual({ decisions: 0, requests: 0 });
  });
});
