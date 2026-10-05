import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown-model';

describe('an article body', () => {
  it('reads headings, never above the second level', () => {
    expect(parseMarkdown('# One\n\n### Three\n\n###### Six')).toEqual([
      { kind: 'heading', level: 2, inline: [{ kind: 'text', text: 'One' }] },
      { kind: 'heading', level: 3, inline: [{ kind: 'text', text: 'Three' }] },
      { kind: 'heading', level: 4, inline: [{ kind: 'text', text: 'Six' }] },
    ]);
  });

  it('joins the lines of a paragraph and separates paragraphs at an empty line', () => {
    expect(parseMarkdown('first line\nsecond line\r\n\r\nnext')).toEqual([
      { kind: 'paragraph', inline: [{ kind: 'text', text: 'first line second line' }] },
      { kind: 'paragraph', inline: [{ kind: 'text', text: 'next' }] },
    ]);
  });

  it('reads lists, and keeps bullets apart from numbers', () => {
    expect(parseMarkdown('- a\n- b\n  more\n1. one\n2) two')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b more' }]],
      },
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: 'one' }], [{ kind: 'text', text: 'two' }]],
      },
    ]);
  });

  it('reads a quote, a rule and a block of code', () => {
    expect(parseMarkdown('> said\n> twice\n\n---\n\n```\n**kept** as is\n```')).toEqual([
      { kind: 'quote', inline: [{ kind: 'text', text: 'said twice' }] },
      { kind: 'rule' },
      { kind: 'code', text: '**kept** as is' },
    ]);
  });

  it('reads Hebrew as it reads English', () => {
    expect(parseMarkdown('## כותרת\n\nפסקה **מודגשת**')).toEqual([
      { kind: 'heading', level: 2, inline: [{ kind: 'text', text: 'כותרת' }] },
      {
        kind: 'paragraph',
        inline: [
          { kind: 'text', text: 'פסקה ' },
          { kind: 'strong', text: 'מודגשת' },
        ],
      },
    ]);
  });
});

describe('the text inside a block', () => {
  it('reads bold, italics, code and links', () => {
    expect(parseInline('a **b** *c* _d_ `e` [f](https://example.test/x)')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'emphasis', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'emphasis', text: 'd' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'e' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'f', url: 'https://example.test/x' },
    ]);
  });

  it('leaves an underscore inside a word alone', () => {
    expect(parseInline('snake_case_name')).toEqual([{ kind: 'text', text: 'snake_case_name' }]);
  });

  it('never makes a link of an address that is not a web or mail address', () => {
    expect(parseInline('[press](javascript:alert(1)) [file](file:///etc/passwd)')).toEqual([
      { kind: 'text', text: 'press) file' },
    ]);
    expect(parseInline('[mail](mailto:office@example.test)')).toEqual([
      { kind: 'link', text: 'mail', url: 'mailto:office@example.test' },
    ]);
  });

  it('leaves pictures out and shows HTML as plain text', () => {
    expect(parseInline('before ![alt](https://example.test/a.png) after')).toEqual([
      { kind: 'text', text: 'before  after' },
    ]);
    expect(parseInline('<script>x</script>')).toEqual([
      { kind: 'text', text: '<script>x</script>' },
    ]);
  });
});
