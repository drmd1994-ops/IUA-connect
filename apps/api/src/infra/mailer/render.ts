import { directionOf, getMessages } from '@iua/i18n';
import { type EmailMessage, type EmailTemplate } from './mailer';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Replaces {name} placeholders. Values are escaped by the caller for HTML output. */
const interpolate = (text: string, params: Record<string, unknown>) =>
  text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );

/** Renders a transactional email in the recipient's locale (subject, HTML and plain text). */
export function renderEmail<T extends EmailTemplate>(message: EmailMessage<T>): RenderedEmail {
  const { emails } = getMessages(message.locale);
  const copy = emails[message.template] as Record<string, string>;
  const params = message.params as Record<string, unknown>;
  const htmlParams = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, escapeHtml(String(value))]),
  );
  const link = (params.link ?? params.signInLink) as string | undefined;

  const paragraphs = ['body', 'reason', 'expiry', 'resetHint', 'notYou']
    .filter((key) => copy[key])
    .map((key) => ({ key, text: copy[key]! }));
  const dir = directionOf(message.locale);
  // Subjects may carry placeholders too (for example the event's title).
  const subject = interpolate(copy.subject!, params);

  const html = [
    '<!doctype html>',
    `<html lang="${message.locale}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`,
    '<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #131a1e; max-width: 560px; margin: 24px auto; padding: 0 16px">',
    `<h1 style="font-size: 22px; color: #0c2d3d">${escapeHtml(copy.heading!)}</h1>`,
    ...paragraphs.map(({ text }) => `<p>${interpolate(escapeHtml(text), htmlParams)}</p>`),
    link && copy.action
      ? `<p><a href="${escapeHtml(link)}" style="display: inline-block; background: #134d67; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none">${escapeHtml(copy.action)}</a></p>`
      : '',
    link
      ? `<p style="font-size: 13px; color: #4c5a63; word-break: break-all">${escapeHtml(link)}</p>`
      : '',
    message.template === 'verifyEmail' || message.template === 'passwordReset'
      ? `<p style="font-size: 13px; color: #4c5a63">${escapeHtml(emails.layout.ignore)}</p>`
      : '',
    `<p>${escapeHtml(emails.layout.signature)}</p>`,
    `<hr><p style="font-size: 12px; color: #4c5a63">${escapeHtml(emails.layout.demoNotice)}</p>`,
    '</body></html>',
  ]
    .filter(Boolean)
    .join('\n');

  const text = [
    copy.heading,
    ...paragraphs.map(({ text: paragraph }) => interpolate(paragraph, params)),
    link ? `${copy.action ?? ''}: ${link}` : '',
    emails.layout.signature,
    emails.layout.demoNotice,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, html, text };
}
