import { errorEnvelopeSchema } from '@medconnect/shared';
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

describe('identity: registration, sign-in, sessions (M1)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  const code = (body: unknown) => errorEnvelopeSchema.parse(body).error.code;

  describe('registration and email verification', () => {
    it('registers, requires verification, then signs in', async () => {
      const email = uniqueEmail('reg');
      await h
        .http()
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD, locale: 'he' })
        .expect(202, { status: 'accepted' });

      const verification = h.mailer.last(email, 'verifyEmail');
      expect(verification?.locale).toBe('he');
      expect((verification!.params as { link: string }).link).toMatch(
        /^http:\/\/localhost:3001\/he\/verify-email\?token=/,
      );

      const early = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(403);
      expect(code(early.body)).toBe('EMAIL_NOT_VERIFIED');

      const token = h.mailer.token(email, 'verifyEmail');
      await h.http().post('/api/v1/auth/verify-email').send({ token }).expect(200);
      const reused = await h.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
      expect(code(reused.body)).toBe('INVALID_TOKEN');

      const { accessToken } = await signIn(h, email);
      const me = await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({
        email,
        emailVerified: true,
        locale: 'he',
        roles: [],
        permissions: [],
        mfaEnabled: false,
        mfaEnrollmentRequired: false,
      });
    });

    it('does not reveal existing accounts on registration', async () => {
      const email = await createVerifiedUser(h, 'dup');
      const res = await h
        .http()
        .post('/api/v1/auth/register')
        .send({ email: email.toUpperCase(), password: 'another long passphrase 99', locale: 'en' })
        .expect(202);
      expect(res.body).toEqual({ status: 'accepted' });
      expect(h.mailer.count(email, 'accountExists')).toBe(1);
      const { rows } = await h.db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [
        email,
      ]);
      expect(rows[0].n).toBe(1);
    });

    it('rejects weak passwords with field details', async () => {
      const res = await h
        .http()
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail('weak'), password: '000123456789' })
        .expect(400);
      expect(errorEnvelopeSchema.parse(res.body).error.details).toEqual([
        { field: 'password', code: 'PASSWORD_TOO_COMMON' },
      ]);
    });

    it('rejects unknown fields (mass assignment)', async () => {
      const res = await h
        .http()
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail(), password: STRONG_PASSWORD, emailVerifiedAt: '2026-01-01' })
        .expect(400);
      expect(code(res.body)).toBe('VALIDATION_FAILED');
    });

    it('resend always answers the same', async () => {
      for (const email of [uniqueEmail('nobody'), await createVerifiedUser(h, 'resend')]) {
        await h
          .http()
          .post('/api/v1/auth/verify-email/resend')
          .send({ email })
          .expect(202, { status: 'accepted' });
      }
    });
  });

  describe('sign-in', () => {
    it('sets the refresh, CSRF and device cookies with safe attributes', async () => {
      const email = await createVerifiedUser(h, 'cookies');
      const res = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);
      expect(res.body).toMatchObject({ mfaRequired: false, expiresIn: 600 });
      const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
      expect(cookies).toMatch(
        /iua_rt=[^;]+; Max-Age=\d+; Path=\/api\/v1\/auth; [^\n]*HttpOnly; Secure; SameSite=Strict/,
      );
      expect(cookies).toMatch(
        /iua_csrf=[^;]+; Max-Age=\d+; Path=\/; [^\n]*Secure; SameSite=Strict/,
      );
      expect(cookies).not.toMatch(/iua_csrf=[^\n]*HttpOnly/);
      expect(cookies).toMatch(/iua_did=[^;]+;[^\n]*HttpOnly; Secure; SameSite=Strict/);
      expect(JSON.stringify(res.body)).not.toContain('iua_rt');
    });

    it('answers unknown emails and wrong passwords identically', async () => {
      const email = await createVerifiedUser(h, 'same');
      const unknown = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: STRONG_PASSWORD })
        .expect(401);
      const wrong = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'not the right passphrase' })
        .expect(401);
      const strip = (body: { error: { correlationId?: string } }) => ({
        ...body.error,
        correlationId: undefined,
      });
      expect(strip(unknown.body)).toEqual(strip(wrong.body));
      expect(code(wrong.body)).toBe('INVALID_CREDENTIALS');
    });

    it('locks the account after 5 failures, with an email, then unlocks after the window', async () => {
      const email = await createVerifiedUser(h, 'lock');
      for (let i = 0; i < 5; i++) {
        await h
          .http()
          .post('/api/v1/auth/login')
          .send({ email, password: `wrong passphrase number ${i}` })
          .expect(401);
      }
      expect(h.mailer.last(email, 'accountLocked')?.params).toEqual({ minutes: 15 });

      // Even the right password is refused while locked, with the same generic answer.
      const locked = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(401);
      expect(code(locked.body)).toBe('INVALID_CREDENTIALS');

      const { rows } = await h.db.query(
        `SELECT locked_until > now() + interval '14 minutes' AS locked, lockout_count
         FROM users WHERE email = $1`,
        [email],
      );
      expect(rows[0]).toEqual({ locked: true, lockout_count: 1 });
      const audit = await h.db.query(
        `SELECT count(*)::int AS n FROM audit_logs a JOIN users u ON a.entity_id = u.id::text
         WHERE u.email = $1 AND a.action = 'auth.lockout'`,
        [email],
      );
      expect(audit.rows[0].n).toBe(1);

      // The window passes.
      await h.db.query(
        `UPDATE users SET locked_until = now() - interval '1 second' WHERE email = $1`,
        [email],
      );
      await signIn(h, email);
      const after = await h.db.query(
        'SELECT failed_login_count, lockout_count FROM users WHERE email = $1',
        [email],
      );
      expect(after.rows[0]).toEqual({ failed_login_count: 0, lockout_count: 0 });
    });

    it('doubles the lock on the second lockout', async () => {
      const email = await createVerifiedUser(h, 'lock2');
      await h.db.query(
        `UPDATE users SET lockout_count = 1, failed_login_count = 4 WHERE email = $1`,
        [email],
      );
      await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'still the wrong passphrase' })
        .expect(401);
      expect(h.mailer.last(email, 'accountLocked')?.params).toEqual({ minutes: 30 });
    });

    it('emails about sign-ins from a new device, but not from a known one', async () => {
      const email = await createVerifiedUser(h, 'device');
      const first = await signIn(h, email);
      expect(h.mailer.count(email, 'newDevice')).toBe(0); // first device ever
      await signIn(h, email, first.jar); // same browser
      expect(h.mailer.count(email, 'newDevice')).toBe(0);
      await signIn(h, email); // another browser
      expect(h.mailer.count(email, 'newDevice')).toBe(1);
      expect(h.mailer.last(email, 'newDevice')?.params).toMatchObject({
        device: 'Chrome on Windows',
      });
    });
  });

  describe('refresh tokens', () => {
    it('requires the CSRF header', async () => {
      const { jar } = await signIn(h, await createVerifiedUser(h, 'csrf'));
      const res = await h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', jar.header())
        .expect(403);
      expect(code(res.body)).toBe('CSRF_INVALID');
      await h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', jar.header())
        .set('X-CSRF-Token', 'wrong-value-000000')
        .expect(403);
    });

    it('rotates the refresh token on every use', async () => {
      const { jar } = await signIn(h, await createVerifiedUser(h, 'rotate'));
      const before = jar.get('iua_rt');
      const res = await h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', jar.header())
        .set('X-CSRF-Token', jar.get('iua_csrf')!)
        .expect(200);
      jar.store(res);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(jar.get('iua_rt')).not.toBe(before);
    });

    it('detects reuse: an old refresh token revokes the whole session', async () => {
      const email = await createVerifiedUser(h, 'reuse');
      const { jar, accessToken } = await signIn(h, email);
      const stolen = new CookieJar();
      stolen.set('iua_rt', jar.get('iua_rt')!);
      stolen.set('iua_csrf', 'attacker-csrf-token-000');

      // The legitimate client refreshes (token 1 → token 2).
      const ok = await h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', jar.header())
        .set('X-CSRF-Token', jar.get('iua_csrf')!)
        .expect(200);
      jar.store(ok);
      // Longer ago than the few seconds in which a lost answer may be repeated.
      await h.db.query(
        `UPDATE refresh_tokens SET used_at = used_at - interval '11 seconds'
         WHERE used_at IS NOT NULL
           AND session_id IN (SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
                              WHERE u.email = $1)`,
        [email],
      );

      // The attacker replays token 1.
      await h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', stolen.header())
        .set('X-CSRF-Token', 'attacker-csrf-token-000')
        .expect(401);

      // The whole family is dead: token 2 and the access token no longer work.
      await h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', jar.header())
        .set('X-CSRF-Token', jar.get('iua_csrf')!)
        .expect(401);
      await h.http().get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(401);

      const { rows } = await h.db.query(
        `SELECT s.revoked_reason FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
        [email],
      );
      expect(rows).toEqual([{ revoked_reason: 'refresh_reuse' }]);
      const audit = await h.db.query(
        `SELECT count(*)::int AS n FROM audit_logs a JOIN users u ON a.actor_user_id = u.id
         WHERE u.email = $1 AND a.action = 'auth.refresh.reuse_detected'`,
        [email],
      );
      expect(audit.rows[0].n).toBe(1);
    });

    describe('a renewal whose answer never reached the browser', () => {
      const refresh = (jar: CookieJar) =>
        h
          .http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', jar.header())
          .set('X-CSRF-Token', jar.get('iua_csrf')!);
      const sessionState = async (email: string) =>
        (
          await h.db.query<{ revoked_reason: string | null }>(
            `SELECT s.revoked_reason FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE u.email = $1`,
            [email],
          )
        ).rows;

      it('can be repeated within seconds, and the token that was lost is used up', async () => {
        const email = await createVerifiedUser(h, 'lost-answer');
        const { jar } = await signIn(h, email);
        // The page reloads mid-renewal: the server rotates, the browser keeps token 1.
        const lost = new CookieJar();
        lost.set('iua_csrf', jar.get('iua_csrf')!);
        lost.set('iua_rt', jar.get('iua_rt')!);
        lost.store(await refresh(lost).expect(200)); // token 2, never delivered
        const undelivered = lost.get('iua_rt')!;

        // The browser presents token 1 again and stays signed in, with token 3.
        const again = await refresh(jar).expect(200);
        jar.store(again);
        expect(jar.get('iua_rt')).not.toBe(undelivered);
        await h
          .http()
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${again.body.accessToken}`)
          .expect(200);
        expect(await sessionState(email)).toEqual([{ revoked_reason: null }]);
        const audit = await h.db.query(
          `SELECT count(*)::int AS n FROM audit_logs a JOIN users u ON a.actor_user_id = u.id
           WHERE u.email = $1 AND a.action = 'auth.refresh.lost_answer'`,
          [email],
        );
        expect(audit.rows[0].n).toBe(1);

        // Token 3 works as usual. Token 2, which nobody should hold, ends the session.
        jar.store(await refresh(jar).expect(200));
        await refresh(lost).expect(401);
        expect(await sessionState(email)).toEqual([{ revoked_reason: 'refresh_reuse' }]);
      });

      it('is not accepted once the replacing token was used: that is a stolen token', async () => {
        const email = await createVerifiedUser(h, 'stolen-fast');
        const { jar } = await signIn(h, email);
        const stolen = new CookieJar();
        stolen.set('iua_csrf', jar.get('iua_csrf')!);
        stolen.set('iua_rt', jar.get('iua_rt')!);
        // The legitimate client moves on twice (token 1 → 2 → 3), all within seconds.
        jar.store(await refresh(jar).expect(200));
        jar.store(await refresh(jar).expect(200));

        await refresh(stolen).expect(401);
        expect(await sessionState(email)).toEqual([{ revoked_reason: 'refresh_reuse' }]);
        await refresh(jar).expect(401);
      });

      it('gives a thief who is quick no lasting hold: the owner’s next renewal ends it', async () => {
        const email = await createVerifiedUser(h, 'stolen-quick');
        const { jar } = await signIn(h, email);
        const stolen = new CookieJar();
        stolen.set('iua_csrf', jar.get('iua_csrf')!);
        stolen.set('iua_rt', jar.get('iua_rt')!);
        jar.store(await refresh(jar).expect(200)); // the owner holds token 2
        stolen.store(await refresh(stolen).expect(200)); // within seconds: token 2 is used up

        // Later, the owner presents token 2: it was used, so the whole session ends.
        await h.db.query(
          `UPDATE refresh_tokens SET used_at = used_at - interval '11 seconds'
           WHERE used_at IS NOT NULL
             AND session_id IN (SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
                                WHERE u.email = $1)`,
          [email],
        );
        await refresh(jar).expect(401);
        expect(await sessionState(email)).toEqual([{ revoked_reason: 'refresh_reuse' }]);
        await refresh(stolen).expect(401);
      });
    });

    it('ends idle sessions', async () => {
      const email = await createVerifiedUser(h, 'idle');
      const { accessToken, jar } = await signIn(h, email);
      await h.db.query(
        `UPDATE sessions SET last_seen_at = now() - interval '4 days'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
        [email],
      );
      await h.http().get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
      const res = await h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', jar.header())
        .set('X-CSRF-Token', jar.get('iua_csrf')!)
        .expect(401);
      expect(code(res.body)).toBe('SESSION_EXPIRED');
    });
  });

  describe('sign-out', () => {
    it('revokes the session and clears the cookies', async () => {
      const { jar, accessToken } = await signIn(h, await createVerifiedUser(h, 'logout'));
      await h.http().post('/api/v1/auth/logout').set('Cookie', jar.header()).expect(403); // no CSRF
      const res = await h
        .http()
        .post('/api/v1/auth/logout')
        .set('Cookie', jar.header())
        .set('X-CSRF-Token', jar.get('iua_csrf')!)
        .expect(204);
      expect((res.headers['set-cookie'] as unknown as string[]).join('\n')).toMatch(
        /iua_rt=;.*Expires=Thu, 01 Jan 1970/,
      );
      await h.http().get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });
  });

  describe('roles and MFA', () => {
    it('gives admin-role holders short sessions and no permissions until MFA', async () => {
      const email = await createVerifiedUser(h, 'admin');
      await grantRole(h, email, 'PLATFORM_ADMIN');
      const { accessToken } = await signIn(h, email);

      const me = await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({
        roles: ['PLATFORM_ADMIN'],
        permissions: [],
        mfaEnrollmentRequired: true,
        session: { mfa: false },
      });

      const { rows } = await h.db.query(
        `SELECT extract(epoch FROM (expires_at - created_at))::int AS lifetime, idle_timeout_sec
         FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
        [email],
      );
      expect(rows[0]).toEqual({ lifetime: 4 * 3600, idle_timeout_sec: 15 * 60 });
    });

    it('gives members 7-day sessions with a 3-day idle limit', async () => {
      const email = await createVerifiedUser(h, 'member');
      await signIn(h, email);
      const { rows } = await h.db.query(
        `SELECT extract(epoch FROM (expires_at - created_at))::int AS lifetime, idle_timeout_sec
         FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
        [email],
      );
      expect(rows[0]).toEqual({ lifetime: 7 * 24 * 3600, idle_timeout_sec: 3 * 24 * 3600 });
    });
  });

  describe('secrets hygiene', () => {
    it('stores only hashes and never writes passwords or tokens to the audit log', async () => {
      const email = await createVerifiedUser(h, 'hygiene');
      const { jar } = await signIn(h, email);
      const { rows: users } = await h.db.query('SELECT password_hash FROM users WHERE email = $1', [
        email,
      ]);
      expect(users[0].password_hash).toMatch(/^\$argon2id\$/);

      const refresh = jar.get('iua_rt')!;
      const { rows: tokens } = await h.db.query(
        'SELECT count(*)::int AS n FROM refresh_tokens WHERE token_hash = $1',
        [refresh],
      );
      expect(tokens[0].n).toBe(0); // the plain token is not stored

      const { rows: audit } = await h.db.query(`SELECT changes::text AS c FROM audit_logs`);
      const all = audit.map((r) => r.c ?? '').join('\n');
      expect(all).not.toContain(STRONG_PASSWORD);
      expect(all).not.toContain(refresh);
    });
  });
});
