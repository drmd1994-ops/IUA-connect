import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { linkTarget, pendingLink } from './app-links';

const require = createRequire(import.meta.url);
const { paths } = require('../../app-links.json') as { paths: string[] };
const { patterns } = require('../../plugins/with-app-links.js') as { patterns: () => string[] };

const SITE = 'https://site.example';

describe('email links that open the app (M18b)', () => {
  it('leads each kind of link to its screen, in either language', () => {
    const to = (path: string) => linkTarget(`${SITE}${path}`, SITE);
    expect(to('/he/news/a-b')).toEqual({ kind: 'screen', route: '/news/a-b' });
    expect(to('/en/events/x/check-in')).toEqual({ kind: 'screen', route: '/events/x' });
    expect(to('/he/education/exam/mock/m1')).toEqual({ kind: 'screen', route: '/mock-exam/m1' });
    expect(to('/he/chat/groups/g1')).toEqual({ kind: 'screen', route: '/thread/group/g1' });
    expect(to('/he/chat/rooms/r1')).toEqual({ kind: 'screen', route: '/thread/room/r1' });
    expect(to('/he/chat/c1')).toEqual({ kind: 'screen', route: '/thread/direct/c1' });
    expect(to('/he/account/notifications/messages/m1')).toEqual({
      kind: 'screen',
      route: '/broadcast/m1',
    });
    expect(to('/he/calculators/ipss')).toEqual({ kind: 'screen', route: '/calculators/ipss' });
  });

  it('reads the token of a confirmation or a new password', () => {
    expect(linkTarget(`${SITE}/he/verify-email?token=abc`, SITE)).toEqual({
      kind: 'verifyEmail',
      token: 'abc',
    });
    expect(linkTarget(`${SITE}/en/reset-password?token=def`, SITE)).toEqual({
      kind: 'resetPassword',
      token: 'def',
    });
    expect(linkTarget(`${SITE}/en/reset-password`, SITE)).toBeNull();
  });

  it('leaves alone what is not a link to the site', () => {
    expect(linkTarget('https://other.example/he/news/a', SITE)).toBeNull();
    expect(linkTarget('medconnect://news/a', SITE)).toBeNull();
    expect(linkTarget(`${SITE}/news/a`, SITE)).toBeNull();
  });

  it('has a screen for every address Android sends to the app', () => {
    for (const path of paths) {
      const sample =
        path.replaceAll('*', 'x1') +
        (path.endsWith('-password') || path.endsWith('-email') ? '?token=t' : '');
      const target = linkTarget(`${SITE}/he${sample}`, SITE);
      expect(target, path).not.toBeNull();
      if (target?.kind === 'screen') expect(target.route, path).not.toBe('/');
    }
    expect(patterns()).toContain('/he/news/.*');
    expect(patterns()).toContain('/en/verify-email');
    expect(patterns()).toHaveLength(paths.length * 2);
  });

  it('keeps one link until it is taken', () => {
    let heard = 0;
    const stop = pendingLink.subscribe(() => (heard += 1));
    pendingLink.set({ kind: 'screen', route: '/news' });
    expect(pendingLink.take()).toEqual({ kind: 'screen', route: '/news' });
    expect(pendingLink.take()).toBeNull();
    stop();
    expect(heard).toBe(2);
  });
});
