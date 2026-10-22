import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { outboxDir } from '../../infra/mailer/console-mailer';
import { AuditService } from '../audit';
import { type DemoEmailDto, type DemoOutboxListDto } from './demo-outbox.dto';
import { EMAIL_ID, plainText, readHeader, siteLinks } from './demo-outbox-rules';

const LATEST = 50;

/**
 * The emails the demo "sent" (M18 plan §2, item 6). The demo mailer writes them to a folder on
 * the server, which nobody can open on a host; sign-up and password reset need their links. Only
 * while the demo mailer is in use, which real production refuses. Each email read is audited:
 * its links act for the person it was sent to.
 */
@Injectable()
export class DemoOutboxService {
  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  private folder(): string {
    if (this.env.MAILER_ADAPTER !== 'console') throw new AppException('NOT_FOUND');
    return outboxDir(this.env);
  }

  async list(): Promise<DemoOutboxListDto> {
    const folder = this.folder();
    const names = await readdir(folder).catch(() => [] as string[]);
    // Names start with a time-ordered id, so the newest sort last.
    const ids = names
      .filter((name) => name.endsWith('.html'))
      .map((name) => name.slice(0, -5))
      .filter((id) => EMAIL_ID.test(id))
      .sort()
      .reverse()
      .slice(0, LATEST);
    const items = await Promise.all(
      ids.map(async (id) => {
        const file = path.join(folder, `${id}.html`);
        const [html, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
        return { id, ...readHeader(id, html), sentAt: info.mtime.toISOString() };
      }),
    );
    return { items };
  }

  async get(id: string, principal: Principal, meta: RequestMeta): Promise<DemoEmailDto> {
    const folder = this.folder();
    if (!EMAIL_ID.test(id)) throw new AppException('NOT_FOUND');
    const file = path.join(folder, `${id}.html`);
    const read = await Promise.all([readFile(file, 'utf8'), stat(file)]).catch(() => null);
    if (!read) throw new AppException('NOT_FOUND');
    const [html, info] = read;
    const header = readHeader(id, html);
    await this.audit.record({
      action: 'demo.outbox.read',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'demo_email',
      entityId: id.slice(0, 36),
      changes: { template: header.template },
    });
    return {
      id,
      ...header,
      sentAt: info.mtime.toISOString(),
      text: plainText(html),
      links: siteLinks(html, new URL(this.env.APP_BASE_URL).origin),
    };
  }
}
