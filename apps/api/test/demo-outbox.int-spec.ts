import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uuidv7 } from '@medconnect/shared';
import { outboxDir } from '../src/infra/mailer/console-mailer';
import { testEnv } from '../src/testing/test-env';
import {
  type Harness,
  bearer,
  signInOrganisationAdmin,
  signInPlatformAdmin,
  startHarness,
  DEFAULT_ORGANISATION,
} from './auth-harness';

/** M18: the demo's sent emails, for the platform's staff, each read recorded. */
describe('the demo outbox', () => {
  let h: Harness;
  const folder = outboxDir(testEnv({}));
  const id = `${uuidv7()}-verifyEmail`;
  const site = new URL(testEnv({}).APP_BASE_URL).origin;

  beforeAll(async () => {
    h = await startHarness();
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, `${id}.html`),
      `<!-- To: new.person@example.test | Subject: Confirm your email -->\n<p>Hello,</p>` +
        `<p><a href="${site}/he/verify-email?token=t0k3n">Confirm</a></p>` +
        `<p><a href="https://elsewhere.example/x">elsewhere</a></p>`,
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(path.join(folder, `${id}.html`), { force: true });
    await h.close();
  });

  it('lists and opens an email for platform staff, and records the opening', async () => {
    const staff = await signInPlatformAdmin(h, 'outbox-staff');
    const list = await h
      .http()
      .get('/api/v1/admin/demo-outbox')
      .set(bearer(staff.accessToken))
      .expect(200);
    expect(list.body.items).toContainEqual(
      expect.objectContaining({ id, to: 'new.person@example.test', template: 'verifyEmail' }),
    );

    const email = await h
      .http()
      .get(`/api/v1/admin/demo-outbox/${id}`)
      .set(bearer(staff.accessToken))
      .expect(200);
    expect(email.body.subject).toBe('Confirm your email');
    expect(email.body.text).toContain('Hello,');
    expect(email.body.links).toEqual([`${site}/he/verify-email?token=t0k3n`]);

    const { rows } = await h.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_logs
        WHERE action = 'demo.outbox.read' AND actor_user_id = $1 AND entity_id = $2`,
      [staff.userId, id.slice(0, 36)],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('opens nothing but an email by its id', async () => {
    const staff = await signInPlatformAdmin(h, 'outbox-paths');
    for (const bad of ['..%2F..%2F.env', `${id}.html`, 'verifyEmail', `${uuidv7()}-missing`]) {
      await h
        .http()
        .get(`/api/v1/admin/demo-outbox/${bad}`)
        .set(bearer(staff.accessToken))
        .expect(404);
    }
  });

  it("is not for an organisation's office", async () => {
    const office = await signInOrganisationAdmin(h, DEFAULT_ORGANISATION, 'outbox-office');
    await h.http().get('/api/v1/admin/demo-outbox').set(bearer(office.accessToken)).expect(403);
  });
});
