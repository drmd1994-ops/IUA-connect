import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ROLES, type RoleKey, roleFits, uuidv7 } from '@medconnect/shared';
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
import { FIRST_ORGANISATION } from '../prisma/seed/reference-data';
import { testAppUrl } from './test-db';

/**
 * The organisation the reference seed makes, with the membership types the suites use. A suite
 * that is not about organisations works inside it; `createOrganisation` makes another.
 */
export const DEFAULT_ORGANISATION = FIRST_ORGANISATION.id;

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
/** The signing-key fingerprint of the app the tests stand in for (passkeys in the app, M18b). */
export const TEST_APP_CERT_SHA256 = Array.from({ length: 32 }, () => 'AB').join(':');

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
    ANDROID_CERT_SHA256: TEST_APP_CERT_SHA256,
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

/**
 * Grants a role. Where: `'platform'`, an organisation's id, or (the default) where an
 * organisation's staff would hold it: in the default organisation when the role can be held in
 * one, otherwise on the platform.
 */
export async function grantRole(
  h: Harness,
  email: string,
  roleKey: string,
  where: 'default' | 'platform' | (string & {}) = 'default',
): Promise<void> {
  const organisationId =
    where === 'platform'
      ? null
      : where === 'default'
        ? roleKey in ROLES && roleFits(roleKey as RoleKey, true)
          ? DEFAULT_ORGANISATION
          : null
        : where;
  await h.db.query(
    `INSERT INTO user_roles (id, user_id, role_id, scope_type, organisation_id)
     SELECT $1, u.id, r.id, 'NONE', $4::uuid FROM users u, roles r
     WHERE u.email = $2 AND r.key = $3`,
    [uuidv7(), email, roleKey, organisationId],
  );
}

/** Both of an administrator's roles: the default organisation's office, and the platform. */
export async function grantAdmin(h: Harness, email: string): Promise<void> {
  await grantRole(h, email, 'ORG_ADMIN', DEFAULT_ORGANISATION);
  await grantRole(h, email, 'PLATFORM_ADMIN', 'platform');
}

/** Marks an account as a physician the platform knows (what a membership also does). */
export async function verifyPhysician(h: Harness, email: string): Promise<void> {
  await h.db.query(
    "UPDATE users SET verified_at = now(), verified_as = 'PHYSICIAN' WHERE email = $1 AND verified_at IS NULL",
    [email],
  );
}

/** Another organisation, with one membership type of its own. Returns their ids. */
export async function createOrganisation(
  h: Harness,
  label = 'org',
): Promise<{ id: string; slug: string; typeId: string }> {
  const id = uuidv7();
  const slug = `${label}-${id.slice(-12)}`;
  await h.db.query(
    `INSERT INTO organisations (id, slug, name_he, name_en, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [id, slug, `ארגון ${slug}`, `Organisation ${slug}`],
  );
  const typeId = uuidv7();
  await h.db.query(
    `INSERT INTO membership_types
       (id, organisation_id, key, name_he, name_en, identifier, self_apply, director_approval,
        sort_order, updated_at)
     VALUES ($1, $2, 'MEMBER', 'חבר', 'Member', 'NONE', true, false, 1, now())`,
    [typeId, id],
  );
  return { id, slug, typeId };
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

/**
 * An administrator in an MFA session: of the default organisation's office and of the platform.
 * Holding both, they say whose a new item is (`organisationId`) where it could be either's.
 */
export const signInAdmin = (h: Harness, label = 'admin') =>
  signInWithMfa(h, label, (email) => grantAdmin(h, email));

/** An administrator of one organisation only, in an MFA session. */
export const signInOrganisationAdmin = (h: Harness, organisationId: string, label = 'office') =>
  signInWithMfa(h, label, (email) => grantRole(h, email, 'ORG_ADMIN', organisationId));

/** An administrator of the platform only, in an MFA session. */
export const signInPlatformAdmin = (h: Harness, label = 'platform-admin') =>
  signInWithMfa(h, label, (email) => grantRole(h, email, 'PLATFORM_ADMIN', 'platform'));

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
  await grantAdmin(h, noMfa);
  await call((await signIn(h, noMfa)).accessToken).expect(403);
}
