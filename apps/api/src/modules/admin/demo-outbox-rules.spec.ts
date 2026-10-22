import { EMAIL_ID, plainText, readHeader, siteLinks } from './demo-outbox-rules';

const ID = '01a15610-7bb5-73ec-b5bf-39c13de109e0-verify-email';
const HTML = `<!-- To: dana@demo.test | Subject: Confirm your email -->
<html><head><style>p { color: red }</style></head><body>
<p>Hello &amp; welcome,</p><p>Open <a href="https://demo.example/he/verify-email?token=abc&amp;x=1">this link</a>.</p>
<p><a href="https://elsewhere.example/phish">not ours</a> <a href="mailto:x@y">mail</a></p>
</body></html>`;

describe('the demo outbox', () => {
  it('names an email only by its own id', () => {
    expect(EMAIL_ID.test(ID)).toBe(true);
    for (const bad of ['../.env', `${ID}.html`, `${ID}/x`, 'verify-email', `../${ID}`]) {
      expect(EMAIL_ID.test(bad)).toBe(false);
    }
  });

  it('reads who it went to, its subject and its template', () => {
    expect(readHeader(ID, HTML)).toEqual({
      to: 'dana@demo.test',
      subject: 'Confirm your email',
      template: 'verify-email',
    });
    expect(readHeader(ID, '<p>no header</p>')).toMatchObject({ to: '', subject: '' });
  });

  it('gives the text without tags or styles', () => {
    const text = plainText(HTML);
    expect(text).toContain('Hello & welcome,');
    expect(text).toContain('Open this link.');
    expect(text).not.toContain('color');
    expect(text).not.toContain('<');
  });

  it('keeps only the links that lead to the site', () => {
    expect(siteLinks(HTML, 'https://demo.example')).toEqual([
      'https://demo.example/he/verify-email?token=abc&x=1',
    ]);
  });
});
