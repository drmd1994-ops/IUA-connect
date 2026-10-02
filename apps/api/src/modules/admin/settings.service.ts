import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import {
  DEFAULT_SETTINGS,
  type PublicSettingsDto,
  type SiteSettings,
  contactSchema,
  noticeSchema,
} from './settings.dto';

/**
 * The site settings (M8 plan §2.5, owner answer §11.2): the association's contact details,
 * shown in the footer, and a notice shown at the top of every page while it is switched on.
 * A value that was never set, or that no longer fits its shape, reads as "not set".
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SiteSettings> {
    const rows = await this.prisma.setting.findMany();
    const value = (key: string) => rows.find((row) => row.key === key)?.value;
    const contact = contactSchema.safeParse(value('contact'));
    const notice = noticeSchema.safeParse(value('notice'));
    return {
      contact: contact.success ? contact.data : DEFAULT_SETTINGS.contact,
      notice: notice.success ? notice.data : DEFAULT_SETTINGS.notice,
    };
  }

  async public(): Promise<PublicSettingsDto> {
    const { contact, notice } = await this.get();
    return {
      contact,
      notice: notice.enabled ? { textHe: notice.textHe, textEn: notice.textEn } : null,
    };
  }

  async set(input: SiteSettings, principal: Principal, meta: RequestMeta): Promise<SiteSettings> {
    const before = await this.get();
    const changed = (['contact', 'notice'] as const).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(input[key]),
    );
    if (changed.length === 0) return before;
    await this.prisma.$transaction(
      changed.map((key) => {
        const value = input[key] as Prisma.InputJsonValue;
        return this.prisma.setting.upsert({
          where: { key },
          update: { value, updatedBy: principal.userId },
          create: { key, value, updatedBy: principal.userId },
        });
      }),
    );
    await this.audit.record({
      action: 'settings.update',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'settings',
      changes: Object.fromEntries(changed.map((key) => [key, input[key]])),
    });
    return this.get();
  }
}
