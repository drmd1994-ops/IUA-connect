import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { testEnv } from '../../testing/test-env';
import { ConsoleMailer, maskEmail } from './console-mailer';
import { renderEmail } from './render';

describe('renderEmail', () => {
  it('renders Hebrew right-to-left with the link', () => {
    const email = renderEmail({
      to: 'x@example.test',
      locale: 'he',
      template: 'verifyEmail',
      params: { link: 'http://localhost:3001/he/verify-email?token=abc' },
    });
    expect(email.subject).toContain('מד קונקט');
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain('lang="he"');
    expect(email.html).toContain('http://localhost:3001/he/verify-email?token=abc');
    expect(email.text).toContain('token=abc');
  });

  it('lists the items of a summary and ends with how to stop these emails', () => {
    const email = renderEmail({
      to: 'x@example.test',
      locale: 'en',
      template: 'contentDigest',
      params: { count: 1, link: 'http://localhost:3001/en/account/notifications/preferences' },
      list: [
        { label: 'News', title: 'A <b>bold</b> title', link: 'http://localhost:3001/en/news/a' },
      ],
      unsubscribe: {
        link: 'http://localhost:3001/en/notifications/unsubscribe?t=abc',
        preferencesLink: 'http://localhost:3001/en/account/notifications/preferences',
      },
    });
    expect(email.html).toContain('<li>News: <a href="http://localhost:3001/en/news/a">');
    // Titles are text, never markup.
    expect(email.html).toContain('A &lt;b&gt;bold&lt;/b&gt; title');
    expect(email.html).toContain('unsubscribe?t=abc');
    expect(email.html).toContain('Stop emails of this kind');
    expect(email.text).toContain('News: A <b>bold</b> title\nhttp://localhost:3001/en/news/a');
    expect(email.text).toContain(
      'Stop emails of this kind: http://localhost:3001/en/notifications',
    );
  });

  it('adds no unsubscribe line to an email that is always sent', () => {
    const email = renderEmail({
      to: 'x@example.test',
      locale: 'en',
      template: 'passwordChanged',
      params: {},
    });
    expect(email.html).not.toContain('Stop emails of this kind');
    expect(email.text).not.toContain('Stop emails of this kind');
  });

  it('renders English left-to-right and fills parameters', () => {
    const email = renderEmail({
      to: 'x@example.test',
      locale: 'en',
      template: 'accountLocked',
      params: { minutes: 15 },
    });
    expect(email.html).toContain('dir="ltr"');
    expect(email.text).toContain('15 minutes');
  });

  it('escapes parameters in HTML', () => {
    const email = renderEmail({
      to: 'x@example.test',
      locale: 'en',
      template: 'newDevice',
      params: { device: '<script>alert(1)</script>', time: 'now' },
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('always carries the demo notice', () => {
    for (const locale of ['he', 'en'] as const) {
      const email = renderEmail({
        to: 'x@example.test',
        locale,
        template: 'passwordChanged',
        params: {},
      });
      expect(email.text.length).toBeGreaterThan(0);
      expect(email.html).toMatch(/demo|הדגמה/i);
    }
  });
});

describe('ConsoleMailer', () => {
  it('writes the email to the outbox directory', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'iua-outbox-'));
    try {
      const mailer = new ConsoleMailer(testEnv({ MAIL_OUTBOX_DIR: dir }));
      await mailer.send({
        to: 'dana@example.test',
        locale: 'en',
        template: 'passwordReset',
        params: { link: 'http://localhost:3001/en/reset-password?token=xyz' },
      });
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/-passwordReset\.html$/);
      expect(await readFile(path.join(dir, files[0]!), 'utf8')).toContain('token=xyz');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('masks addresses for logs', () => {
    expect(maskEmail('dana.levi@example.test')).toBe('d***@example.test');
  });
});
