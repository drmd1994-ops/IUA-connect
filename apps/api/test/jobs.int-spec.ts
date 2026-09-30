import sharp from 'sharp';
import { JobQueue } from '../src/infra/jobs/job-queue';
import { UNUSED_FILES_JOB } from '../src/modules/files/unused-files.job';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  signInAdmin,
  startHarness,
} from './auth-harness';

/** M3 checkpoint 2: the pg-boss job queue, with its first job (removing unused uploads). */
describe('job queue (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };

  beforeAll(async () => {
    h = await startHarness({ jobs: true });
    admin = await signInAdmin(h);
  });

  afterAll(async () => {
    await h.close();
  });

  const image = () =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: '#000000' } })
      .png()
      .toBuffer();

  async function waitFor(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('timed out');
  }

  it('installs pg-boss in its own schema and schedules the jobs', async () => {
    const { rows } = await h.db.query<{ name: string; cron: string }>(
      'SELECT name, cron FROM pgboss.schedule ORDER BY name',
    );
    expect(rows).toEqual(expect.arrayContaining([{ name: UNUSED_FILES_JOB, cron: '17 * * * *' }]));
  });

  it('removes uploads nothing uses after a day, and keeps the rest', async () => {
    const upload = async () =>
      (
        await h
          .http()
          .post('/api/v1/files')
          .set(bearer(admin.accessToken))
          .attach('file', await image(), 'x.png')
          .expect(201)
      ).body.id as string;
    const stale = await upload();
    const fresh = await upload();
    const used = await upload();
    await h.db.query(`UPDATE files SET created_at = now() - interval '2 days' WHERE id = ANY($1)`, [
      [stale, used],
    ]);
    await h.db.query(`UPDATE files SET attached_at = now() WHERE id = $1`, [used]);

    // A member's profile photo is in use even though it's old.
    const email = await createVerifiedUser(h, 'jobs');
    const { accessToken } = await signIn(h, email);
    const photo = await h
      .http()
      .put('/api/v1/me/profile/photo')
      .set(bearer(accessToken))
      .attach('file', await image(), 'me.png')
      .expect(200);
    await h.db.query(`UPDATE files SET created_at = now() - interval '2 days' WHERE id = $1`, [
      photo.body.photo.id,
    ]);

    await h.app.get(JobQueue).runNow(UNUSED_FILES_JOB);
    const exists = async (id: string) =>
      (await h.db.query('SELECT 1 FROM files WHERE id = $1', [id])).rows.length === 1;
    await waitFor(async () => !(await exists(stale)));
    expect(await exists(fresh)).toBe(true);
    expect(await exists(used)).toBe(true);
    expect(await exists(photo.body.photo.id)).toBe(true);
  });
});
