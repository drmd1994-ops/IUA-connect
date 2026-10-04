import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { uuidv7 } from '@iua/shared';
import { Secret, TOTP } from 'otpauth';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { type EmailMessage, type EmailTemplate, Mailer } from '../src/infra/mailer/mailer';
import { PushProvider } from '../src/infra/push/push-provider';
import { type RateLimitHit, RateLimitStore } from '../src/infra/rate-limit/rate-limit.store';
import { VideoProvider } from '../src/infra/video/video-provider';
import { testEnv } from '../src/testing/test-env';
import { testAppUrl } from './test-db';

/** Collects emails instead of writing them to the outbox. */
export class CapturingMailer extends Mailer {
  readonly sent: EmailMessage[] = [];

  async send<T extends EmailTemplate>(message: EmailMessage<T>): Promise<void> {
    this.sent.push(message);
  }

  last(to: string, template: EmailTemplate): EmailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to && m.template === template);
  }

  count(to: string, template: EmailTemplate): number {
    return this.sent.filter((m) => m.to === to && m.template === template).length;
  }

  /** The ?token= of the last email of this kind to this address. */
  token(to: string, template: EmailTemplate): string {
    const message = this.last(to, template);
    const link = (message?.params as { link?: string } | undefined)?.link;
    if (!link) throw new Error(`No ${template} email to ${to}`);
    return new URL(link).searchParams.get('token')!;
  }
}

/** Counts nothing: most suites sign in far more often than the real limits allow from one IP. */
class UnlimitedRateLimitStore extends RateLimitStore {
  async hit(): Promise<RateLimitHit> {
    return { count: 1, resetInSec: 60 };
  }
}

/** Minimal cookie jar: supertest's agent won't send Secure cookies over plain http. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(response: request.Response): void {
    const header = response.headers['set-cookie'] as unknown as string[] | undefined;
    for (const cookie of header ?? []) {
      const [pair] = cookie.split(';');
      const [name, ...rest] = pair!.split('=');
      const value = rest.join('=');
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(cookie)) this.cookies.delete(name!);
      else this.cookies.set(name!, value);
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

export const STRONG_PASSWORD = 'olive trees near the old port 2026';

export interface Harness {
  app: INestApplication;
  mailer: CapturingMailer;
  db: Client;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/**
 * Starts the full app against the test database. Real rate limits and the real job queue (pg-boss)
 * only when asked for; otherwise jobs run only when a test triggers them. `push` and `video`
 * replace those providers (the app's own send nothing and link to the host).
 */
export async function startHarness(
  options: {
    rateLimits?: boolean;
    jobs?: boolean;
    push?: PushProvider;
    video?: VideoProvider;
  } = {},
): Promise<Harness> {
  const mailer = new CapturingMailer();
  const env = testEnv({
    DATABASE_URL: testAppUrl(),
    ...(options.jobs ? { JOB_QUEUE: 'pgboss' } : {}),
  });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(Mailer)
    .useValue(mailer);
  if (options.push) builder = builder.overrideProvider(PushProvider).useValue(options.push);
  if (options.video) builder = builder.overrideProvider(VideoProvider).useValue(options.video);
  if (!options.rateLimits) {
    builder = builder.overrideProvider(RateLimitStore).useValue(new UnlimitedRateLimitStore());
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, env);
  await app.init();
  const db = new Client({ connectionString: testAppUrl() });
  await db.connect();
  return {
    app,
    mailer,
    db,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await db.end();
      await app.close();
    },
  };
}

export const uniqueEmail = (label = 'user') => `${label}-${uuidv7()}@example.test`;

/** Registers and verifies an account; returns its email. */
export async function createVerifiedUser(h: Harness, label?: string): Promise<string> {
  const email = uniqueEmail(label);
  await h
    .http()
    .post('/api/v1/auth/register')
    .send({ email, password: STRONG_PASSWORD, locale: 'en' })
    .expect(202);
  await h
    .http()
    .post('/api/v1/auth/verify-email')
    .send({ token: h.mailer.token(email, 'verifyEmail') })
    .expect(200);
  return email;
}

/** Signs in (no MFA) and returns the access token and the cookie jar. */
export async function signIn(
  h: Harness,
  email: string,
  jar = new CookieJar(),
): Promise<{ accessToken: string; jar: CookieJar }> {
  const res = await h
    .http()
    .post('/api/v1/auth/login')
    .set('Cookie', jar.header())
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36')
    .send({ email, password: STRONG_PASSWORD })
    .expect(200);
  jar.store(res);
  return { accessToken: res.body.accessToken, jar };
}

export async function grantRole(h: Harness, email: string, roleKey: string): Promise<void> {
  await h.db.query(
    `INSERT INTO user_roles (id, user_id, role_id, scope_type)
     SELECT $1, u.id, r.id, 'NONE' FROM users u, roles r WHERE u.email = $2 AND r.key = $3`,
    [uuidv7(), email, roleKey],
  );
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A current TOTP code for a base32 secret. */
export const totpCode = (secret: string) =>
  new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();

/** Grants a role scoped to a department (e.g. DEPARTMENT_DIRECTOR). */
export async function grantDepartmentRole(
  h: Harness,
  email: string,
  roleKey: string,
  departmentId: string,
): Promise<void> {
  await h.db.query(
    `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id)
     SELECT $1, u.id, r.id, 'DEPARTMENT', $4 FROM users u, roles r WHERE u.email = $2 AND r.key = $3`,
    [uuidv7(), email, roleKey, departmentId],
  );
}

/**
 * A verified account signed in with a session that completed MFA (enrolling an authenticator
 * app counts), holding the given roles. Permissions are read per request, so granting after
 * sign-in takes effect at once.
 */
export async function signInWithMfa(
  h: Harness,
  label: string,
  grant: (email: string) => Promise<void>,
): Promise<{ email: string; accessToken: string; userId: string }> {
  const email = await createVerifiedUser(h, label);
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
  await grant(email);
  const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    email,
  ]);
  return { email, accessToken, userId: rows[0]!.id };
}

/** An IUA admin in an MFA session. */
export const signInAdmin = (h: Harness, label = 'admin') =>
  signInWithMfa(h, label, (email) => grantRole(h, email, 'IUA_ADMIN'));

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * The standard access pattern for admin routes (SECURITY_MODEL.md §5): anonymous → 401,
 * a member → 403, an admin whose session skipped MFA → 403. The 2xx case is each test's own.
 */
export async function expectAdminOnly(
  h: Harness,
  method: Method,
  path: string,
  body?: object,
): Promise<void> {
  const call = (token?: string) => {
    let req = h.http()[method](path);
    if (token) req = req.set(bearer(token));
    return body ? req.send(body) : req;
  };
  await call().expect(401);

  const member = await createVerifiedUser(h, 'member');
  await call((await signIn(h, member)).accessToken).expect(403);

  const noMfa = await createVerifiedUser(h, 'admin-no-mfa');
  await grantRole(h, noMfa, 'IUA_ADMIN');
  await call((await signIn(h, noMfa)).accessToken).expect(403);
}
