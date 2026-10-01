import { sanitizeMarkdown } from './markdown';

describe('sanitizeMarkdown', () => {
  it('keeps ordinary formatting', () => {
    const input = [
      '## Annual meeting',
      '',
      'The meeting is **in Eilat** this year, see [the agenda](https://example.test/agenda).',
      '',
      '- first item',
      '- second item',
      '',
      '> A quote',
      '',
      'Write to [us](mailto:office@example.test).',
    ].join('\n');
    expect(sanitizeMarkdown(input)).toBe(input);
  });

  it('keeps Hebrew text as is', () => {
    expect(sanitizeMarkdown('## כנס שנתי\n\nהכנס יתקיים **באילת**.')).toBe(
      '## כנס שנתי\n\nהכנס יתקיים **באילת**.',
    );
  });

  it('drops raw HTML entirely', () => {
    const output = sanitizeMarkdown(
      'Hello <script>alert(1)</script> there\n\n<iframe src="https://evil.test"></iframe>\n\n<img src=x onerror=alert(1)>',
    );
    expect(output).not.toMatch(/script|iframe|onerror|<|>/);
    expect(output).toContain('Hello');
  });

  it('drops the contents of inline script, style and similar elements', () => {
    expect(sanitizeMarkdown('Hi <script>alert(1)</script> there')).toBe('Hi  there');
    expect(sanitizeMarkdown('a <style>body{display:none}</style> b')).toBe('a  b');
    expect(sanitizeMarkdown('keep <b>bold words</b> text')).toBe('keep bold words text');
  });

  it('removes dangerous links but keeps their text', () => {
    expect(sanitizeMarkdown('[click](javascript:alert(1))')).toBe('click');
    expect(sanitizeMarkdown('[data](data:text/html;base64,PHNjcmlwdD4=)')).toBe('data');
    // An autolink with a bad scheme stays as plain, unclickable text.
    expect(sanitizeMarkdown('<javascript:alert(1)>')).toBe('javascript:alert(1)');
    expect(sanitizeMarkdown('[ok](https://example.test)')).toBe('[ok](https://example.test)');
  });

  it('removes images and keeps headings between levels 2 and 4', () => {
    expect(sanitizeMarkdown('![x](https://example.test/x.png)\n\ntext')).toBe('text');
    expect(sanitizeMarkdown('# Title')).toBe('## Title');
    expect(sanitizeMarkdown('###### Deep')).toBe('#### Deep');
  });

  it('is stable: cleaning twice changes nothing', () => {
    const once = sanitizeMarkdown('# A\n\n* x\n* y\n\n*em* __strong__\n\n***');
    expect(sanitizeMarkdown(once)).toBe(once);
  });
});
