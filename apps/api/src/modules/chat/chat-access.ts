import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessService, organisationsOf } from '../access';
import { DirectoryService } from '../profiles';
import { type RoomKey } from './chat-rules';
import { type SendState } from './chat.dto';

export interface ChatSettings {
  audience: 'LISTED' | 'NOBODY';
  readReceipts: boolean;
  typing: boolean;
  /** Who may invite this person to a group or a room by invitation (M13). */
  invitesFrom: 'LISTED' | 'CONTACTS' | 'NOBODY';
  /** Shows the people they talk with when they are active, and sees it for them (M13). */
  showActivity: boolean;
}

/** The settings of a person who never opened "Chat settings". */
export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  audience: 'LISTED',
  readReceipts: true,
  typing: true,
  invitesFrom: 'LISTED',
  showActivity: true,
};

/**
 * Who may use chat and who may write to whom (M11 plan §3). Reading one's own conversations
 * needs only a signed-in account; starting a conversation and sending need an account the
 * platform knows as a physician's (M16; before that, an active membership of the association).
 * A room opens by its owner: the platform's to verified people, an organisation's to its members. Someone who can't be written to looks exactly like someone who doesn't exist.
 */
@Injectable()
export class ChatAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly directory: DirectoryService,
  ) {}

  /** The key to private chat, groups and the platform's rooms. */
  isVerified(principal: Principal): boolean {
    return principal.verified;
  }

  ensureVerified(principal: Principal): void {
    if (!this.isVerified(principal)) {
      throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
    }
  }

  /** What opens rooms to the caller: see `roomOpensTo`. */
  async roomKey(principal: Principal): Promise<RoomKey> {
    const viewer = await this.access.viewerOf(principal);
    return { verified: viewer.verified, organisationIds: organisationsOf(viewer) };
  }

  /** The same for another person (may they be invited, or made a moderator). */
  async roomKeyOf(userId: string): Promise<RoomKey> {
    const viewer = await this.access.viewerOfUser(userId);
    return { verified: viewer.verified, organisationIds: organisationsOf(viewer) };
  }

  /** Whether staff suspended this person from sending, now. */
  async suspended(userId: string, now = new Date()): Promise<boolean> {
    const row = await this.prisma.chatSuspension.findFirst({
      where: {
        userId,
        liftedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true },
    });
    return row !== null;
  }

  async ensureNotSuspended(userId: string): Promise<void> {
    if (await this.suspended(userId)) {
      throw new AppException('FORBIDDEN', [{ code: 'chatSuspended' }]);
    }
  }

  async blocks(me: string, other: string): Promise<{ byMe: boolean; byThem: boolean }> {
    const rows = await this.prisma.chatBlock.findMany({
      where: {
        OR: [
          { blockerId: me, blockedId: other },
          { blockerId: other, blockedId: me },
        ],
      },
      select: { blockerId: true },
    });
    return {
      byMe: rows.some((row) => row.blockerId === me),
      byThem: rows.some((row) => row.blockerId === other),
    };
  }

  async settings(userIds: readonly string[]): Promise<Map<string, ChatSettings>> {
    const rows = await this.prisma.chatPreference.findMany({
      where: { userId: { in: [...new Set(userIds)] } },
      select: {
        userId: true,
        audience: true,
        readReceipts: true,
        typing: true,
        invitesFrom: true,
        showActivity: true,
      },
    });
    const stored = new Map(rows.map(({ userId, ...settings }) => [userId, settings]));
    return new Map(userIds.map((id) => [id, stored.get(id) ?? DEFAULT_CHAT_SETTINGS]));
  }

  /**
   * The people among these that `me` may start a conversation with: listed in the directory,
   * not set to "nobody", and with no block in either direction.
   */
  async reachable(me: string, userIds: readonly string[]): Promise<Set<string>> {
    const ids = [...new Set(userIds)].filter((id) => id !== me);
    if (ids.length === 0) return new Set();
    const [listed, closed, blocks] = await Promise.all([
      this.directory.listedAmong(ids),
      this.prisma.chatPreference.findMany({
        where: { userId: { in: ids }, audience: 'NOBODY' },
        select: { userId: true },
      }),
      this.prisma.chatBlock.findMany({
        where: {
          OR: [
            { blockerId: me, blockedId: { in: ids } },
            { blockerId: { in: ids }, blockedId: me },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const excluded = new Set([
      ...closed.map((row) => row.userId),
      ...blocks.map((row) => (row.blockerId === me ? row.blockedId : row.blockerId)),
    ]);
    return new Set(ids.filter((id) => listed.has(id) && !excluded.has(id)));
  }

  /** A first and a last name: needed wherever other people will see who this is. */
  async ensureNamed(userId: string): Promise<void> {
    const own = (await this.directory.cards([userId])).get(userId);
    if (!own?.firstName?.trim() || !own.lastName?.trim()) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatNameRequired' }]);
    }
  }

  /**
   * The people among these that `me` already talks with: the other person of a private
   * conversation that holds a message, or someone in a group with them (M13).
   */
  async contactsAmong(me: string, userIds: readonly string[]): Promise<Set<string>> {
    const ids = [...new Set(userIds)].filter((id) => id !== me);
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<{ userId: string }[]>`
      SELECT DISTINCT o.user_id AS "userId"
      FROM conversation_members m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> m.user_id
      WHERE m.user_id = ${me}::uuid
        AND o.user_id = ANY(${ids}::uuid[])
        AND ((c.kind = 'DIRECT' AND c.last_seq > 0) OR c.kind = 'GROUP')`;
    return new Set(rows.map((row) => row.userId));
  }

  /**
   * Whether the reader can send to the other person of a conversation, and if not, why. The
   * other person is never the reason shown: "blocked" covers a block in either direction, and
   * the web shows a neutral text unless the reader made the block themselves.
   */
  async sendState(principal: Principal, otherId: string | null): Promise<SendState> {
    if (!this.isVerified(principal)) return 'membersOnly';
    if (await this.suspended(principal.userId)) return 'suspended';
    if (!otherId) return 'unavailable';
    const other = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { status: true },
    });
    if (!other || other.status === 'DISABLED') return 'unavailable';
    const { byMe, byThem } = await this.blocks(principal.userId, otherId);
    return byMe || byThem ? 'blocked' : 'none';
  }
}
