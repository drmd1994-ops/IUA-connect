import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const summary = z.strictObject({
  id: z.string(),
  to: z.string(),
  subject: z.string(),
  template: z.string(),
  sentAt: z.iso.datetime(),
});

/** The demo's latest sent emails, newest first (M18). */
export class DemoOutboxListDto extends createZodDto(z.strictObject({ items: z.array(summary) })) {}

/** One sent email: its text, and the links in it that lead to the site. */
export class DemoEmailDto extends createZodDto(
  summary.extend({ text: z.string(), links: z.array(z.url()) }),
) {}
