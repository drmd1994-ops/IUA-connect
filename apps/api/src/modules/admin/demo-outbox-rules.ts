/**
 * Reading the demo's sent emails (M18 plan §2, item 6). The demo mailer writes each email as an
 * HTML file named "<uuid>-<template>.html", starting with "<!-- To: … | Subject: … -->".
 */

/** An email's id: its file name without ".html". Nothing else names a file (no path, no dots). */
export const EMAIL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9-]{1,64}$/i;

export interface EmailHeader {
  to: string;
  subject: string;
  template: string;
}

/** The recipient, subject and template of an email, from its id and the first line of its file. */
export function readHeader(id: string, html: string): EmailHeader {
  const match = /^<!-- To: (.*?) \| Subject: (.*?) -->/.exec(html);
  return {
    to: match?.[1] ?? '',
    subject: match?.[2] ?? '',
    template: id.slice(37),
  };
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
};

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name] ?? '');
}

/** The email as plain text: no tags, no styles, one blank line at most between paragraphs. */
export function plainText(html: string): string {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The links in an email that lead to the site itself. Only those are shown: the page is for
 * following a sign-up's or a reset's link, and nothing in an email may send staff elsewhere.
 */
export function siteLinks(html: string, siteOrigin: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href="([^"]+)"/gi)) {
    try {
      const url = new URL(decode(match[1]!));
      if (url.origin === siteOrigin) links.add(url.toString());
    } catch {
      // Not an address; left out.
    }
  }
  return [...links];
}
