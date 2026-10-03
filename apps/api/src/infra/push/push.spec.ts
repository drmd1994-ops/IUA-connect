import { DisabledPushProvider } from './push-provider';

describe('DisabledPushProvider', () => {
  const provider = new DisabledPushProvider();

  it('says that push does not exist', () => {
    expect(provider.enabled).toBe(false);
  });

  it('sends nothing and reaches no device', async () => {
    await expect(provider.send()).resolves.toBe(0);
  });
});
