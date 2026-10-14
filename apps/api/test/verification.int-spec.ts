import { errorEnvelopeSchema } from '@medconnect/shared';
import { JobQueue } from '../src/infra/jobs/job-queue';
import {
  VERIFICATION_EXPIRY_JOB,
  VerificationExpiryJob,
} from '../src/modules/verification/verification-expiry.job';
import {
  type Harness,
  STRONG_PASSWORD,
  bearer,
  createVerifiedUser,
  grantRole,
  signInAdmin,
  signIn,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/**
 * M17 step 3: the platform verifies physicians and medical students by itself. A person asks; a
 * reviewer (physicians.verify) compares what the register shows and decides. Numbers are never
 * returned; a student's confirmation is gone once decided on.
 */
describe('verification by the platform (integration)', () => {
  let h: Harness;
  let reviewer: { accessToken: string; userId: string; email: string };
  let schoolId: string;

  beforeAll(async () => {
    h = await startHarness();
    reviewer = await signInWithMfa(h, 'verifier', (email) => grantRole(h, email, 'VERIFIER'));
    const schools = await h.http().get('/api/v1/medical-schools').expect(200);
    expect(schools.body.items.length).toBeGreaterThanOrEqual(6);
    schoolId = schools.body.items[0].id;
  });

  afterAll(async () => {
    await h.close();
  });

  const error = (body: unknown) => errorEnvelopeSchema.parse(body).error;
  const firstCode = (body: unknown) => error(body).details?.[0]?.code;
  let counter = Date.now() % 1_000_000_000;
  /** A fresh, unused number (tests share one database). */
  const newNumber = () => String(++counter);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

  /** A new account with a named profile, not verified. */
  async function person(label = 'person') {
    const email = await createVerifiedUser(h, label);
    const { accessToken } = await signIn(h, email);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: 'Noa', lastName: 'Fictional' })
      .expect(200);
    const me = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
    const as = (token: string) => ({
      get: (path: string) => h.http().get(path).set(bearer(token)),
      post: (path: string, body?: object) =>
        h
          .http()
          .post(path)
          .set(bearer(token))
          .send(body ?? {}),
    });
    return { email, accessToken, userId: me.body.id as string, ...as(accessToken) };
  }

  const review = {
    queue: (state = 'PENDING') =>
      h
        .http()
        .get(`/api/v1/physician-verifications?state=${state}`)
        .set(bearer(reviewer.accessToken)),
    decide: (id: string, body: object) =>
      h
        .http()
        .post(`/api/v1/physician-verifications/${id}/decisions`)
        .set(bearer(reviewer.accessToken))
        .send(body),
  };

  it('nobody asked yet: not asked, and not verified', async () => {
    const p = await person();
    const res = await p.get('/api/v1/me/verification').expect(200);
    expect(res.body).toMatchObject({ status: 'NOT_ASKED', canAsk: true, latest: null });
    const me = await p.get('/api/v1/me').expect(200);
    expect(me.body.verified).toBe(false);
  });

  it('a physician asks, the reviewer checks the register, and the person is verified', async () => {
    const p = await person('physician');
    const licence = newNumber();
    const sent = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence: ` ${licence} `, note: 'Hi' })
      .expect(201);
    expect(sent.body).toMatchObject({ state: 'PENDING', licenceProvided: true });
    expect(JSON.stringify(sent.body)).not.toContain(licence);
    expect(h.mailer.count(p.email, 'physicianVerificationReceived')).toBe(1);

    const mine = await p.get('/api/v1/me/verification').expect(200);
    expect(mine.body).toMatchObject({ status: 'WAITING', canAsk: false });

    const queue = await review.queue().expect(200);
    const item = queue.body.items.find((i: { id: string }) => i.id === sent.body.id);
    expect(item).toMatchObject({ kind: 'PHYSICIAN', person: { firstName: 'Noa' }, note: 'Hi' });
    expect(JSON.stringify(queue.body)).not.toContain(licence);

    // A wrong number from the register: refused to approve, and nothing changes.
    const wrong = await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: newNumber(),
      })
      .expect(422);
    expect(error(wrong.body).details).toEqual([
      { field: 'registerLicence', code: 'licenceDoesNotMatch' },
    ]);
    // A suspended licence is not approved either.
    await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'SUSPENDED',
        registerLicence: licence,
      })
      .expect(422);

    const approved = await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: licence,
      })
      .expect(200);
    expect(approved.body).toMatchObject({ state: 'APPROVED' });
    expect(approved.body.findings).toEqual([
      expect.objectContaining({ registerStatus: 'ACTIVE_PERMANENT', licenceMatches: true }),
    ]);

    const after = await p.get('/api/v1/me/verification').expect(200);
    expect(after.body).toMatchObject({
      status: 'VERIFIED',
      verifiedAs: 'PHYSICIAN',
      byOrganisation: false,
    });
    const until = new Date(after.body.verifiedUntil);
    expect(until.getUTCFullYear()).toBe(new Date().getUTCFullYear() + 2);
    const me = await p.get('/api/v1/me').expect(200);
    expect(me.body.verified).toBe(true);
    expect(h.mailer.last(p.email, 'physicianVerificationApproved')?.params).toMatchObject({
      as: 'a physician',
    });

    // The failed comparisons are in the audit log, with no number in them.
    const audit = await h.db.query(
      `SELECT action, changes::text AS changes FROM audit_logs
       WHERE entity_id = $1 ORDER BY at`,
      [sent.body.id],
    );
    expect(audit.rows.map((r: { action: string }) => r.action)).toEqual([
      'physician.verification.submit',
      'physician.verification.compare',
      'physician.verification.compare',
      'physician.verification.decide',
    ]);
    expect(audit.rows.map((r: { changes: string }) => r.changes).join()).not.toContain(licence);
  });

  it('a specialist: the certificate must match too', async () => {
    const p = await person('specialist');
    const licence = newNumber();
    const certificate = newNumber();
    const sent = await p
      .post('/api/v1/me/verification', { kind: 'SPECIALIST', licence, certificate })
      .expect(201);
    const missing = await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: licence,
      })
      .expect(422);
    expect(firstCode(missing.body)).toBe('registerCertificateRequired');
    await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_TEMPORARY',
        registerLicence: licence,
        registerCertificate: certificate,
      })
      .expect(200);
    const after = await p.get('/api/v1/me/verification').expect(200);
    expect(after.body.verifiedAs).toBe('SPECIALIST');
  });

  it('refused with a reason, answered, and asked again', async () => {
    const p = await person('refused');
    const licence = newNumber();
    const sent = await p.post('/api/v1/me/verification', { kind: 'RESIDENT', licence }).expect(201);
    await review.decide(sent.body.id, { decision: 'REJECT' }).expect(400);
    await review
      .decide(sent.body.id, { decision: 'REJECT', reason: 'Not found in the register' })
      .expect(200);
    const after = await p.get('/api/v1/me/verification').expect(200);
    expect(after.body).toMatchObject({ status: 'REFUSED', canAsk: true });
    expect(after.body.latest.decisions).toEqual([
      expect.objectContaining({ decision: 'REJECT', reason: 'Not found in the register' }),
    ]);
    expect(h.mailer.last(p.email, 'physicianVerificationRejected')?.params).toMatchObject({
      reason: 'Not found in the register',
    });
    // Deciding twice is refused.
    await review.decide(sent.body.id, { decision: 'REJECT', reason: 'again' }).expect(422);

    // The answer: the same number, with a note. The reviewer sees the earlier request.
    const again = await p
      .post('/api/v1/me/verification', {
        kind: 'RESIDENT',
        licence,
        note: 'My licence was issued last month',
      })
      .expect(201);
    const one = await h
      .http()
      .get(`/api/v1/physician-verifications/${again.body.id}`)
      .set(bearer(reviewer.accessToken))
      .expect(200);
    expect(one.body.earlier).toEqual([expect.objectContaining({ state: 'REJECTED' })]);
  });

  it('one request at a time, a number for one person, and the number checked', async () => {
    const p = await person('rules');
    const licence = newNumber();
    await p.post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence }).expect(201);
    const twice = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence })
      .expect(409);
    expect(firstCode(twice.body)).toBe('verificationOpen');

    const other = await person('other');
    const taken = await other
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence })
      .expect(409);
    expect(error(taken.body).details).toEqual([{ field: 'licence', code: 'licenceInUse' }]);
    const bad = await other
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence: '12ab' })
      .expect(400);
    expect(error(bad.body).details).toEqual([{ field: 'licence', code: 'numberInvalid' }]);
    const none = await other.post('/api/v1/me/verification', { kind: 'SPECIALIST', licence: '1' });
    expect(none.status).toBe(400);
    expect(firstCode(none.body)).toBe('certificateRequired');

    // Without a name in the profile, the reviewer could not look the person up.
    const email = await createVerifiedUser(h, 'nameless');
    const { accessToken } = await signIn(h, email);
    const nameless = await h
      .http()
      .post('/api/v1/me/verification')
      .set(bearer(accessToken))
      .send({ kind: 'PHYSICIAN', licence: newNumber() })
      .expect(422);
    expect(firstCode(nameless.body)).toBe('profileIncomplete');
  });

  it('withdrawn by the person', async () => {
    const p = await person('withdraws');
    await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence: newNumber() })
      .expect(201);
    const back = await p.post('/api/v1/me/verification/withdraw').expect(200);
    expect(back.body.state).toBe('WITHDRAWN');
    await p.post('/api/v1/me/verification/withdraw').expect(422);
    const after = await p.get('/api/v1/me/verification').expect(200);
    expect(after.body).toMatchObject({ status: 'NOT_ASKED', canAsk: true });
  });

  it('a student: the confirmation is seen by the reviewer only, and deleted once decided', async () => {
    const p = await person('student');
    // Without the confirmation, or with a number, it is refused.
    const graduation = `${new Date().getUTCFullYear() + 3}-06-30`;
    const noDoc = await p
      .post('/api/v1/me/verification', {
        kind: 'STUDENT',
        schoolId,
        expectedGraduation: graduation,
      })
      .expect(400);
    expect(firstCode(noDoc.body)).toBe('documentRequired');

    const upload = await h
      .http()
      .post('/api/v1/me/verification/document')
      .set(bearer(p.accessToken))
      .attach('file', pdf, 'confirmation.pdf')
      .expect(201);
    const documentFileId = upload.body.id as string;

    // Someone else's upload cannot be named.
    const other = await person('other-student');
    const foreign = await other
      .post('/api/v1/me/verification', {
        kind: 'STUDENT',
        schoolId,
        expectedGraduation: graduation,
        documentFileId,
      })
      .expect(400);
    expect(firstCode(foreign.body)).toBe('unknownDocument');

    const sent = await p
      .post('/api/v1/me/verification', {
        kind: 'STUDENT',
        schoolId,
        expectedGraduation: graduation,
        documentFileId,
      })
      .expect(201);
    expect(sent.body).toMatchObject({ documentHeld: true, licenceProvided: false });

    // Staff who upload files cannot open it; the person can; the reviewer through the request.
    const staff = await signInWithMfa(h, 'editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
    );
    await h
      .http()
      .get(`/api/v1/files/${documentFileId}/url`)
      .set(bearer(staff.accessToken))
      .expect(404);
    await h
      .http()
      .get(`/api/v1/files/${documentFileId}/url`)
      .set(bearer(p.accessToken))
      .expect(200);
    await h
      .http()
      .get(`/api/v1/files/${documentFileId}/url`)
      .set(bearer(reviewer.accessToken))
      .expect(404);
    const link = await h
      .http()
      .get(`/api/v1/physician-verifications/${sent.body.id}/document`)
      .set(bearer(reviewer.accessToken))
      .expect(200);
    expect(link.body.url).toContain(documentFileId);
    const reads = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_logs
       WHERE action = 'physician.verification.document.read' AND entity_id = $1`,
      [sent.body.id],
    );
    expect(reads.rows[0].n).toBe(1);

    await review.decide(sent.body.id, { decision: 'APPROVE' }).expect(200);
    const files = await h.db.query('SELECT count(*)::int AS n FROM files WHERE id = $1', [
      documentFileId,
    ]);
    expect(files.rows[0].n).toBe(0);
    const after = await p.get('/api/v1/me/verification').expect(200);
    expect(after.body).toMatchObject({ status: 'VERIFIED', verifiedAs: 'STUDENT' });
    expect(after.body.verifiedUntil.slice(0, 10)).toBe(graduation);
    expect(after.body.latest.documentHeld).toBe(false);
    expect(h.mailer.last(p.email, 'physicianVerificationApproved')?.params).toMatchObject({
      as: 'a medical student',
    });
  });

  it('only reviewers review, and nobody their own request', async () => {
    const p = await person('outsider');
    await p.get('/api/v1/physician-verifications').expect(403);

    // A reviewer's own request is not in their queue and looks missing.
    const ownLicence = newNumber();
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(reviewer.accessToken))
      .send({ firstName: 'Rina', lastName: 'Reviewer' })
      .expect(200);
    const mine = await h
      .http()
      .post('/api/v1/me/verification')
      .set(bearer(reviewer.accessToken))
      .send({ kind: 'PHYSICIAN', licence: ownLicence })
      .expect(201);
    const queue = await review.queue().expect(200);
    expect(queue.body.items.map((i: { id: string }) => i.id)).not.toContain(mine.body.id);
    await review
      .decide(mine.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: ownLicence,
      })
      .expect(404);
  });

  it('a reviewer ends a verification; it closes at once', async () => {
    const p = await person('revoked');
    const licence = newNumber();
    const sent = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence })
      .expect(201);
    await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: licence,
      })
      .expect(200);
    const revoke = (body: object) =>
      h
        .http()
        .post(`/api/v1/physician-verifications/people/${p.userId}/revoke`)
        .set(bearer(reviewer.accessToken))
        .send(body);
    await revoke({}).expect(400);
    await revoke({ reason: 'The register shows the licence suspended' }).expect(204);
    const me = await p.get('/api/v1/me').expect(200);
    expect(me.body.verified).toBe(false);
    const after = await p.get('/api/v1/me/verification').expect(200);
    expect(after.body).toMatchObject({ status: 'REVOKED', canAsk: true });
    expect(h.mailer.count(p.email, 'physicianVerificationRevoked')).toBe(1);
    await revoke({ reason: 'again' }).expect(422);
    // The number stays with this person: nobody else can use it.
    const other = await person('copycat');
    await other.post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence }).expect(409);
  });

  it('withdrawn by a reviewer: an organisation accepting them opens no other door', async () => {
    const p = await person('withdrawn-then-member');
    const licence = newNumber();
    const sent = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence })
      .expect(201);
    await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: licence,
      })
      .expect(200);
    await h
      .http()
      .post(`/api/v1/physician-verifications/people/${p.userId}/revoke`)
      .set(bearer(reviewer.accessToken))
      .send({ reason: 'Licence suspended' })
      .expect(204);

    const office = await signInAdmin(h, 'office');
    const types = await h.http().get('/api/v1/membership-types').expect(200);
    const student = (types.body.items as { key: string; id: string }[]).find(
      (t) => t.key === 'STUDENT',
    )!;
    await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(office.accessToken))
      .send({ email: p.email, typeId: student.id })
      .expect(201);
    const me = await p.get('/api/v1/me').expect(200);
    expect(me.body.verified).toBe(false);
  });

  it('a verification past its date is closed at once, before any job runs', async () => {
    const p = await person('expired');
    const licence = newNumber();
    const sent = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence })
      .expect(201);
    await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: licence,
      })
      .expect(200);
    await h.db.query(
      `UPDATE users SET verified_until = now() - interval '1 minute' WHERE id = $1`,
      [p.userId],
    );
    const me = await p.get('/api/v1/me').expect(200);
    expect(me.body.verified).toBe(false);
    const after = await p.get('/api/v1/me/verification').expect(200);
    expect(after.body).toMatchObject({ status: 'EXPIRED', canAsk: true });
    // Renewing with the same number is allowed, and approving it verifies again.
    const renew = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence })
      .expect(201);
    await review
      .decide(renew.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: licence,
      })
      .expect(200);
    const renewed = await p.get('/api/v1/me/verification').expect(200);
    expect(renewed.body.status).toBe('VERIFIED');
  });

  it('someone an organisation vouches for has nothing to ask', async () => {
    const p = await person('vouched');
    await h.db.query(
      `UPDATE users SET verified_at = now(), verified_as = 'PHYSICIAN' WHERE id = $1`,
      [p.userId],
    );
    const mine = await p.get('/api/v1/me/verification').expect(200);
    expect(mine.body).toMatchObject({ status: 'VERIFIED', byOrganisation: true, canAsk: false });
    const asked = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence: newNumber() })
      .expect(422);
    expect(firstCode(asked.body)).toBe('alreadyVerified');
  });

  /** A physician approved now, whose verification then ends in this many days. */
  async function approvedEndingIn(days: number, label: string) {
    const p = await person(label);
    const licence = newNumber();
    const sent = await p
      .post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence })
      .expect(201);
    await review
      .decide(sent.body.id, {
        decision: 'APPROVE',
        registerStatus: 'ACTIVE_PERMANENT',
        registerLicence: licence,
      })
      .expect(200);
    await h.db.query(
      `UPDATE users SET verified_until = now() + make_interval(days => $2) WHERE id = $1`,
      [p.userId, days],
    );
    return { ...p, licence };
  }

  it('looking again: told once a month before, and ended on the date', async () => {
    const soon = await approvedEndingIn(20, 'ends-soon');
    const later = await approvedEndingIn(90, 'ends-later');
    const job = h.app.get(VerificationExpiryJob);

    await job.run();
    await job.run();
    expect(h.mailer.count(soon.email, 'physicianVerificationExpiring')).toBe(1);
    expect(h.mailer.count(later.email, 'physicianVerificationExpiring')).toBe(0);
    // In the renewal window: may ask again while still verified.
    const mine = await soon.get('/api/v1/me/verification').expect(200);
    expect(mine.body).toMatchObject({ status: 'VERIFIED', canAsk: true });

    // The date passes: the scheduled job ends it.
    await h.db.query(`UPDATE users SET verified_until = now() - interval '1 hour' WHERE id = $1`, [
      soon.userId,
    ]);
    await h.app.get(JobQueue).runNow(VERIFICATION_EXPIRY_JOB);
    const user = await h.db.query(
      'SELECT verified_at, verified_as, verified_until FROM users WHERE id = $1',
      [soon.userId],
    );
    expect(user.rows[0]).toEqual({ verified_at: null, verified_as: null, verified_until: null });
    const after = await soon.get('/api/v1/me/verification').expect(200);
    expect(after.body).toMatchObject({ status: 'EXPIRED', canAsk: true });
    expect(h.mailer.count(soon.email, 'physicianVerificationExpired')).toBe(1);
    await job.run();
    expect(h.mailer.count(soon.email, 'physicianVerificationExpired')).toBe(1);
  });

  it('looking again: someone who already asked to renew is not reminded', async () => {
    const p = await approvedEndingIn(10, 'renewing');
    await p.post('/api/v1/me/verification', { kind: 'PHYSICIAN', licence: p.licence }).expect(201);
    await h.app.get(VerificationExpiryJob).run();
    expect(h.mailer.count(p.email, 'physicianVerificationExpiring')).toBe(0);
  });

  describe('inviting a colleague', () => {
    const invite = (token: string, email: string) =>
      h.http().post('/api/v1/me/invitations').set(bearer(token)).send({ email });
    const counts = async (token: string) =>
      (await h.http().get('/api/v1/me/invitations').set(bearer(token)).expect(200)).body;

    it('only a verified person invites; the invitation gives nothing', async () => {
      const unverified = await person('not-yet');
      const refused = await invite(unverified.accessToken, 'someone@example.test').expect(403);
      expect(firstCode(refused.body)).toBe('verifiedOnly');

      const inviter = await approvedEndingIn(400, 'inviter');
      const colleague = `colleague-${Date.now()}@example.test`;
      await invite(inviter.accessToken, colleague).expect(202);
      const email = h.mailer.last(colleague, 'platformInvitation');
      expect(email?.params).toMatchObject({ inviter: 'Noa Fictional' });
      expect(await counts(inviter.accessToken)).toMatchObject({ sent: 1, joined: 0 });

      // Twice within a month: counted, not sent again.
      await invite(inviter.accessToken, colleague.toUpperCase()).expect(202);
      expect(h.mailer.count(colleague, 'platformInvitation')).toBe(1);

      // The colleague joins: counted as joined, and not verified by it.
      await h
        .http()
        .post('/api/v1/auth/register')
        .send({ email: colleague, password: STRONG_PASSWORD, locale: 'en' })
        .expect(202);
      expect(await counts(inviter.accessToken)).toMatchObject({ sent: 2, joined: 2 });
      const row = await h.db.query('SELECT verified_at FROM users WHERE email = $1', [colleague]);
      expect(row.rows[0].verified_at).toBeNull();
    });

    it('someone already here: the same answer, no email, never counted as joined', async () => {
      const inviter = await approvedEndingIn(400, 'inviter-2');
      const existing = await person('already-here');
      await invite(inviter.accessToken, existing.email).expect(202);
      expect(h.mailer.count(existing.email, 'platformInvitation')).toBe(0);
      expect(await counts(inviter.accessToken)).toMatchObject({ sent: 1, joined: 0 });
    });
  });
});
