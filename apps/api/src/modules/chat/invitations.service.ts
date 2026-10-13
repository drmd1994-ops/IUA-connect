import { Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { mayActOn } from '../../common/auth/scope';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { DirectoryService } from '../profiles';
import { ChatAccess } from './chat-access';
import { personView } from './chat-messages';
import { GROUP_MAX_MEMBERS, INVITATION_DAYS, roomOpensTo } from './chat-rules';
import { ChatStream } from './chat-stream';
import {
  type AcceptedInvitationDto,
  type ChatPeopleDto,
  type InvitationListDto,
  type SentInvitationsDto,
} from './chat.dto';
import { GroupsService } from './groups.service';
import { RoomsService } from './rooms.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How many people a search for someone to invite shows. */
const PEOPLE_LIMIT = 20;

interface Target {
  id: string;
  kind: 'GROUP' | 'ROOM';
  nameHe: string;
  nameEn: string | null;
  memberCount: number;
}

/**
 * Invitations to a group or to a room by invitation (M13 plan §2.1, §2.2, §3). An invitation
 * gives nothing until the invited person accepts it: they are not in the conversation, hear
 * none of its events and read none of it. Someone who can't be invited looks exactly like
 * someone who doesn't exist.
 *
 * Who may invite: a group's admin; in a room by invitation, its moderators and staff with the
 * chat permission.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccess,
    private readonly directory: DirectoryService,
    private readonly stream: ChatStream,
    private readonly groups: GroupsService,
    private readonly rooms: RoomsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Refuses, with "not found", when any of these people can't be invited by this person to a
   * group. Used before a group is made, so a group is never left half invited.
   */
  async ensureGroupInvitable(principal: Principal, userIds: readonly string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    const allowed = await this.invitable(principal.userId, 'GROUP', null, ids);
    if (ids.some((id) => !allowed.has(id))) throw new AppException('NOT_FOUND');
  }

  /**
   * Invites people. People already in, and people already invited, are passed over. Answers
   * how many invitations were made.
   */
  async invite(
    principal: Principal,
    conversationId: string,
    userIds: readonly string[],
    meta: RequestMeta,
  ): Promise<number> {
    const me = principal.userId;
    const target = await this.authority(principal, conversationId);
    if (target.kind === 'GROUP') {
      this.access.ensureVerified(principal);
      await this.access.ensureNotSuspended(me);
    }
    const ids = [...new Set(userIds)].filter((id) => id !== me);
    const allowed = await this.invitable(me, target.kind, target.id, ids);
    if (ids.some((id) => !allowed.has(id))) throw new AppException('NOT_FOUND');

    await this.expire();
    const [inside, waiting] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { conversationId, userId: { in: ids } },
        select: { userId: true },
      }),
      this.prisma.conversationInvitation.findMany({
        where: { conversationId, status: 'OPEN' },
        select: { userId: true },
      }),
    ]);
    const skip = new Set([...inside, ...waiting].map((row) => row.userId));
    const fresh = ids.filter((id) => !skip.has(id));
    if (
      target.kind === 'GROUP' &&
      target.memberCount + waiting.length + fresh.length > GROUP_MAX_MEMBERS
    ) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatGroupFull' }]);
    }
    const now = new Date();
    const made: string[] = [];
    for (const userId of fresh) {
      try {
        await this.prisma.conversationInvitation.create({
          data: {
            id: uuidv7(),
            conversationId,
            userId,
            invitedBy: me,
            createdAt: now,
            expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY_MS),
          },
        });
        made.push(userId);
      } catch (error) {
        // Invited at the same moment by someone else: one invitation is enough.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (made.length === 0) return 0;
    await this.notify(target, me, made);
    await this.stream.publish(made, { type: 'invitation' });
    await this.audit.record({
      action: 'chat.invite',
      correlationId: meta.correlationId,
      actorUserId: me,
      actorIp: meta.ip,
      entityType: target.kind === 'GROUP' ? 'chat_group' : 'chat_room',
      entityId: conversationId,
      changes: { userIds: made },
    });
    return made.length;
  }

  /** The people the reader may invite, by name. Everyone else is simply not found. */
  async people(principal: Principal, q: string, conversationId?: string): Promise<ChatPeopleDto> {
    const me = principal.userId;
    const target = conversationId ? await this.authority(principal, conversationId) : null;
    if (!target) this.access.ensureVerified(principal);
    const found = await this.directory.find(q, PEOPLE_LIMIT, 0);
    const ids = found.items.map((item) => item.id);
    const allowed = await this.invitable(me, target?.kind ?? 'GROUP', target?.id ?? null, ids);
    const taken = target
      ? new Set(
          [
            ...(await this.prisma.conversationMember.findMany({
              where: { conversationId: target.id, userId: { in: ids } },
              select: { userId: true },
            })),
            ...(await this.prisma.conversationInvitation.findMany({
              where: {
                conversationId: target.id,
                userId: { in: ids },
                status: 'OPEN',
                expiresAt: { gt: new Date() },
              },
              select: { userId: true },
            })),
          ].map((row) => row.userId),
        )
      : new Set<string>();
    return {
      items: found.items
        .filter((item) => allowed.has(item.id) && !taken.has(item.id))
        .map((item) => ({
          id: item.id,
          firstName: item.firstName,
          lastName: item.lastName,
          title: item.title,
          photoFileId: item.photoFileId,
        })),
    };
  }

  /** The reader's invitations that wait for an answer, newest first. */
  async mine(principal: Principal): Promise<InvitationListDto> {
    const me = principal.userId;
    const rows = await this.prisma.conversationInvitation.findMany({
      where: {
        userId: me,
        status: 'OPEN',
        expiresAt: { gt: new Date() },
        conversation: { archivedAt: null },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        invitedBy: true,
        createdAt: true,
        expiresAt: true,
        conversation: {
          select: {
            id: true,
            kind: true,
            nameHe: true,
            nameEn: true,
            memberCount: true,
            // Only a group's people are shown to someone invited; a room shows its size.
            members: { select: { userId: true }, orderBy: { joinedAt: 'asc' } },
          },
        },
      },
    });
    const groups = rows.filter((row) => row.conversation.kind === 'GROUP');
    const cards = await this.directory.cards([
      ...rows.flatMap((row) => (row.invitedBy ? [row.invitedBy] : [])),
      ...groups.flatMap((row) => row.conversation.members.map((member) => member.userId)),
    ]);
    return {
      items: rows.map((row) => {
        const c = row.conversation;
        const group = c.kind === 'GROUP';
        return {
          id: row.id,
          kind: group ? ('GROUP' as const) : ('ROOM' as const),
          conversationId: c.id,
          name: c.nameHe ?? '',
          nameEn: c.nameEn,
          memberCount: c.memberCount,
          invitedBy: personView(
            row.invitedBy,
            row.invitedBy ? cards.get(row.invitedBy) : undefined,
          ),
          members: group
            ? c.members.map((member) => personView(member.userId, cards.get(member.userId)))
            : [],
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        };
      }),
    };
  }

  /** The invitations to one group or room that wait for an answer, for whoever may invite. */
  async sent(principal: Principal, conversationId: string): Promise<SentInvitationsDto> {
    await this.authority(principal, conversationId);
    const rows = await this.prisma.conversationInvitation.findMany({
      where: { conversationId, status: 'OPEN', expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, userId: true, createdAt: true, expiresAt: true },
    });
    const cards = await this.directory.cards(rows.map((row) => row.userId));
    return {
      items: rows.map((row) => ({
        id: row.id,
        user: personView(row.userId, cards.get(row.userId)),
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })),
    };
  }

  /** Accepts: from this moment the person is in the group or room, and only from this moment. */
  async accept(
    principal: Principal,
    id: string,
    meta: RequestMeta,
  ): Promise<AcceptedInvitationDto> {
    const me = principal.userId;
    const invitation = await this.own(me, id);
    const target = invitation.conversation;
    this.access.ensureVerified(principal);
    // An organisation's room is for its members, also by invitation.
    if (
      target.kind === 'ROOM' &&
      !roomOpensTo(await this.access.roomKey(principal), target.organisationId)
    ) {
      throw new AppException('NOT_FOUND');
    }
    // The people there will see who came in.
    await this.access.ensureNamed(me);
    if (target.kind === 'ROOM' && (await this.rooms.banned(target.id, me))) {
      throw new AppException('FORBIDDEN', [{ code: 'chatRoomBanned' }]);
    }
    let added: boolean;
    try {
      added = await this.prisma.$transaction(async (tx) => {
        // Claimed first, so an invitation is used once whatever arrives at the same moment.
        const { count } = await tx.conversationInvitation.updateMany({
          where: { id, status: 'OPEN' },
          data: { status: 'ACCEPTED', resolvedAt: new Date() },
        });
        if (count === 0) throw new AppException('NOT_FOUND');
        if (target.kind === 'GROUP') return this.groups.addInside(tx, target.id, me);
        const inserted = await tx.$queryRaw<{ userId: string }[]>`
          INSERT INTO conversation_members
            (conversation_id, user_id, role, last_read_seq, last_delivered_seq)
          SELECT c.id, ${me}::uuid, 'MEMBER', c.last_seq, c.last_seq
          FROM conversations c WHERE c.id = ${target.id}::uuid
          ON CONFLICT (conversation_id, user_id) DO NOTHING
          RETURNING user_id AS "userId"`;
        if (inserted.length === 0) return false;
        await tx.$executeRaw`
          UPDATE conversations SET member_count = member_count + 1
          WHERE id = ${target.id}::uuid`;
        return true;
      });
    } catch (error) {
      throw GroupsService.full(error);
    }
    if (added) {
      await this.stream.setPresence(me, target.id, true);
      await this.stream.publishRoom(target.id, { type: 'room', conversationId: target.id });
    }
    await this.stream.publish([me], { type: 'invitation' });
    await this.audit.record({
      action: 'chat.invitation.accept',
      correlationId: meta.correlationId,
      actorUserId: me,
      actorIp: meta.ip,
      entityType: target.kind === 'GROUP' ? 'chat_group' : 'chat_room',
      entityId: target.id,
    });
    return { kind: target.kind === 'GROUP' ? 'GROUP' : 'ROOM', conversationId: target.id };
  }

  /** Declines. Whoever invited is not told. */
  async decline(principal: Principal, id: string): Promise<void> {
    const me = principal.userId;
    await this.own(me, id);
    await this.prisma.conversationInvitation.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'DECLINED', resolvedAt: new Date() },
    });
    await this.stream.publish([me], { type: 'invitation' });
  }

  /** Takes an invitation back: whoever may invite to that group or room. */
  async withdraw(principal: Principal, id: string): Promise<void> {
    const invitation = await this.prisma.conversationInvitation.findFirst({
      where: { id, status: 'OPEN' },
      select: { userId: true, conversationId: true },
    });
    if (!invitation) throw new AppException('NOT_FOUND');
    await this.authority(principal, invitation.conversationId);
    await this.prisma.conversationInvitation.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'WITHDRAWN', resolvedAt: new Date() },
    });
    await this.stream.publish([invitation.userId], { type: 'invitation' });
  }

  // --- Internals ------------------------------------------------------------------------------

  /** An open invitation of the reader's own, or "not found". */
  private async own(userId: string, id: string) {
    const invitation = await this.prisma.conversationInvitation.findFirst({
      where: {
        id,
        userId,
        status: 'OPEN',
        expiresAt: { gt: new Date() },
        conversation: { archivedAt: null },
      },
      select: { conversation: { select: { id: true, kind: true, organisationId: true } } },
    });
    if (!invitation || invitation.conversation.kind === 'DIRECT') {
      throw new AppException('NOT_FOUND');
    }
    return invitation;
  }

  /**
   * The group or room, when the reader may invite to it. One of its other people is refused;
   * for anyone else it doesn't exist.
   */
  private async authority(principal: Principal, conversationId: string): Promise<Target> {
    const me = principal.userId;
    const row = await this.prisma.conversation.findFirst({
      where: { id: conversationId, kind: { in: ['GROUP', 'ROOM'] }, archivedAt: null },
      select: {
        id: true,
        kind: true,
        nameHe: true,
        nameEn: true,
        memberCount: true,
        inviteOnly: true,
        organisationId: true,
        members: { where: { userId: me }, select: { role: true } },
      },
    });
    const mine = row?.members[0]?.role ?? null;
    const target = (): Target => ({
      id: row!.id,
      kind: row!.kind === 'GROUP' ? 'GROUP' : 'ROOM',
      nameHe: row!.nameHe ?? '',
      nameEn: row!.nameEn,
      memberCount: row!.memberCount,
    });
    if (row?.kind === 'GROUP') {
      if (mine === 'ADMIN') return target();
      throw new AppException(mine ? 'FORBIDDEN' : 'NOT_FOUND');
    }
    if (row?.kind === 'ROOM') {
      const staff = mayActOn(principal, 'chat.moderate', row.organisationId);
      const moderator =
        mine === 'MODERATOR' &&
        roomOpensTo(await this.access.roomKey(principal), row.organisationId);
      if (staff || moderator) {
        if (row.inviteOnly) return target();
        // An open room needs no invitation: anyone may join it.
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'chatRoomNotInviteOnly' }]);
      }
      if (mine) throw new AppException('FORBIDDEN');
    }
    throw new AppException('NOT_FOUND');
  }

  /**
   * The people among these who may be invited by this person. Nobody is invited across a block
   * or against their own setting ("nobody", or "only people I talk with").
   * - To a group: only someone the inviter could write to privately, or already talks with.
   * - To a room: anyone the room is for (a verified person for the platform's rooms, an active
   *   member for an organisation's) who is not banned from it.
   */
  private async invitable(
    me: string,
    kind: 'GROUP' | 'ROOM',
    roomId: string | null,
    userIds: readonly string[],
  ): Promise<Set<string>> {
    const ids = [...new Set(userIds)].filter((id) => id !== me);
    if (ids.length === 0) return new Set();
    const [settings, contacts, reachable, blocks, users] = await Promise.all([
      this.access.settings(ids),
      this.access.contactsAmong(me, ids),
      this.access.reachable(me, ids),
      this.prisma.chatBlock.findMany({
        where: {
          OR: [
            { blockerId: me, blockedId: { in: ids } },
            { blockerId: { in: ids }, blockedId: me },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: ids }, status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    const blocked = new Set(
      blocks.map((row) => (row.blockerId === me ? row.blockedId : row.blockerId)),
    );
    const room = roomId
      ? await this.prisma.conversation.findUnique({
          where: { id: roomId },
          select: { organisationId: true },
        })
      : null;
    const existing = new Set(users.map((user) => user.id));
    const allowed = new Set<string>();
    for (const id of ids) {
      if (!existing.has(id) || blocked.has(id)) continue;
      const wants = settings.get(id)!.invitesFrom;
      if (wants === 'NOBODY') continue;
      if (wants === 'CONTACTS' && !contacts.has(id)) continue;
      if (kind === 'GROUP') {
        if (reachable.has(id) || contacts.has(id)) allowed.add(id);
        continue;
      }
      if (!roomOpensTo(await this.access.roomKeyOf(id), room?.organisationId ?? null)) continue;
      if (roomId && (await this.rooms.banned(roomId, id))) continue;
      allowed.add(id);
    }
    return allowed;
  }

  /** Invitations nobody answered in time are closed. */
  private async expire(): Promise<void> {
    await this.prisma.conversationInvitation.updateMany({
      where: { status: 'OPEN', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED', resolvedAt: new Date() },
    });
  }

  /**
   * A notice under the bell for each person invited, unless they switched that kind off in the
   * app: a group under "Private messages", a room under "Chat rooms". A failure here never
   * undoes the invitation.
   */
  private async notify(
    target: Target,
    inviterId: string,
    userIds: readonly string[],
  ): Promise<void> {
    try {
      const inviter = (await this.directory.cards([inviterId])).get(inviterId);
      const params = JSON.stringify({
        titleHe: target.nameHe,
        titleEn: target.nameEn ?? target.nameHe,
        name: [inviter?.firstName, inviter?.lastName].filter(Boolean).join(' '),
      });
      const kind = target.kind === 'GROUP' ? 'MESSAGES' : 'ROOMS';
      const type = target.kind === 'GROUP' ? 'chatGroupInvitation' : 'chatRoomInvitation';
      await this.prisma.$executeRaw`
        INSERT INTO notifications (id, user_id, kind, type, params, link)
        SELECT gen_random_uuid(), u.id, ${kind}::notification_kind, ${type}, ${params}::jsonb,
               '/chat/invitations'
        FROM users u
        WHERE u.id = ANY(${[...userIds]}::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM notification_preferences p
            WHERE p.user_id = u.id AND p.kind = ${kind}::notification_kind
              AND p.channel = 'APP' AND NOT p.enabled
          )`;
    } catch (error) {
      this.logger.warn({ err: error, conversationId: target.id }, 'Invitation notices failed');
    }
  }
}
