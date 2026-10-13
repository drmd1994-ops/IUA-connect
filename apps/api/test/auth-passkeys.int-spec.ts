import { errorEnvelopeSchema } from '@iua/shared';
import { Secret, TOTP } from 'otpauth';
import {
  type Harness,
  STRONG_PASSWORD,
  createVerifiedUser,
  grantRole,
  signIn,
  startHarness,
} from './auth-harness';
import { SoftAuthenticator } from './soft-authenticator';

describe('identity: passkeys (M1b)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  const code = (body: unknown) => errorEnvelopeSchema.parse(body).error.code;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function addPasskey(
    accessToken: string,
    authenticator: SoftAuthenticator,
    name = 'Laptop',
  ) {
    const options = await h
      .http()
      .post('/api/v1/auth/passkeys/registration/options')
      .set(bearer(accessToken))
      .expect(200);
    return h
      .http()
      .post('/api/v1/auth/passkeys/registration/verify')
      .set(bearer(accessToken))
      .send({ response: authenticator.register(options.body), name });
  }

  async function passkeySignIn(authenticator: SoftAuthenticator, overrides = {}) {
    const options = await h.http().post('/api/v1/auth/passkeys/authentication/options').expect(200);
    return h
      .http()
      .post('/api/v1/auth/passkeys/authentication/verify')
      .send({ response: authenticator.assert(options.body, overrides) });
  }

  /** A member with one passkey; returns the pieces the tests need. */
  async function memberWithPasskey(label: string, authenticator = new SoftAuthenticator()) {
    const email = await createVerifiedUser(h, label);
    const { accessToken } = await signIn(h, email);
    const added = await addPasskey(accessToken, authenticator);
    expect(added.status).toBe(200);
    return { email, accessToken, authenticator, passkeyId: added.body.id as string };
  }

  describe('adding a passkey', () => {
    it('requires user verification and discoverable credentials, and excludes existing ones', async () => {
      const { accessToken, authenticator } = await memberWithPasskey('pk-options');
      const options = await h
        .http()
        .post('/api/v1/auth/passkeys/registration/options')
        .set(bearer(accessToken))
        .expect(200);
      expect(options.body.rp).toEqual({ name: 'IUA Connect', id: 'localhost' });
      expect(options.body.authenticatorSelection).toMatchObject({
        residentKey: 'required',
        userVerification: 'required',
      });
      expect(options.body.attestation).toBe('none');
      expect(options.body.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([
        authenticator.id,
      ]);
    });

    it('stores only the public key, lists it, and makes the session MFA-verified', async () => {
      const { email, accessToken, passkeyId } = await memberWithPasskey(
        'pk-add',
        new SoftAuthenticator({ synced: true }),
      );
      const list = await h.http().get('/api/v1/auth/passkeys').set(bearer(accessToken)).expect(200);
      expect(list.body.passkeys).toEqual([
        expect.objectContaining({ id: passkeyId, name: 'Laptop', synced: true, lastUsedAt: null }),
      ]);
      const me = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
      expect(me.body).toMatchObject({ mfaEnabled: true, session: { mfa: true } });

      const audit = await h.db.query(
        `SELECT count(*)::int AS n FROM audit_logs a JOIN users u ON a.actor_user_id = u.id
         WHERE u.email = $1 AND a.action = 'auth.passkey.added'`,
        [email],
      );
      expect(audit.rows[0].n).toBe(1);
    });

    it('needs a recent sign-in or re-authentication', async () => {
      const email = await createVerifiedUser(h, 'pk-reauth-needed');
      const { accessToken } = await signIn(h, email);
      await h.db.query(
        `UPDATE sessions SET reauthenticated_at = now() - interval '10 minutes'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
        [email],
      );
      const res = await h
        .http()
        .post('/api/v1/auth/passkeys/registration/options')
        .set(bearer(accessToken))
        .expect(403);
      expect(code(res.body)).toBe('REAUTHENTICATION_REQUIRED');
    });

    it('refuses a registration response for another user’s challenge, or without user verification', async () => {
      const alice = await signIn(h, await createVerifiedUser(h, 'pk-alice'));
      const bob = await signIn(h, await createVerifiedUser(h, 'pk-bob'));
      const aliceOptions = await h
        .http()
        .post('/api/v1/auth/passkeys/registration/options')
        .set(bearer(alice.accessToken))
        .expect(200);
      const stolen = await h
        .http()
        .post('/api/v1/auth/passkeys/registration/verify')
        .set(bearer(bob.accessToken))
        .send({ response: new SoftAuthenticator().register(aliceOptions.body), name: 'Stolen' })
        .expect(401);
      expect(code(stolen.body)).toBe('PASSKEY_INVALID');

      const noUv = await addPasskey(
        bob.accessToken,
        new SoftAuthenticator({ userVerification: false }),
      );
      expect(noUv.status).toBe(401);
    });
  });

  describe('signing in with a passkey', () => {
    it('signs in without a password, as an MFA session, with the usual cookies', async () => {
      const { email, authenticator } = await memberWithPasskey('pk-signin');
      const res = await passkeySignIn(authenticator);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ accessToken: expect.any(String), expiresIn: 600 });
      expect((res.headers['set-cookie'] as unknown as string[]).join('\n')).toContain('iua_rt=');
      const me = await h.http().get('/api/v1/me').set(bearer(res.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ email, session: { mfa: true } });

      const list = await h
        .http()
        .get('/api/v1/auth/passkeys')
        .set(bearer(res.body.accessToken))
        .expect(200);
      expect(list.body.passkeys[0].lastUsedAt).not.toBeNull();
    });

    it('refuses a replayed assertion (single-use challenge)', async () => {
      const { authenticator } = await memberWithPasskey('pk-replay');
      const options = await h
        .http()
        .post('/api/v1/auth/passkeys/authentication/options')
        .expect(200);
      const assertion = authenticator.assert(options.body);
      await h
        .http()
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: assertion })
        .expect(200);
      const replay = await h
        .http()
        .post('/api/v1/auth/passkeys/authentication/verify')
        .send({ response: assertion })
        .expect(401);
      expect(code(replay.body)).toBe('PASSKEY_INVALID');
    });

    it('refuses assertions made for another site (origin or relying party)', async () => {
      const { authenticator } = await memberWithPasskey('pk-origin');
      authenticator.origin = 'https://evil.example';
      expect((await passkeySignIn(authenticator)).status).toBe(401);
      authenticator.origin = 'http://localhost:3001';
      authenticator.rpId = 'evil.example';
      expect((await passkeySignIn(authenticator)).status).toBe(401);
    });

    it('refuses unknown passkeys and missing user verification', async () => {
      expect((await passkeySignIn(new SoftAuthenticator())).status).toBe(401);
      const { authenticator } = await memberWithPasskey('pk-no-uv');
      authenticator.userVerification = false;
      expect((await passkeySignIn(authenticator)).status).toBe(401);
    });

    it('refuses a counter that goes backwards (possible cloned key) and audits it', async () => {
      const { authenticator } = await memberWithPasskey(
        'pk-counter',
        new SoftAuthenticator({ counter: 5 }),
      );
      expect((await passkeySignIn(authenticator)).status).toBe(200); // counter 6
      expect((await passkeySignIn(authenticator, { counter: 3 })).status).toBe(401);
      const { rows } = await h.db.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'auth.passkey.counter_regression'
         AND changes->>'method' = 'passkey' AND at > now() - interval '1 minute'`,
      );
      expect(rows[0].n).toBeGreaterThanOrEqual(1);
    });

    it('tells the password sign-in that a passkey can complete it', async () => {
      const { email } = await memberWithPasskey('pk-methods');
      const res = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);
      expect(res.body).toMatchObject({ mfaRequired: true, mfaMethods: ['passkey'] });
    });
  });

  describe('managing passkeys', () => {
    it('renames and removes only the user’s own passkeys', async () => {
      const mine = await memberWithPasskey('pk-mine');
      const theirs = await memberWithPasskey('pk-theirs');
      await h
        .http()
        .patch(`/api/v1/auth/passkeys/${mine.passkeyId}`)
        .set(bearer(mine.accessToken))
        .send({ name: 'Phone' })
        .expect(200);
      await h
        .http()
        .patch(`/api/v1/auth/passkeys/${theirs.passkeyId}`)
        .set(bearer(mine.accessToken))
        .send({ name: 'Hijacked' })
        .expect(404);
      await h
        .http()
        .delete(`/api/v1/auth/passkeys/${theirs.passkeyId}`)
        .set(bearer(mine.accessToken))
        .expect(404);
      await h
        .http()
        .delete(`/api/v1/auth/passkeys/${mine.passkeyId}`)
        .set(bearer(mine.accessToken))
        .expect(204);
      expect((await passkeySignIn(mine.authenticator)).status).toBe(401);
    });
  });

  describe('administrators', () => {
    it('can meet the MFA requirement with a passkey alone, and must keep one factor', async () => {
      const email = await createVerifiedUser(h, 'pk-admin');
      await grantRole(h, email, 'PLATFORM_ADMIN');
      const { accessToken } = await signIn(h, email);
      const before = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
      expect(before.body).toMatchObject({ permissions: [], mfaEnrollmentRequired: true });

      const authenticator = new SoftAuthenticator();
      const added = await addPasskey(accessToken, authenticator);
      const after = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
      expect(after.body.mfaEnrollmentRequired).toBe(false);
      expect(after.body.permissions).toContain('audit.read');

      const viaPasskey = await passkeySignIn(authenticator);
      const me = await h
        .http()
        .get('/api/v1/me')
        .set(bearer(viaPasskey.body.accessToken))
        .expect(200);
      expect(me.body.permissions).toContain('audit.read');

      const last = await h
        .http()
        .delete(`/api/v1/auth/passkeys/${added.body.id}`)
        .set(bearer(accessToken))
        .expect(422);
      expect(code(last.body)).toBe('MFA_REQUIRED_BY_ROLE');
    });

    it('may turn off the authenticator app while a passkey remains', async () => {
      const email = await createVerifiedUser(h, 'pk-admin-totp');
      await grantRole(h, email, 'PLATFORM_ADMIN');
      const { accessToken } = await signIn(h, email);
      const setup = await h
        .http()
        .post('/api/v1/auth/mfa/totp/setup')
        .set(bearer(accessToken))
        .expect(200);
      const totp = new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(setup.body.secret),
      });
      await h
        .http()
        .post('/api/v1/auth/mfa/totp/confirm')
        .set(bearer(accessToken))
        .send({ factorId: setup.body.factorId, code: totp.generate() })
        .expect(200);
      const status = await h.http().get('/api/v1/auth/mfa').set(bearer(accessToken)).expect(200);
      expect(status.body.canDisable).toBe(false);

      await addPasskey(accessToken, new SoftAuthenticator());
      const now = await h.http().get('/api/v1/auth/mfa').set(bearer(accessToken)).expect(200);
      expect(now.body.canDisable).toBe(true);
      await h
        .http()
        .delete(`/api/v1/auth/mfa/${setup.body.factorId}`)
        .set(bearer(accessToken))
        .expect(204);
    });
  });

  describe('re-authentication', () => {
    it('accepts the user’s own passkey, not someone else’s, and requires it for passkey-only accounts', async () => {
      const user = await memberWithPasskey('pk-reauth');
      const stranger = await memberWithPasskey('pk-reauth-stranger');
      const reauthWith = async (authenticator: SoftAuthenticator) => {
        const options = await h
          .http()
          .post('/api/v1/auth/passkeys/authentication/options')
          .expect(200);
        return h
          .http()
          .post('/api/v1/auth/reauthenticate')
          .set(bearer(user.accessToken))
          .send({ passkey: authenticator.assert(options.body) });
      };
      expect((await reauthWith(stranger.authenticator)).status).toBe(401);
      expect((await reauthWith(user.authenticator)).status).toBe(200);

      const passwordOnly = await h
        .http()
        .post('/api/v1/auth/reauthenticate')
        .set(bearer(user.accessToken))
        .send({ password: STRONG_PASSWORD })
        .expect(401);
      expect(errorEnvelopeSchema.parse(passwordOnly.body).error.details).toEqual([
        { field: 'passkey', code: 'PASSKEY_REQUIRED' },
      ]);
      await h
        .http()
        .post('/api/v1/auth/reauthenticate')
        .set(bearer(user.accessToken))
        .send({ password: STRONG_PASSWORD, passkey: user.authenticator.assert({ challenge: 'x' }) })
        .expect(400); // exactly one of password or passkey
    });
  });
});
