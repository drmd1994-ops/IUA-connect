import { testEnv } from '../../testing/test-env';
import { CheckInTokens } from '../events/check-in-token';
import { UNSUBSCRIBE_TTL_SEC, UnsubscribeTokens, kindsOf } from './unsubscribe-tokens';

const env = testEnv();
const USER = '0190a000-0000-7000-8000-00000000c0de';

describe('UnsubscribeTokens', () => {
  const tokens = new UnsubscribeTokens(env);

  it('names the person and the one kind to switch off', async () => {
    const token = await tokens.issue(USER, 'MY_EVENTS');
    expect(await tokens.verify(token)).toEqual({ userId: USER, kinds: ['MY_EVENTS'] });
    // Nothing about the person beyond their id.
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'k', 'sub']);
  });

  it('covers every kind of new content for the daily summary', async () => {
    const token = await tokens.issue(USER, 'CONTENT');
    expect((await tokens.verify(token))?.kinds).toEqual([
      'NEWS',
      'NEW_EVENTS',
      'EDUCATION',
      'GUIDELINES',
      'POSITIONS',
    ]);
  });

  it('never switches off a kind that is always on', async () => {
    expect(kindsOf('ACCOUNT')).toEqual([]);
    expect(kindsOf('WORK')).toEqual([]);
    expect(await tokens.verify(await tokens.issue(USER, 'ACCOUNT'))).toBeNull();
  });

  it('expires after 60 days', async () => {
    const issued = new Date('2030-01-01T00:00:00Z');
    const token = await tokens.issue(USER, 'ASSOCIATION', issued);
    const after = (seconds: number) => new Date(issued.getTime() + seconds * 1000);
    expect(await tokens.verify(token, after(UNSUBSCRIBE_TTL_SEC - 60))).not.toBeNull();
    expect(await tokens.verify(token, after(UNSUBSCRIBE_TTL_SEC + 60))).toBeNull();
  });

  it('refuses an altered token', async () => {
    const token = await tokens.issue(USER, 'NEWS');
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        sub: '0190a000-0000-7000-8000-000000000001',
      }),
    ).toString('base64url');
    expect(await tokens.verify(`${header}.${forged}.${signature}`)).toBeNull();
    expect(await tokens.verify('not-a-token')).toBeNull();
  });

  it('refuses another kind of signed token', async () => {
    const checkIn = await new CheckInTokens(env).issue({ eventId: USER, sessionId: null });
    expect(await tokens.verify(checkIn.token)).toBeNull();
  });
});
