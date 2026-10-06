/**
 * Reads an article body into blocks the app can draw. The API stores sanitised Markdown; the
 * site draws it with a library, and the app with this small reader, which knows the parts the
 * editor offers: headings, paragraphs, lists, quotes, rules, code, bold, italics and links.
 * Anything else stays plain text. Nothing is ever treated as HTML, and pictures are left out,
 * as on the site.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'emphasis'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string };

export type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'quote'; inline: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

// In order: a picture (dropped), a link, code, bold (two forms), italics (two forms; the
// underscore form only between words, so that snake_case stays as written).
const INLINE =
  /!\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/g;

export function parseInline(source: string): Inline[] {
  const parts: Inline[] = [];
  const text = (value: string) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last?.kind === 'text') last.text += value;
    else parts.push({ kind: 'text', text: value });
  };
  let at = 0;
  for (const match of source.matchAll(INLINE)) {
    text(source.slice(at, match.index));
    at = match.index + match[0].length;
    const [whole, label, url, code, strongA, strongB, emphasis, before, underscored] = match;
    if (label !== undefined && url !== undefined) {
      if (SAFE_LINK.test(url)) parts.push({ kind: 'link', text: label, url });
      else text(label);
    } else if (code !== undefined) parts.push({ kind: 'code', text: code });
    else if (strongA !== undefined) parts.push({ kind: 'strong', text: strongA });
    else if (strongB !== undefined) parts.push({ kind: 'strong', text: strongB });
    else if (emphasis !== undefined) parts.push({ kind: 'emphasis', text: emphasis });
    else if (underscored !== undefined) {
      text(before ?? '');
      parts.push({ kind: 'emphasis', text: underscored });
    } else if (!whole.startsWith('!')) text(whole);
  }
  text(source.slice(at));
  return parts;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
    if (quote.length > 0) {
      blocks.push({ kind: 'quote', inline: parseInline(quote.join(' ')) });
      quote = [];
    }
    if (list) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const line = raw.trim();

    if (FENCE.test(line)) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test((lines[index] ?? '').trim())) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    if (line === '') {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      // The screen's title is the only first-level heading; a body starts at the second.
      const level = Math.min(Math.max((heading[1] ?? '').length, 2), 4) as 2 | 3 | 4;
      blocks.push({ kind: 'heading', level, inline: parseInline(heading[2] ?? '') });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const quoted = QUOTE.exec(line);
    if (quoted) {
      if (quote.length === 0) flush();
      quote.push(quoted[1] ?? '');
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = numbered !== null;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(item[1] ?? '');
      continue;
    }
    // An indented line under a list item continues that item.
    if (list && /^\s+/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }
    if (quote.length > 0 || list) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}
