import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { errorEnvelopeSchema } from '@medconnect/shared';
import sharp from 'sharp';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  signIn,
  signInAdmin,
  startHarness,
} from './auth-harness';

const STORAGE = path.resolve(__dirname, '../../../storage/test');

/** M3 checkpoint 1: uploads, signed downloads, access checks, profile photos. */
describe('files (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string };

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h);
  });

  afterAll(async () => {
    await h.close();
  });

  const details = (body: unknown) => errorEnvelopeSchema.parse(body).error.details;
  const jpegWithExif = () =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: '#224466' } })
      .jpeg()
      .withExif({ IFD0: { Artist: 'demo-exif-marker' } })
      .toBuffer();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

  const upload = (token: string, body: Buffer, name: string) =>
    h.http().post('/api/v1/files').set(bearer(token)).attach('file', body, name);
  const urlOf = (id: string, token?: string, v = 'full') => {
    const req = h.http().get(`/api/v1/files/${id}/url?v=${v}`);
    return token ? req.set(bearer(token)) : req;
  };

  async function member() {
    const email = await createVerifiedUser(h, 'files');
    return (await signIn(h, email)).accessToken;
  }

  it('lets only staff upload content files', async () => {
    await expectAdminOnly(h, 'post', '/api/v1/files');
  });

  it('stores images re-encoded without metadata, and serves them through signed links', async () => {
    const res = await upload(admin.accessToken, await jpegWithExif(), 'photo.jpeg').expect(201);
    expect(res.body).toMatchObject({
      kind: 'IMAGE',
      mimeType: 'image/jpeg',
      originalName: 'photo.jpg',
      width: 40,
      height: 30,
    });
    const id = res.body.id as string;

    const row = await h.db.query(
      'SELECT storage_key, thumbnail_key, scan_status, owner_user_id FROM files WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toMatchObject({ scan_status: 'UNSCANNED', owner_user_id: admin.userId });
    const stored = await readFile(path.join(STORAGE, ...row.rows[0].storage_key.split('/')));
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(stored.includes('demo-exif-marker')).toBe(false);

    const link = await urlOf(id, admin.accessToken).expect(200);
    expect(link.body.url).toMatch(new RegExp(`^/api/v1/files/${id}/content\\?`));
    const content = await h.http().get(link.body.url).expect(200);
    expect(content.headers['content-type']).toBe('image/jpeg');
    expect(content.headers['content-disposition']).toMatch(/^inline;/);
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.from(content.body).equals(stored)).toBe(true);

    const thumb = await urlOf(id, admin.accessToken, 'thumb').expect(200);
    await h.http().get(thumb.body.url).expect(200);

    const audit = await h.db.query(`SELECT action FROM audit_logs WHERE entity_id = $1`, [id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['file.upload']);
  });

  it('downloads documents as attachments, keeping a Hebrew name', async () => {
    const res = await upload(admin.accessToken, pdf, 'דו״ח שנתי.pdf').expect(201);
    expect(res.body).toMatchObject({ kind: 'DOCUMENT', mimeType: 'application/pdf' });
    const link = await urlOf(res.body.id, admin.accessToken).expect(200);
    const content = await h.http().get(link.body.url).expect(200);
    expect(content.headers['content-disposition']).toBe(
      `attachment; filename="____ ____.pdf"; filename*=UTF-8''${encodeURIComponent('דו״ח שנתי.pdf')}`,
    );
    await urlOf(res.body.id, admin.accessToken, 'thumb').expect(404); // documents have none
  });

  it('refuses files that are not allowed', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');
    const res = await upload(admin.accessToken, svg, 'logo.svg').expect(400);
    expect(details(res.body)).toEqual([{ field: 'file', code: 'fileTypeNotAllowed' }]);
    const none = await h.http().post('/api/v1/files').set(bearer(admin.accessToken)).expect(400);
    expect(details(none.body)).toEqual([{ field: 'file', code: 'fileMissing' }]);
  });

  it('hides files from people who may not read them, and rejects forged links', async () => {
    const res = await upload(admin.accessToken, pdf, 'internal.pdf').expect(201);
    const id = res.body.id as string;
    await urlOf(id).expect(404); // anonymous
    await urlOf(id, await member()).expect(404); // a member who didn't upload it

    const link = await urlOf(id, admin.accessToken).expect(200);
    const url = new URL(link.body.url, 'http://x');
    const forged = new URL(url);
    forged.searchParams.set('exp', String(Number(url.searchParams.get('exp')) + 3600));
    await h
      .http()
      .get(forged.pathname + forged.search)
      .expect(404);
    const other = await upload(admin.accessToken, pdf, 'other.pdf').expect(201);
    await h.http().get(`/api/v1/files/${other.body.id}/content${url.search}`).expect(404);
  });

  describe('profile photo', () => {
    it('sets, replaces and removes the member’s own photo', async () => {
      const token = await member();
      const first = await h
        .http()
        .put('/api/v1/me/profile/photo')
        .set(bearer(token))
        .attach('file', await jpegWithExif(), 'me.jpg')
        .expect(200);
      expect(first.body.photo).toMatchObject({ kind: 'IMAGE', width: 1024, height: 1024 });
      const firstId = first.body.photo.id as string;
      const profile = await h.http().get('/api/v1/me/profile').set(bearer(token)).expect(200);
      expect(profile.body).toMatchObject({
        photoFileId: firstId,
        visibility: { PHOTO: 'PRIVATE' },
      });

      // The member can read it; another member can't.
      await urlOf(firstId, token).expect(200);
      await urlOf(firstId, await member()).expect(404);

      // Replacing deletes the old file.
      const second = await h
        .http()
        .put('/api/v1/me/profile/photo')
        .set(bearer(token))
        .attach('file', await jpegWithExif(), 'me2.jpg')
        .expect(200);
      expect(second.body.photo.id).not.toBe(firstId);
      const gone = await h.db.query('SELECT 1 FROM files WHERE id = $1', [firstId]);
      expect(gone.rows).toHaveLength(0);

      await h.http().delete('/api/v1/me/profile/photo').set(bearer(token)).expect(204);
      const after = await h.http().get('/api/v1/me/profile').set(bearer(token)).expect(200);
      expect(after.body.photoFileId).toBeNull();
    });

    it('accepts images only', async () => {
      const token = await member();
      const res = await h
        .http()
        .put('/api/v1/me/profile/photo')
        .set(bearer(token))
        .attach('file', pdf, 'me.pdf')
        .expect(400);
      expect(details(res.body)).toEqual([{ field: 'file', code: 'fileTypeNotAllowed' }]);
      await h.http().put('/api/v1/me/profile/photo').expect(401);
    });
  });
});
