import { errorEnvelopeSchema } from '@iua/shared';
import { Secret, TOTP } from 'otpauth';
import {
  CookieJar,
  type Harness,
  STRONG_PASSWORD,
  createVerifiedUser,
  grantRole,
  signIn,
  startHarness,
  uniqueEmail,
} from './auth-harness';

const NEW_PASSWORD = 'cedar forest after the winter rain';

describe('identity: MFA, re-authentication, passwords, sessions (M1)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  const code = (body: unknown) => errorEnvelopeSchema.parse(body).error.code;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** A current TOTP code for a base32 secret. */
  const totp = (secret: string) =>
    new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).generate();

  /** Lets the same time step be used again (tests run faster than 30 seconds). */
  const forgetUsedSteps = (email: string) =>
    h.db.query(
      `UPDATE mfa_factors SET last_used_step = NULL WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );

  /** Signs up, signs in and enrols TOTP; returns everything a test needs. */
  async function userWithMfa(label: string) {
    const email = await createVerifiedUser(h, label);
    const { accessToken, jar } = await signIn(h, email);
    const setup = await h
      .http()
      .post('/api/v1/auth/mfa/totp/setup')
      .set(bearer(accessToken))
      .expect(200);
    const confirm = await h
      .http()
      .post('/api/v1/auth/mfa/totp/confirm')
      .set(bearer(accessToken))
      .send({ factorId: setup.body.factorId, code: totp(setup.body.secret) })
      .expect(200);
    await forgetUsedSteps(email);
    return {
      email,
      accessToken,
      jar,
      secret: setup.body.secret as string,
      factorId: setup.body.factorId as string,
      recoveryCodes: confirm.body.recoveryCodes as string[],
    };
  }

  async function passwordStep(email: string, jar = new CookieJar(), password = STRONG_PASSWORD) {
    const res = await h
      .http()
      .post('/api/v1/auth/login')
      .set('Cookie', jar.header())
      .send({ email, password })
      .expect(200);
    jar.store(res);
    return res;
  }

  describe('enrolment', () => {
    it('sets up an authenticator app and returns recovery codes once', async () => {
      const email = await createVerifiedUser(h, 'enrol');
      const { accessToken } = await signIn(h, email);
      await h.http().get('/api/v1/auth/mfa').set(bearer(accessToken)).expect(200, {
        enabled: false,
        recoveryCodesRemaining: 0,
        requiredByRole: false,
        canDisable: true,
      });

      const setup = await h
        .http()
        .post('/api/v1/auth/mfa/totp/setup')
        .set(bearer(accessToken))
        .expect(200);
      expect(setup.body.otpauthUri).toMatch(
        /^otpauth:\/\/totp\/IUA%20Connect:.+issuer=IUA%20Connect/,
      );
      expect(setup.body.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/);

      const { rows } = await h.db.query('SELECT secret_encrypted FROM mfa_factors WHERE id = $1', [
        setup.body.factorId,
      ]);
      expect(rows[0].secret_encrypted).not.toContain(setup.body.secret);

      const wrong = await h
        .http()
        .post('/api/v1/auth/mfa/totp/confirm')
        .set(bearer(accessToken))
        .send({ factorId: setup.body.factorId, code: '000000' })
        .expect(401);
      expect(code(wrong.body)).toBe('MFA_INVALID_CODE');

      const ok = await h
        .http()
        .post('/api/v1/auth/mfa/totp/confirm')
        .set(bearer(accessToken))
        .send({ factorId: setup.body.factorId, code: totp(setup.body.secret) })
        .expect(200);
      expect(ok.body.recoveryCodes).toHaveLength(10);

      const me = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
      expect(me.body).toMatchObject({ mfaEnabled: true, session: { mfa: true } });

      const again = await h
        .http()
        .post('/api/v1/auth/mfa/totp/setup')
        .set(bearer(accessToken))
        .expect(409);
      expect(code(again.body)).toBe('MFA_ALREADY_ENABLED');
    });
  });

  describe('sign-in with MFA', () => {
    it('requires a second step and issues no session before it', async () => {
      const user = await userWithMfa('mfa-login');
      const step1 = await passwordStep(user.email);
      expect(step1.body).toEqual({
        mfaRequired: true,
        mfaToken: expect.any(String),
        mfaMethods: ['totp'],
      });
      expect(
        (step1.headers['set-cookie'] as unknown as string[] | undefined)?.join('\n') ?? '',
      ).not.toContain('iua_rt=');

      const wrong = await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: '123456' })
        .expect(401);
      expect(code(wrong.body)).toBe('MFA_INVALID_CODE');

      const ok = await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: totp(user.secret) })
        .expect(200);
      expect((ok.headers['set-cookie'] as unknown as string[]).join('\n')).toContain('iua_rt=');
      const me = await h.http().get('/api/v1/me').set(bearer(ok.body.accessToken)).expect(200);
      expect(me.body.session.mfa).toBe(true);

      // The challenge is single-use.
      const reused = await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: totp(user.secret) })
        .expect(400);
      expect(code(reused.body)).toBe('INVALID_TOKEN');
    });

    it('refuses a code that was already used (replay)', async () => {
      const user = await userWithMfa('replay');
      const first = await passwordStep(user.email);
      const current = totp(user.secret);
      await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: first.body.mfaToken, code: current })
        .expect(200);
      const second = await passwordStep(user.email);
      await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: second.body.mfaToken, code: current })
        .expect(401);
    });

    it('accepts each recovery code once', async () => {
      const user = await userWithMfa('recovery');
      const recovery = user.recoveryCodes[0]!;
      const first = await passwordStep(user.email);
      await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: first.body.mfaToken, code: recovery.toUpperCase() })
        .expect(200);
      const second = await passwordStep(user.email);
      await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: second.body.mfaToken, code: recovery })
        .expect(401);
      const status = await h
        .http()
        .get('/api/v1/auth/mfa')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(status.body.recoveryCodesRemaining).toBe(9);
    });

    it('burns the challenge after 5 wrong codes', async () => {
      const user = await userWithMfa('burn');
      const step1 = await passwordStep(user.email);
      for (let i = 0; i < 4; i++) {
        await h
          .http()
          .post('/api/v1/auth/mfa/verify')
          .send({ mfaToken: step1.body.mfaToken, code: '000000' })
          .expect(401);
      }
      const fifth = await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: '000000' })
        .expect(400);
      expect(code(fifth.body)).toBe('INVALID_TOKEN');
      await h
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: totp(user.secret) })
        .expect(400);
    });
  });

  describe('admin roles', () => {
    it('grant their permissions only after MFA, and MFA can’t be turned off', async () => {
      const email = await createVerifiedUser(h, 'admin-mfa');
      await grantRole(h, email, 'PLATFORM_ADMIN');
      const { accessToken } = await signIn(h, email);
      const before = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
      expect(before.body).toMatchObject({ permissions: [], mfaEnrollmentRequired: true });

      const setup = await h
        .http()
        .post('/api/v1/auth/mfa/totp/setup')
        .set(bearer(accessToken))
        .expect(200);
      await h
        .http()
        .post('/api/v1/auth/mfa/totp/confirm')
        .set(bearer(accessToken))
        .send({ factorId: setup.body.factorId, code: totp(setup.body.secret) })
        .expect(200);

      const after = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
      expect(after.body.mfaEnrollmentRequired).toBe(false);
      expect(after.body.permissions).toEqual(
        expect.arrayContaining(['audit.read', 'users.manage']),
      );

      const disable = await h
        .http()
        .delete(`/api/v1/auth/mfa/${setup.body.factorId}`)
        .set(bearer(accessToken))
        .expect(422);
      expect(code(disable.body)).toBe('MFA_REQUIRED_BY_ROLE');
    });
  });

  describe('re-authentication', () => {
    it('is required for sensitive changes once the sign-in is no longer recent', async () => {
      const user = await userWithMfa('reauth');
      await h.db.query(
        `UPDATE sessions SET reauthenticated_at = now() - interval '10 minutes'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
        [user.email],
      );
      const blocked = await h
        .http()
        .post('/api/v1/auth/mfa/recovery-codes')
        .set(bearer(user.accessToken))
        .expect(403);
      expect(code(blocked.body)).toBe('REAUTHENTICATION_REQUIRED');

      await h
        .http()
        .post('/api/v1/auth/reauthenticate')
        .set(bearer(user.accessToken))
        .send({ password: 'not my password at all' })
        .expect(401);
      const noCode = await h
        .http()
        .post('/api/v1/auth/reauthenticate')
        .set(bearer(user.accessToken))
        .send({ password: STRONG_PASSWORD })
        .expect(401);
      expect(code(noCode.body)).toBe('MFA_INVALID_CODE');
      await h
        .http()
        .post('/api/v1/auth/reauthenticate')
        .set(bearer(user.accessToken))
        .send({ password: STRONG_PASSWORD, code: totp(user.secret) })
        .expect(200);

      const regenerated = await h
        .http()
        .post('/api/v1/auth/mfa/recovery-codes')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(regenerated.body.recoveryCodes).toHaveLength(10);
      expect(regenerated.body.recoveryCodes).not.toContain(user.recoveryCodes[0]);

      await h
        .http()
        .delete(`/api/v1/auth/mfa/${user.factorId}`)
        .set(bearer(user.accessToken))
        .expect(204);
      const me = await h.http().get('/api/v1/me').set(bearer(user.accessToken)).expect(200);
      expect(me.body.mfaEnabled).toBe(false);
    });
  });

  describe('passwords', () => {
    it('changes the password and signs out the other sessions', async () => {
      const email = await createVerifiedUser(h, 'change');
      const current = await signIn(h, email);
      const other = await signIn(h, email);

      const wrong = await h
        .http()
        .post('/api/v1/auth/password/change')
        .set(bearer(current.accessToken))
        .send({ currentPassword: 'wrong wrong wrong wrong', newPassword: NEW_PASSWORD })
        .expect(401);
      expect(code(wrong.body)).toBe('INVALID_CREDENTIALS');
      await h
        .http()
        .post('/api/v1/auth/password/change')
        .set(bearer(current.accessToken))
        .send({ currentPassword: STRONG_PASSWORD, newPassword: 'short' })
        .expect(400);

      await h
        .http()
        .post('/api/v1/auth/password/change')
        .set(bearer(current.accessToken))
        .send({ currentPassword: STRONG_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);
      await h.http().get('/api/v1/me').set(bearer(other.accessToken)).expect(401);
      await h.http().get('/api/v1/me').set(bearer(current.accessToken)).expect(200);
      expect(h.mailer.count(email, 'passwordChanged')).toBe(1);
      await passwordStep(email, new CookieJar(), NEW_PASSWORD);
    });

    it('resets a forgotten password from the emailed link', async () => {
      const email = await createVerifiedUser(h, 'reset');
      const session = await signIn(h, email);
      await h.db.query(
        `UPDATE users SET locked_until = now() + interval '1 hour' WHERE email = $1`,
        [email],
      );

      await h
        .http()
        .post('/api/v1/auth/password/forgot')
        .send({ email: uniqueEmail('nobody') })
        .expect(202);
      await h.http().post('/api/v1/auth/password/forgot').send({ email }).expect(202);
      const token = h.mailer.token(email, 'passwordReset');

      // A weak choice doesn't use up the link.
      await h
        .http()
        .post('/api/v1/auth/password/reset')
        .send({ token, newPassword: '000123456789' })
        .expect(400);
      await h
        .http()
        .post('/api/v1/auth/password/reset')
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);
      const reused = await h
        .http()
        .post('/api/v1/auth/password/reset')
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(400);
      expect(code(reused.body)).toBe('INVALID_TOKEN');

      await h.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(401); // signed out
      await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(401);
      await passwordStep(email, new CookieJar(), NEW_PASSWORD); // lockout cleared too
    });
  });

  describe('sessions', () => {
    it('lists the user’s sessions and revokes them individually or all at once', async () => {
      const email = await createVerifiedUser(h, 'sessions');
      const a = await signIn(h, email);
      const b = await signIn(h, email);
      const c = await signIn(h, email);

      const list = await h
        .http()
        .get('/api/v1/auth/sessions')
        .set(bearer(a.accessToken))
        .expect(200);
      expect(list.body.sessions).toHaveLength(3);
      expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(list.body.sessions[0]).toMatchObject({ device: 'Chrome on Windows' });

      const bId = (await h.http().get('/api/v1/me').set(bearer(b.accessToken))).body.session.id;
      await h.http().delete(`/api/v1/auth/sessions/${bId}`).set(bearer(a.accessToken)).expect(204);
      await h.http().get('/api/v1/me').set(bearer(b.accessToken)).expect(401);

      // Someone else's session is "not found".
      const stranger = await signIn(h, await createVerifiedUser(h, 'stranger'));
      const strangerId = (await h.http().get('/api/v1/me').set(bearer(stranger.accessToken))).body
        .session.id;
      await h
        .http()
        .delete(`/api/v1/auth/sessions/${strangerId}`)
        .set(bearer(a.accessToken))
        .expect(404);
      await h.http().get('/api/v1/me').set(bearer(stranger.accessToken)).expect(200);

      await h
        .http()
        .delete('/api/v1/auth/sessions')
        .set(bearer(a.accessToken))
        .expect(200, { revoked: 1 });
      await h.http().get('/api/v1/me').set(bearer(c.accessToken)).expect(401);
      await h.http().get('/api/v1/me').set(bearer(a.accessToken)).expect(200);
    });
  });
});
