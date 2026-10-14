import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Locale, DEFAULT_LOCALE, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { invitationHashInput } from '../../common/invitation-hash';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { SecretHasher } from '../../infra/crypto/secrets';
import { Mailer } from '../../infra/mailer/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';

/** How many invitations a person may send in a day. */
export const INVITATIONS_PER_DAY = 20;
/** The same person is not invited again by the same colleague within this many days. */
export const REINVITE_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Inviting a colleague (M17 plan §2, step 6). A verified person sends an email that brings a
 * colleague to the page on how to join; it verifies nobody and gives no rights. The answer is
 * the same whether or not the address already has an account, so nobody learns who is here;
 * someone already here gets nothing.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly hasher: SecretHasher,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  async invite(
    principal: Principal,
    input: { email: string; locale?: Locale },
    meta: RequestMeta,
    now = new Date(),
  ): Promise<void> {
    if (!principal.verified) {
      throw new AppException('FORBIDDEN', [{ code: 'verifiedOnly' }]);
    }
    const sentToday = await this.prisma.platformInvitation.count({
      where: { inviterId: principal.userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    });
    if (sentToday >= INVITATIONS_PER_DAY) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'invitationLimit' }]);
    }

    const emailHash = this.hasher.hash(invitationHashInput(input.email));
    const [already, recent, inviter] = await Promise.all([
      // The column ignores case.
      this.prisma.user.findUnique({ where: { email: input.email.trim() }, select: { id: true } }),
      this.prisma.platformInvitation.findFirst({
        where: {
          inviterId: principal.userId,
          emailHash,
          createdAt: { gt: new Date(now.getTime() - REINVITE_AFTER_DAYS * DAY_MS) },
        },
        select: { id: true },
      }),
      this.prisma.profile.findUnique({
        where: { userId: principal.userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    const id = uuidv7();
    await this.prisma.platformInvitation.create({
      // Someone already here never counts as joined: that would tell the inviter they are here.
      data: { id, inviterId: principal.userId, emailHash },
    });
    await this.audit.record({
      action: 'invitation.send',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'platform_invitation',
      entityId: id,
    });
    // Someone already here, or invited by this colleague lately, gets no email.
    if (already || recent) return;

    const locale: Locale = input.locale && isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;
    const name = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(' ');
    try {
      await this.mailer.send({
        to: input.email.trim(),
        locale,
        template: 'platformInvitation',
        params: {
          inviter: name,
          link: new URL(`/${locale}/about`, this.env.APP_BASE_URL).toString(),
        },
      });
    } catch (error) {
      this.logger.error({ err: error, invitationId: id }, 'Invitation email failed');
    }
  }

  /** How many the person sent, how many of those addresses have an account now, and what is left today. */
  async mine(
    userId: string,
    now = new Date(),
  ): Promise<{ sent: number; joined: number; leftToday: number }> {
    const [sent, joined, today] = await Promise.all([
      this.prisma.platformInvitation.count({ where: { inviterId: userId } }),
      this.prisma.platformInvitation.count({
        where: { inviterId: userId, acceptedAt: { not: null } },
      }),
      this.prisma.platformInvitation.count({
        where: { inviterId: userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
      }),
    ]);
    return { sent, joined, leftToday: Math.max(0, INVITATIONS_PER_DAY - today) };
  }
}
