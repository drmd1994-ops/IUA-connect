import { PLANTED, readScan, sampleScan } from '../src/testing/sample-scan';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInWithMfa,
  startHarness,
  verifyPhysician,
} from './auth-harness';

interface Person {
  id: string;
  accessToken: string;
}

interface Scan {
  id: string;
  modalities: string;
  seriesCount: number;
  instanceCount: number;
}

/** M36: scans, cleaned on upload, read by the viewer through a signed link. All made up. */
describe('medical imaging (integration)', () => {
  let h: Harness;
  const run = Date.now().toString(36);
  let n = 0;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  let subspecialtyId: string;

  beforeAll(async () => {
    h = await startHarness();
    const { rows } = await h.db.query<{ id: string }>(
      'SELECT id FROM subspecialties ORDER BY sort_order, key LIMIT 1',
    );
    subspecialtyId = rows[0]!.id;
  });

  afterAll(async () => {
    await h.close();
  });

  async function person(verified = true): Promise<Person> {
    const email = await createVerifiedUser(h, 'scans');
    if (verified) await verifyPhysician(h, email);
    const { accessToken } = await signIn(h, email);
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { id: rows[0]!.id, accessToken };
  }

  /** A study with a fresh identifier each time, so uploads don't collide. */
  const study = () => `1.2.826.0.1.${Date.now()}.${++n}`;

  function upload(who: Person, files: Buffer[], confirmed = true) {
    let req = h
      .http()
      .post(`/api/v1/imaging/scans${confirmed ? '?confirmed=true' : ''}`)
      .set(as(who));
    files.forEach((file, i) => {
      req = req.attach('files', file, `image-${i}.dcm`);
    });
    return req;
  }

  /** Whether someone gets a viewer's link to a scan. */
  async function viewerStatus(who: Person, scanId: string): Promise<number> {
    return (await h.http().get(`/api/v1/imaging/scans/${scanId}/viewer`).set(as(who))).status;
  }

  /** Follows the viewer's way in: the link, its settings, and the paths under them. */
  async function openViewer(who: Person, scanId: string) {
    const link = await h
      .http()
      .get(`/api/v1/imaging/scans/${scanId}/viewer`)
      .set(as(who))
      .expect(200);
    const { configUrl, studyUid } = link.body as { configUrl: string; studyUid: string };
    const config = await h.http().get(configUrl).expect(200);
    const server = (
      config.body as {
        servers: { dicomWeb: { qidoRoot: string; wadoRoot: string; wadoUriRoot: string }[] };
      }
    ).servers.dicomWeb[0]!;
    return { studyUid, server };
  }

  it('cleans a scan on upload, and the viewer reads it through its link, with nothing identifying left', async () => {
    const author = await person();
    const uid = study();
    const files = [1, 2].map((number) => sampleScan({ study: uid, number }));
    const scan = (await upload(author, files).expect(201)).body as Scan;
    expect(scan).toMatchObject({ modalities: 'CT', seriesCount: 1, instanceCount: 2 });

    const v = await openViewer(author, scan.id);
    expect(v.studyUid).not.toBe(uid);

    const studies = await h.http().get(`${v.server.qidoRoot}/studies`).expect(200);
    expect(studies.headers['content-type']).toContain('application/dicom+json');
    expect(studies.body[0]['0020000D'].Value).toEqual([v.studyUid]);

    const series = await h.http().get(`${v.server.qidoRoot}/studies/${v.studyUid}/series`);
    const seriesUid = series.body[0]['0020000E'].Value[0] as string;
    const metadata = await h
      .http()
      .get(`${v.server.wadoRoot}/studies/${v.studyUid}/series/${seriesUid}/metadata`)
      .expect(200);
    expect(metadata.body).toHaveLength(2);
    expect(JSON.stringify(metadata.body)).not.toMatch(/Cohen|123456782|20260901|Made-up/);

    const objectUid = metadata.body[0]['00080018'].Value[0] as string;
    const file = await h
      .http()
      .get(`${v.server.wadoUriRoot}`)
      .query({
        requestType: 'WADO',
        studyUID: v.studyUid,
        seriesUID: seriesUid,
        objectUID: objectUid,
      })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-type']).toBe('application/dicom');
    const bytes = (file.body as Buffer).toString('latin1');
    for (const planted of Object.values(PLANTED)) expect(bytes).not.toContain(planted);
    expect(readScan(file.body as Buffer).dict['00280010']?.Value).toEqual([4]);

    // A changed link, or another study under a good one, opens nothing.
    const forged = v.server.qidoRoot.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    await h.http().get(`${forged}/studies`).expect(404);
    await h.http().get(`${v.server.qidoRoot}/studies/1.2.3/series`).expect(404);
  });

  it('refuses an upload without the confirmation, a file that is not a scan, and two studies at once', async () => {
    const author = await person();
    await upload(author, [sampleScan({ study: study() })], false).expect(400);
    const notScan = await upload(author, [Buffer.from('a made-up report, not a scan')]).expect(400);
    expect(notScan.body.error.details[0].code).toBe('scanNotDicom');
    const two = await upload(author, [
      sampleScan({ study: study() }),
      sampleScan({ study: study() }),
    ]).expect(400);
    expect(two.body.error.details[0].code).toBe('scanManyStudies');
    const burned = await upload(author, [
      sampleScan({ study: study(), overrides: { '00280301': { vr: 'CS', Value: ['YES'] } } }),
    ]).expect(400);
    expect(burned.body.error.details[0].code).toBe('scanBurnedIn');
    const { rows } = await h.db.query('SELECT 1 FROM scans WHERE owner_user_id = $1', [author.id]);
    expect(rows).toHaveLength(0);
  });

  it('is only for verified physicians to upload', async () => {
    const unverified = await person(false);
    await upload(unverified, [sampleScan({ study: study() })]).expect(403);
  });

  it('is its uploader’s alone until attached; in a case it follows the case’s readers', async () => {
    const author = await person();
    const reader = await person();
    const scan = (await upload(author, [sampleScan({ study: study() })]).expect(201)).body as Scan;
    await h.http().get(`/api/v1/imaging/scans/${scan.id}`).set(as(reader)).expect(404);
    expect(await viewerStatus(reader, scan.id)).toBe(404);

    const input = () => ({
      subspecialtyId,
      title: `A made-up case with a scan ${run}-${++n}`,
      ageRange: 'FROM_40_TO_64',
      sex: 'MALE',
      history: 'A made-up case.',
      question: 'What would you do?',
      scanIds: [scan.id],
    });
    const made = await h.http().post('/api/v1/cases').set(as(author)).send(input()).expect(201);
    expect(made.body.scans).toEqual([expect.objectContaining({ id: scan.id })]);
    // Not published: still not the reader's.
    expect(await viewerStatus(reader, scan.id)).toBe(404);
    // Someone else can't take it into their own case.
    const taken = await h.http().post('/api/v1/cases').set(as(reader)).send(input()).expect(400);
    expect(taken.body.error.details[0].code).toBe('unknownScan');

    await h.db.query(`UPDATE cases SET status = 'PUBLISHED' WHERE id = $1`, [made.body.id]);
    expect(await viewerStatus(reader, scan.id)).toBe(200);

    // Deleting the case deletes the scan with it.
    await h.db.query(`UPDATE cases SET status = 'DRAFT' WHERE id = $1`, [made.body.id]);
    await h.http().delete(`/api/v1/cases/${made.body.id}`).set(as(author)).expect(204);
    const { rows } = await h.db.query('SELECT 1 FROM scans WHERE id = $1', [scan.id]);
    expect(rows).toHaveLength(0);
  });

  it('lets the uploader remove a scan not yet attached, and nobody else', async () => {
    const author = await person();
    const other = await person();
    const scan = (await upload(author, [sampleScan({ study: study() })]).expect(201)).body as Scan;
    await h.http().delete(`/api/v1/imaging/scans/${scan.id}`).set(as(other)).expect(404);
    await h.http().delete(`/api/v1/imaging/scans/${scan.id}`).set(as(author)).expect(204);
    await h.http().get(`/api/v1/imaging/scans/${scan.id}`).set(as(author)).expect(404);
  });

  it('in a library item, the editors read it before publishing, and readers after', async () => {
    const signedIn = await signInWithMfa(h, 'scan-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
    );
    const editor: Person = { id: signedIn.userId, accessToken: signedIn.accessToken };
    const reader = await person();
    const scan = (await upload(editor, [sampleScan({ study: study() })]).expect(201)).body as Scan;
    const item = await h
      .http()
      .post('/api/v1/admin/education')
      .set(as(editor))
      .send({
        type: 'CASE',
        accessTier: 'VERIFIED',
        scanIds: [scan.id],
        translations: { he: { title: `סריקה ללימוד ${run}-${++n}`, description: 'בדוי.' } },
      })
      .expect(201);
    expect(item.body.scans).toEqual([expect.objectContaining({ id: scan.id })]);
    expect(await viewerStatus(editor, scan.id)).toBe(200);
    expect(await viewerStatus(reader, scan.id)).toBe(404);
    await h.db.query(
      `UPDATE education_items SET status = 'PUBLISHED', published_at = now() WHERE id = $1`,
      [item.body.id],
    );
    expect(await viewerStatus(reader, scan.id)).toBe(200);
    const page = await h
      .http()
      .get(`/api/v1/education/${item.body.slug}`)
      .set(as(reader))
      .expect(200);
    expect(page.body.scans).toEqual([expect.objectContaining({ id: scan.id })]);
  });
});
