import { type PushMessage, PushProvider } from '../src/infra/push/push-provider';
import { Notifier } from '../src/modules/notifications';
import { type Harness, bearer, createVerifiedUser, signIn, startHarness } from './auth-harness';

/** Stands in for a real push service: keeps what it is given, and can be made to fail. */
class RecordingPush extends PushProvider {
  readonly enabled = true;
  readonly sent: PushMessage[] = [];
  failing = false;

  async send(message: PushMessage): Promise<number> {
    if (this.failing) throw new Error('push service is down');
    this.sent.push(message);
    return 1;
  }

  to(userId: string): PushMessage[] {
    return this.sent.filter((message) => message.userId === userId);
  }
}

/**
 * M10: the notifier hands each notice in the app to the push provider as well. The app's own
 * provider sends nothing, so a recording one takes its place here.
 */
describe('push connection point (integration)', () => {
  let h: Harness;
  let notifier: Notifier;
  const push = new RecordingPush();

  beforeAll(async () => {
    h = await startHarness({ push });
    notifier = h.app.get(Notifier);
  });

  afterAll(async () => {
    await h.close();
  });

  async function person(label: string) {
    const email = await createVerifiedUser(h, label);
    const token = (await signIn(h, email)).accessToken;
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { email, token, userId: rows[0]!.id };
  }
  const notices = async (token: string) =>
    (await h.http().get('/api/v1/notifications').set(bearer(token)).expect(200)).body.items as {
      type: string;
    }[];
  const registered = (p: { email: string; userId: string }, title: string) =>
    notifier.send({
      userId: p.userId,
      kind: 'MY_EVENTS',
      to: p.email,
      locale: 'he',
      template: 'eventRegistered',
      params: { title, when: '10.1.2031', link: 'http://localhost:3001/he/events/push-test' },
    });

  it('hands a notice to the push provider, with the same words and a link inside the site', async () => {
    const p = await person('push-one');
    await registered(p, 'Push test one');

    expect(push.to(p.userId)).toEqual([
      {
        userId: p.userId,
        locale: 'he',
        type: 'eventRegistered',
        params: { title: 'Push test one', when: '10.1.2031' },
        link: '/events/push-test',
      },
    ]);
    // The other two channels are untouched.
    expect((await notices(p.token)).map((n) => n.type)).toContain('eventRegistered');
    expect(h.mailer.count(p.email, 'eventRegistered')).toBe(1);
  });

  it('sends no push when the person switched the kind off in the app', async () => {
    const p = await person('push-off');
    await h
      .http()
      .put('/api/v1/me/notification-preferences')
      .set(bearer(p.token))
      .send({ items: [{ kind: 'MY_EVENTS', app: false, email: true }] })
      .expect(200);
    await registered(p, 'Push test two');

    expect(push.to(p.userId)).toEqual([]);
    expect(h.mailer.count(p.email, 'eventRegistered')).toBe(1);
  });

  it('reaches only the person the notice is for', async () => {
    const [a, b] = [await person('push-a'), await person('push-b')];
    await registered(a, 'Push test three');

    expect(push.to(a.userId)).toHaveLength(1);
    expect(push.to(b.userId)).toEqual([]);
  });

  it('keeps the notice in the app and the email when the push service fails', async () => {
    const p = await person('push-down');
    push.failing = true;
    try {
      await expect(registered(p, 'Push test four')).resolves.toBeUndefined();
    } finally {
      push.failing = false;
    }

    expect(push.to(p.userId)).toEqual([]);
    expect((await notices(p.token)).map((n) => n.type)).toContain('eventRegistered');
    expect(h.mailer.count(p.email, 'eventRegistered')).toBe(1);
  });
});
