import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type EmailMessage, type EmailTemplate, Mailer } from './mailer';
import { renderEmail } from './render';

/** Repository root (apps/api/{src|dist}/infra/mailer → four levels up). */
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

/** Where the demo mailer writes its emails; the demo's outbox page reads them there (M18). */
export function outboxDir(env: Env): string {
  return path.resolve(REPO_ROOT, env.MAIL_OUTBOX_DIR);
}

/** "dana.levi@example.test" → "d***@example.test", for logs. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Demo mailer: writes each email as an HTML file to MAIL_OUTBOX_DIR (git-ignored), so links in
 * verification and reset emails can be opened without a mail server. The log line never contains
 * the link or token, only where the file is.
 */
@Injectable()
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly outbox: string;

  constructor(@Inject(APP_CONFIG) env: Env) {
    super();
    this.outbox = outboxDir(env);
  }

  async send<T extends EmailTemplate>(message: EmailMessage<T>): Promise<void> {
    const { subject, html } = renderEmail(message);
    await mkdir(this.outbox, { recursive: true });
    const file = path.join(this.outbox, `${uuidv7()}-${message.template}.html`);
    const headers = `<!-- To: ${message.to} | Subject: ${subject} -->\n`;
    await writeFile(file, headers + html, 'utf8');
    this.logger.log(
      {
        template: message.template,
        to: maskEmail(message.to),
        file: path.relative(REPO_ROOT, file),
      },
      'Email written to outbox',
    );
  }
}
