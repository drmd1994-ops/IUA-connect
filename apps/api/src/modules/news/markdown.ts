import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

/**
 * Article bodies are Markdown (M3 plan §11). On every save the body is parsed and rebuilt from an
 * allow-list of elements (SECURITY_MODEL.md "Input and output"):
 * - kept: paragraphs, headings (levels 2–4; a level-1 heading becomes level 2), lists, emphasis,
 *   bold, block quotes, code, horizontal rules, line breaks, and links to http, https and mailto;
 * - removed: raw HTML (and anything inside it), images (articles use the featured image and
 *   attachments), and links with other schemes such as javascript: (their text is kept).
 * The web app renders the result as React elements, never as HTML.
 */
export const MAX_BODY_LENGTH = 50_000;

interface MdNode {
  type: string;
  children?: MdNode[];
  depth?: number;
  url?: string;
  value?: string;
}

const KEEP = new Set([
  'root',
  'paragraph',
  'heading',
  'text',
  'emphasis',
  'strong',
  'blockquote',
  'list',
  'listItem',
  'inlineCode',
  'code',
  'thematicBreak',
  'break',
  'link',
]);

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Inline HTML whose contents must go too (opening and closing tags arrive as separate nodes). */
const CONTAINER_OPEN =
  /^<(script|style|iframe|object|embed|template|textarea|noscript|svg|math)\b/i;

function clean(node: MdNode): MdNode[] {
  if (node.type === 'link' && !SAFE_URL.test(node.url ?? '')) {
    return cleanChildren(node.children ?? []); // keep the words, drop the link
  }
  if (!KEEP.has(node.type)) return [];
  const copy: MdNode = { ...node };
  if (node.type === 'heading') copy.depth = Math.min(Math.max(node.depth ?? 2, 2), 4);
  if (node.children) copy.children = cleanChildren(node.children);
  return [copy];
}

function cleanChildren(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  let skipUntil: RegExp | null = null;
  for (const child of children) {
    if (skipUntil) {
      if (child.type === 'html' && skipUntil.test(child.value ?? '')) skipUntil = null;
      continue;
    }
    const open = child.type === 'html' ? CONTAINER_OPEN.exec(child.value ?? '') : null;
    if (open && !new RegExp(`</${open[1]}\\s*>`, 'i').test(child.value ?? '')) {
      skipUntil = new RegExp(`^</${open[1]}\\s*>`, 'i');
      continue;
    }
    out.push(...clean(child));
  }
  return out;
}

const processor = unified().use(remarkParse).use(remarkStringify, {
  bullet: '-',
  emphasis: '_',
  fences: true,
  rule: '-',
});

export function sanitizeMarkdown(input: string): string {
  const tree = processor.parse(input.replace(/\r\n?/g, '\n')) as MdNode;
  const [root] = clean(tree);
  return processor.stringify(root as never).trim();
}
