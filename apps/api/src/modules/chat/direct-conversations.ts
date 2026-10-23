import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ChatStream } from './chat-stream';
import { GROUP_MAX_MEMBERS, pairOf } from './chat-rules';

/**
 * Opens a private conversation between two people that another feature has brought together
 * (M28: an accepted mentorship), whether or not either is listed in the directory. Both agreed:
 * one asked, the other accepted. Everything else about the conversation (blocking, reports,
 * leaving it) is chat's as usual.
 */
@Injectable()
export class DirectConversations {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stream: ChatStream,
  ) {}

  /** The conversation's id; created when the two have none, joined again when one left it. */
  async open(a: string, b: string): Promise<string> {
    const pair = pairOf(a, b);
    let id = (
      await this.prisma.conversation.findFirst({
        where: { kind: 'DIRECT', ...pair },
        select: { id: true },
      })
    )?.id;
    if (!id) {
      const created = uuidv7();
      try {
        await this.prisma.conversation.create({
          data: {
            id: created,
            kind: 'DIRECT',
            ...pair,
            members: { create: [{ userId: a }, { userId: b }] },
          },
        });
        id = created;
      } catch (error) {
        // Both were brought together at the same moment: the pair is unique, so one of them won.
        if (!isUniqueViolation(error)) throw error;
        id = (
          await this.prisma.conversation.findFirstOrThrow({
            where: { kind: 'DIRECT', ...pair },
            select: { id: true },
          })
        ).id;
      }
    }
    for (const userId of [a, b]) {
      await this.prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId: id, userId } },
        create: { conversationId: id, userId },
        update: { archivedAt: null },
      });
    }
    // Their open chat windows show it in the list.
    await this.stream.publish([a, b], { type: 'refresh' });
    return id;
  }

  /**
   * Opens a group for something another feature runs (M27: a research project's group), with
   * its admin in it. People join it only through that feature (an accepted request).
   */
  async openGroup(name: string, adminId: string): Promise<string> {
    const id = uuidv7();
    await this.prisma.conversation.create({
      data: {
        id,
        kind: 'GROUP',
        nameHe: name.slice(0, 120),
        createdBy: adminId,
        memberCount: 1,
        members: { create: [{ userId: adminId, role: 'ADMIN' }] },
      },
    });
    await this.stream.publish([adminId], { type: 'refresh' });
    return id;
  }

  /** Adds a person to such a group; false when it is full (as chat's own groups, 50 people). */
  async joinGroup(groupId: string, userId: string): Promise<boolean> {
    const joined = await this.prisma.$transaction(async (tx) => {
      const already = await tx.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: groupId, userId } },
        select: { userId: true },
      });
      if (already) return true;
      const { count } = await tx.conversation.updateMany({
        where: { id: groupId, kind: 'GROUP', memberCount: { lt: GROUP_MAX_MEMBERS } },
        data: { memberCount: { increment: 1 } },
      });
      if (count === 0) return false;
      await tx.conversationMember.create({ data: { conversationId: groupId, userId } });
      return true;
    });
    if (joined) await this.stream.publish([userId], { type: 'refresh' });
    return joined;
  }
}
