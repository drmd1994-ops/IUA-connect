import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ChatStream } from './chat-stream';
import { pairOf } from './chat-rules';

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
}
