import {
  type VideoPlayback,
  VideoProvider,
  type VideoViewer,
} from '../src/infra/video/video-provider';
import {
  type Harness,
  bearer,
  grantRole,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/**
 * Stands in for a hosted video service: it takes recordings from one host only, and plays them
 * from an address of its own that names who is watching.
 */
class HostedVideo extends VideoProvider {
  readonly name = 'test-hosted';
  readonly asked: { reference: string; viewer: VideoViewer }[] = [];

  accepts(reference: string): boolean {
    return reference.startsWith('https://hosted.example.test/');
  }

  playback(reference: string, viewer: VideoViewer): VideoPlayback {
    this.asked.push({ reference, viewer });
    return { kind: 'LINK', url: `${reference}?for=${viewer.userId ?? 'visitor'}` };
  }
}

/**
 * M10: education asks the video provider what may be attached and how it is played. The app's
 * own provider links to the host (education.int-spec.ts covers that, unchanged); a different
 * one takes its place here to show that education really goes through it.
 */
describe('video connection point (integration)', () => {
  let h: Harness;
  let editor: { accessToken: string };
  let reviewer: { accessToken: string };
  const video = new HostedVideo();
  const run = Date.now();
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness({ video });
    editor = await signInWithMfa(h, 'video-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
    );
    reviewer = await signInAdmin(h, 'video-reviewer');
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  const lecture = (externalUrl: string) => ({
    type: 'VIDEO',
    translations: { he: { title: `הרצאה לדוגמה ${run} ${++n}`, description: 'תיאור בדוי.' } },
    externalUrl,
  });
  const create = (body: object) =>
    h.http().post('/api/v1/admin/education').set(as(editor)).send(body);

  it('refuses a recording the provider does not take, and says which field', async () => {
    const res = await create(lecture('https://elsewhere.example.test/lecture')).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual([
      { field: 'externalUrl', code: 'educationLinkRefused' },
    ]);
  });

  it('does not ask the provider about a type that has no recording', async () => {
    await create({
      type: 'ARTICLE',
      translations: { he: { title: `מאמר לדוגמה ${run} ${++n}`, description: 'טקסט בדוי.' } },
      externalUrl: 'https://elsewhere.example.test/ignored',
    }).expect(201);
  });

  it('plays a published recording from the address the provider gives this viewer', async () => {
    const reference = 'https://hosted.example.test/lecture-1';
    const item = (await create(lecture(reference)).expect(201)).body as {
      id: string;
      slug: string;
    };
    const step = (who: { accessToken: string }, action: string) =>
      h
        .http()
        .post(`/api/v1/admin/education/${item.id}/transitions`)
        .set(as(who))
        .send({ action })
        .expect(200);
    await step(editor, 'SUBMIT');
    await step(reviewer, 'PUBLISH');

    const path = `/api/v1/education/${encodeURIComponent(item.slug)}?locale=he`;
    const visitor = await h.http().get(path).expect(200);
    expect(visitor.body.externalUrl).toBe(`${reference}?for=visitor`);
    expect(visitor.body.videoStatus).toBe('EXTERNAL');

    const signedIn = await h.http().get(path).set(as(editor)).expect(200);
    expect(signedIn.body.externalUrl).toMatch(/\?for=[0-9a-f-]{36}$/);

    // What is stored is the reference, not a viewer's address.
    const { rows } = await h.db.query<{ external_url: string }>(
      'SELECT external_url FROM education_items WHERE id = $1',
      [item.id],
    );
    expect(rows[0]!.external_url).toBe(reference);
    expect(video.asked.filter((ask) => ask.reference === reference)).toHaveLength(2);
  });
});
