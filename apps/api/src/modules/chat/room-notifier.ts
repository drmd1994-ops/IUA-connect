import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DirectoryService } from '../profiles';

export interface RoomMessageNotice {
  roomId: string;
  nameHe: string;
  nameEn: string | null;
  senderId: string;
  mentions: readonly string[];
  /** Whoever wrote the message this one replies to, when it is a reply. */
  replyToSenderId: string | null;
  announcement: boolean;
}

/**
 * Notices about rooms (M12 plan §2.11), under the "Chat rooms" switches: someone mentioned
 * you, someone replied to you, or an announcement in a room you are in. They appear under the
 * bell and link to the room. Ordinary room messages never make a notice.
 *
 * One statement writes them all, so an announcement in a large room is one query and not one
 * per member. A person gets one notice for a message, the most personal that applies. Nobody
 * is told who muted the room, blocked the sender, or switched the kind off in the app.
 */
@Injectable()
export class RoomNotifier {
  private readonly logger = new Logger(RoomNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
  ) {}

  /** A failure here never undoes the message that caused it. Answers how many were told. */
  async roomMessage(notice: RoomMessageNotice): Promise<number> {
    if (notice.mentions.length === 0 && !notice.replyToSenderId && !notice.announcement) return 0;
    try {
      const sender = (await this.directory.cards([notice.senderId])).get(notice.senderId);
      const params = JSON.stringify({
        titleHe: notice.nameHe,
        titleEn: notice.nameEn ?? notice.nameHe,
        name: [sender?.firstName, sender?.lastName].filter(Boolean).join(' '),
      });
      const mentions = [...notice.mentions];
      return await this.prisma.$executeRaw`
        INSERT INTO notifications (id, user_id, kind, type, params, link)
        SELECT gen_random_uuid(), m.user_id, 'ROOMS',
               CASE
                 WHEN m.user_id = ANY(${mentions}::uuid[]) THEN 'chatMention'
                 WHEN m.user_id = ${notice.replyToSenderId}::uuid THEN 'chatReply'
                 ELSE 'chatAnnouncement'
               END,
               ${params}::jsonb,
               ${`/chat/rooms/${notice.roomId}`}
        FROM conversation_members m
        WHERE m.conversation_id = ${notice.roomId}::uuid
          AND m.user_id <> ${notice.senderId}::uuid
          AND (
            m.user_id = ANY(${mentions}::uuid[])
            OR m.user_id = ${notice.replyToSenderId}::uuid
            OR ${notice.announcement}
          )
          AND NOT (m.muted AND (m.muted_until IS NULL OR m.muted_until > now()))
          AND NOT EXISTS (
            SELECT 1 FROM chat_blocks b
            WHERE b.blocker_id = m.user_id AND b.blocked_id = ${notice.senderId}::uuid
          )
          AND NOT EXISTS (
            SELECT 1 FROM notification_preferences p
            WHERE p.user_id = m.user_id AND p.kind = 'ROOMS' AND p.channel = 'APP'
              AND NOT p.enabled
          )`;
    } catch (error) {
      this.logger.warn({ err: error, roomId: notice.roomId }, 'Room notices failed');
      return 0;
    }
  }
}
