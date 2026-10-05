import {
  CookieJar,
  type Harness,
  STRONG_PASSWORD,
  bearer,
  createVerifiedUser,
  signIn,
  startHarness,
  totpCode,
} from './auth-harness';

/**
 * M14: sign-in for the mobile app (docs/plans/M14-mobile-app.md §5). The app has no cookies:
 * its refresh token travels in the body and is kept in the phone's secure storage. The exit
 * criteria here: the app and the site share accounts and sessions end across both; a refresh
 * token works only the way its own client presents it; reuse is caught as on the web. The
 * web's own suites (auth.int-spec.ts) are the proof that the browser path is unchanged.
 */
describe('sign-in for the mobile app (integration)', () => {
  let h: Harness;
  const PHONE = 'IUAConnect/1.0 (Android 16; Pixel 9)';
  const code = (body: { error?: { code?: string } }) => body.error?.code;
  const appLogin = (email: string, extra: object = {}) =>
    h
      .http()
      .post('/api/v1/auth/login')
      .set('User-Agent', PHONE)
      .send({ email, password: STRONG_PASSWORD, client: 'app', ...extra });
  const appRefresh = (refreshToken: string) =>
    h.http().post('/api/v1/auth/app/refresh').set('User-Agent', PHONE).send({ refreshToken });
  const sessionsOf = (accessToken: string) =>
    h.http().get('/api/v1/auth/sessions').set(bearer(accessToken));
  const sessionRows = async (email: string) =>
    (
      await h.db.query<{
        client: string;
        client_name: string | null;
        revoked_reason: string | null;
        mfa: boolean;
      }>(
        `SELECT s.client::text AS client, s.client_name, s.revoked_reason,
                s.mfa_completed_at IS NOT NULL AS mfa
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE u.email = $1 ORDER BY s.created_at`,
        [email],
      )
    ).rows;
  /** As if the tokens used so far were used longer ago than a lost answer may be repeated. */
  const age = (email: string) =>
    h.db.query(
      `UPDATE refresh_tokens SET used_at = used_at - interval '11 seconds'
       WHERE used_at IS NOT NULL
         AND session_id IN (SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
                            WHERE u.email = $1)`,
      [email],
    );

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('gives the app its tokens in the answer and sets no cookie', async () => {
    const email = await createVerifiedUser(h, 'app');
    const res = await appLogin(email, { deviceName: 'Pixel 9 of Noa' }).expect(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body).toEqual({
      mfaRequired: false,
      accessToken: expect.any(String),
      expiresIn: expect.any(Number),
      refreshToken: expect.any(String),
      sessionExpiresAt: expect.any(String),
      // The server had not seen this phone: the app keeps this for its next sign-in.
      deviceToken: expect.any(String),
    });
    expect(new Date(res.body.sessionExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(await sessionRows(email)).toEqual([
      { client: 'APP', client_name: 'Pixel 9 of Noa', revoked_reason: null, mfa: false },
    ]);

    // The same account, the same API.
    const list = await sessionsOf(res.body.accessToken).expect(200);
    expect(list.body.sessions).toEqual([
      expect.objectContaining({ client: 'APP', device: 'Pixel 9 of Noa', current: true }),
    ]);

    // A phone the server knows gets no new device token.
    const again = await appLogin(email, {
      deviceName: 'Pixel 9 of Noa',
      deviceToken: res.body.deviceToken,
    }).expect(200);
    expect(again.body.deviceToken).toBeUndefined();

    // The sign-in is audited as the app's, and the refresh token is written nowhere readable.
    const audit = await h.db.query<{ changes: unknown }>(
      `SELECT a.changes FROM audit_logs a JOIN users u ON u.id = a.actor_user_id
       WHERE u.email = $1 AND a.action = 'auth.login.success' ORDER BY a.at`,
      [email],
    );
    expect(audit.rows[0]!.changes).toEqual({ client: 'app' });
    const leaked = await h.db.query(
      `SELECT 1 FROM audit_logs WHERE changes::text LIKE $1
       UNION ALL SELECT 1 FROM refresh_tokens WHERE token_hash = $2`,
      [`%${res.body.refreshToken}%`, res.body.refreshToken],
    );
    expect(leaked.rows).toEqual([]);
  });

  it('leaves the browser as it was: a cookie, and no refresh token in the answer', async () => {
    const email = await createVerifiedUser(h, 'web');
    const res = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: STRONG_PASSWORD })
      .expect(200);
    expect(res.body).toEqual({
      mfaRequired: false,
      accessToken: expect.any(String),
      expiresIn: expect.any(Number),
    });
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toContain('iua_rt=');
    expect(cookies).toContain('HttpOnly');
    expect(await sessionRows(email)).toEqual([
      { client: 'WEB', client_name: null, revoked_reason: null, mfa: false },
    ]);
    // What belongs to the app is refused from a browser, and unknown values altogether.
    for (const extra of [{ deviceName: 'A browser' }, { deviceToken: 'x'.repeat(32) }]) {
      await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: STRONG_PASSWORD, ...extra })
        .expect(400);
    }
    await appLogin(email, { client: 'desktop' }).expect(400);
    await appLogin(email, { deviceName: '' }).expect(400);
    await appLogin(email, { deviceName: 'x'.repeat(81) }).expect(400);
  });

  it('rotates the app’s refresh token, and catches a stolen one as on the web', async () => {
    const email = await createVerifiedUser(h, 'app-rotate');
    const first = (await appLogin(email).expect(200)).body;
    const second = await appRefresh(first.refreshToken).expect(200);
    expect(second.headers['set-cookie']).toBeUndefined();
    expect(second.body).toEqual({
      accessToken: expect.any(String),
      expiresIn: expect.any(Number),
      refreshToken: expect.any(String),
      sessionExpiresAt: first.sessionExpiresAt,
    });
    expect(second.body.refreshToken).not.toBe(first.refreshToken);
    await sessionsOf(second.body.accessToken).expect(200);

    // An answer that was lost on its way may be asked for again, for a few seconds.
    const repeated = await appRefresh(first.refreshToken).expect(200);
    expect(repeated.body.refreshToken).not.toBe(second.body.refreshToken);
    // The token whose answer was lost is used up with it.
    await age(email);
    const third = await appRefresh(repeated.body.refreshToken).expect(200);

    // Someone presents an old token later: the whole session ends, for the thief and the owner.
    await age(email);
    expect(code((await appRefresh(first.refreshToken).expect(401)).body)).toBe('UNAUTHENTICATED');
    await appRefresh(third.body.refreshToken).expect(401);
    await sessionsOf(third.body.accessToken).expect(401);
    expect((await sessionRows(email))[0]!.revoked_reason).toBe('refresh_reuse');

    // Nonsense is refused without a word about why.
    await appRefresh('not-a-token-at-all-000000').expect(401);
    await h.http().post('/api/v1/auth/app/refresh').send({}).expect(400);
    await h.http().post('/api/v1/auth/app/refresh').send({ refreshToken: 'short' }).expect(400);
  });

  it('accepts a refresh token only the way its own client presents it', async () => {
    const email = await createVerifiedUser(h, 'app-cross');
    const app = (await appLogin(email).expect(200)).body;
    const { jar } = await signIn(h, email);
    const webRefresh = (cookies: CookieJar) =>
      h
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookies.header())
        .set('X-CSRF-Token', cookies.get('iua_csrf')!);

    // The app's token inside a cookie: refused, with or without the CSRF header.
    const forged = new CookieJar();
    forged.set('iua_rt', app.refreshToken);
    forged.set('iua_csrf', 'attacker-csrf-token-000');
    await webRefresh(forged).expect(401);
    // A browser's token in the app's request, which needs no CSRF header: refused.
    await appRefresh(jar.get('iua_rt')!).expect(401);
    await h
      .http()
      .post('/api/v1/auth/app/logout')
      .send({ refreshToken: jar.get('iua_rt')! })
      .expect(204);

    // Neither refusal used anything up or ended anything: both real owners carry on.
    const stillApp = await appRefresh(app.refreshToken).expect(200);
    const stillWeb = await webRefresh(jar).expect(200);
    expect(stillWeb.body.refreshToken).toBeUndefined();
    expect((await sessionRows(email)).map((row) => row.revoked_reason)).toEqual([null, null]);

    // The site's sign-out with the app's token in a cookie doesn't end the app's session.
    const out = new CookieJar();
    out.set('iua_rt', stillApp.body.refreshToken);
    out.set('iua_csrf', 'same-value-0000000000');
    await h
      .http()
      .post('/api/v1/auth/logout')
      .set('Cookie', out.header())
      .set('X-CSRF-Token', 'same-value-0000000000')
      .expect(204);
    await sessionsOf(stillApp.body.accessToken).expect(200);
  });

  it('ends across the app and the site: sign out, and "sign out" from the other one', async () => {
    const email = await createVerifiedUser(h, 'app-end');
    const app = (await appLogin(email, { deviceName: 'Phone' }).expect(200)).body;
    const web = await signIn(h, email);

    // The site sees the phone in "my sessions" and ends it.
    const list = (await sessionsOf(web.accessToken).expect(200)).body.sessions as {
      id: string;
      client: string;
      device: string;
      current: boolean;
    }[];
    expect(list.map((s) => [s.client, s.current]).sort()).toEqual([
      ['APP', false],
      ['WEB', true],
    ]);
    const phone = list.find((s) => s.client === 'APP')!;
    expect(phone.device).toBe('Phone');
    await h
      .http()
      .delete(`/api/v1/auth/sessions/${phone.id}`)
      .set(bearer(web.accessToken))
      .expect(204);
    await sessionsOf(app.accessToken).expect(401);
    await appRefresh(app.refreshToken).expect(401);

    // The app signs out by itself: its own session ends, the site's does not.
    const again = (await appLogin(email).expect(200)).body;
    await h
      .http()
      .post('/api/v1/auth/app/logout')
      .send({ refreshToken: again.refreshToken })
      .expect(204);
    await sessionsOf(again.accessToken).expect(401);
    await appRefresh(again.refreshToken).expect(401);
    await sessionsOf(web.accessToken).expect(200);
    // Signing out twice, or with nonsense, is still "done".
    await h
      .http()
      .post('/api/v1/auth/app/logout')
      .send({ refreshToken: again.refreshToken })
      .expect(204);

    // A disabled account stops the app at once.
    const last = (await appLogin(email).expect(200)).body;
    await h.db.query(`UPDATE users SET status = 'DISABLED' WHERE email = $1`, [email]);
    await sessionsOf(last.accessToken).expect(401);
    await appRefresh(last.refreshToken).expect(401);
  });

  it('asks the app for the authenticator code too, and counts the session as verified', async () => {
    const email = await createVerifiedUser(h, 'app-mfa');
    const { accessToken } = await signIn(h, email);
    const setup = await h
      .http()
      .post('/api/v1/auth/mfa/totp/setup')
      .set(bearer(accessToken))
      .expect(200);
    await h
      .http()
      .post('/api/v1/auth/mfa/totp/confirm')
      .set(bearer(accessToken))
      .send({ factorId: setup.body.factorId, code: totpCode(setup.body.secret) })
      .expect(200);

    // The code that confirmed the authenticator can't be used twice; as if a new one came up.
    await h.db.query(
      `UPDATE mfa_factors SET last_used_step = NULL
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );

    const step = await appLogin(email, { deviceName: 'Phone' }).expect(200);
    expect(step.headers['set-cookie']).toBeUndefined();
    expect(step.body).toMatchObject({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(step.body.refreshToken).toBeUndefined();
    expect(step.body.accessToken).toBeUndefined();

    await h
      .http()
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: step.body.mfaToken, code: '000000', client: 'app' })
      .expect(401);
    const done = await h
      .http()
      .post('/api/v1/auth/mfa/verify')
      .set('User-Agent', PHONE)
      .send({
        mfaToken: step.body.mfaToken,
        code: totpCode(setup.body.secret),
        client: 'app',
        deviceName: 'Phone',
        deviceToken: step.body.deviceToken,
      })
      .expect(200);
    expect(done.headers['set-cookie']).toBeUndefined();
    expect(done.body).toEqual({
      accessToken: expect.any(String),
      expiresIn: expect.any(Number),
      refreshToken: expect.any(String),
      sessionExpiresAt: expect.any(String),
    });
    expect((await sessionRows(email)).at(-1)).toEqual({
      client: 'APP',
      client_name: 'Phone',
      revoked_reason: null,
      mfa: true,
    });
    await appRefresh(done.body.refreshToken).expect(200);
  });

  it('answers a wrong password to the app exactly as to a browser', async () => {
    const email = await createVerifiedUser(h, 'app-wrong');
    const wrong = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: 'not the password at all 1', client: 'app' })
      .expect(401);
    expect(code(wrong.body)).toBe('INVALID_CREDENTIALS');
    const unknown = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody-here@example.test', password: STRONG_PASSWORD, client: 'app' })
      .expect(401);
    // The same answer whether or not the address has an account.
    expect(code(unknown.body)).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(await sessionRows(email)).toEqual([]);
  });
});
