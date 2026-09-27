import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { uuidv7 } from '@iua/shared';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { type EmailMessage, type EmailTemplate, Mailer } from '../src/infra/mailer/mailer';
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

export async function startHarness(): Promise<Harness> {
  const mailer = new CapturingMailer();
  const env = testEnv({ DATABASE_URL: testAppUrl() });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();
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
