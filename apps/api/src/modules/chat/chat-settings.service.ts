import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { DirectoryService } from '../profiles';
import { ChatAccess } from './chat-access';
import { ChatStream } from './chat-stream';
import { type BlockListDto, type ChatPeopleDto, type ChatSettingsDto } from './chat.dto';

/** How many people a search for someone to write to shows. */
const PEOPLE_LIMIT = 20;

/**
 * A person's chat settings, the people they blocked, and the search for someone to write to
 * (M11 plan §2.2, §2.10, §2.12).
 */
@Injectable()
export class ChatSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccess,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly audit: AuditService,
  ) {}

  async settings(userId: string): Promise<ChatSettingsDto> {
    return (await this.access.settings([userId])).get(userId)!;
  }

  async setSettings(
    userId: string,
    input: ChatSettingsDto,
    meta: RequestMeta,
  ): Promise<ChatSettingsDto> {
    const before = await this.settings(userId);
    await this.prisma.chatPreference.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });
    const changed = Object.fromEntries(
      (Object.keys(input) as (keyof ChatSettingsDto)[])
        .filter((key) => before[key] !== input[key])
        .map((key) => [key, input[key]]),
    );
    if (Object.keys(changed).length > 0) {
      await this.audit.record({
        action: 'chat.settings.update',
        correlationId: meta.correlationId,
        actorUserId: userId,
        actorIp: meta.ip,
        entityType: 'user',
        entityId: userId,
        changes: changed,
      });
    }
    return this.settings(userId);
  }

  /**
   * The people the reader may start a conversation with, by name: listed members who have not
   * set "nobody", with no block in either direction. Everyone else is simply not found.
   */
  async people(principal: Principal, q: string): Promise<ChatPeopleDto> {
    this.access.ensureVerified(principal);
    const found = await this.directory.find(q, PEOPLE_LIMIT, 0);
    const reachable = await this.access.reachable(
      principal.userId,
      found.items.map((item) => item.id),
    );
    return {
      items: found.items
        .filter((item) => reachable.has(item.id))
        .map((item) => ({
          id: item.id,
          firstName: item.firstName,
          lastName: item.lastName,
          title: item.title,
          photoFileId: item.photoFileId,
        })),
    };
  }

  async blocked(userId: string): Promise<BlockListDto> {
    const rows = await this.prisma.chatBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { blockedId: true, createdAt: true },
    });
    const cards = await this.directory.cards(rows.map((row) => row.blockedId));
    return {
      items: rows.map((row) => {
        const card = cards.get(row.blockedId);
        return {
          user: {
            id: row.blockedId,
            firstName: card?.firstName ?? null,
            lastName: card?.lastName ?? null,
            photoFileId: card?.photoFileId ?? null,
            listed: card?.listed ?? false,
            mark: card?.mark ?? null,
          },
          createdAt: row.createdAt.toISOString(),
        };
      }),
    };
  }

  /**
   * Blocks a person: neither can send to the other. Only someone the reader shares a
   * conversation with, or could write to, can be blocked; any other id is "not found", so
   * blocking can't be used to test who has an account.
   */
  async block(principal: Principal, targetId: string, meta: RequestMeta): Promise<void> {
    const me = principal.userId;
    if (targetId === me) throw new AppException('NOT_FOUND');
    const existing = await this.prisma.chatBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: me, blockedId: targetId } },
      select: { blockerId: true },
    });
    if (existing) return;
    const shared = await this.sharedConversations(me, targetId);
    if (shared.length === 0 && !(await this.directory.listedAmong([targetId])).has(targetId)) {
      // Someone who invited the reader can be blocked too, straight from the invitation.
      const invited = await this.prisma.conversationInvitation.count({
        where: { userId: me, invitedBy: targetId },
      });
      if (invited === 0) throw new AppException('NOT_FOUND');
    }
    await this.prisma.chatBlock.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId: targetId } },
      update: {},
      create: { blockerId: me, blockedId: targetId },
    });
    await this.audit.record({
      action: 'chat.block',
      correlationId: meta.correlationId,
      actorUserId: me,
      actorIp: meta.ip,
      entityType: 'user',
      entityId: targetId,
    });
    // Whatever that person invited the reader to is declined with the block.
    const { count } = await this.prisma.conversationInvitation.updateMany({
      where: { userId: me, invitedBy: targetId, status: 'OPEN' },
      data: { status: 'DECLINED', resolvedAt: new Date() },
    });
    if (count > 0) await this.stream.publish([me], { type: 'invitation' });
    await this.refresh(me, shared);
  }

  async unblock(principal: Principal, targetId: string, meta: RequestMeta): Promise<void> {
    const me = principal.userId;
    const { count } = await this.prisma.chatBlock.deleteMany({
      where: { blockerId: me, blockedId: targetId },
    });
    if (count === 0) return;
    await this.audit.record({
      action: 'chat.unblock',
      correlationId: meta.correlationId,
      actorUserId: me,
      actorIp: meta.ip,
      entityType: 'user',
      entityId: targetId,
    });
    await this.refresh(me, await this.sharedConversations(me, targetId));
  }

  private async sharedConversations(me: string, other: string): Promise<string[]> {
    const rows = await this.prisma.conversation.findMany({
      where: {
        AND: [{ members: { some: { userId: me } } }, { members: { some: { userId: other } } }],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** The reader's own open windows follow; the other person is told nothing. */
  private async refresh(me: string, conversationIds: readonly string[]): Promise<void> {
    await Promise.all(
      conversationIds.map((conversationId) =>
        this.stream.publish([me], { type: 'markers', conversationId, userId: me }),
      ),
    );
  }
}
