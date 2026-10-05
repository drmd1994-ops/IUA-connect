import { Injectable, Logger } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ChatAccess } from './chat-access';
import { ACTIVITY_WRITE_EVERY_MS, activityLabel } from './chat-rules';
import { ChatStream } from './chat-stream';
import { type ActivityDto } from './chat.dto';

/** An "is around" event goes to at most this many of a person's contacts. */
const CONTACTS_LIMIT = 500;

/**
 * Online and "last active" (M13 plan §2.3, §3). Online is not stored: it is whether the person
 * has a chat page open. "Last active" is one time per person, written at most every ten
 * minutes, and shown rounded ("today", "this week", "a while ago"), never as a time.
 *
 * It is shown only to people who already have a private conversation or a group with that
 * person, only when that person shows their activity, and only to someone who shows theirs.
 * Anyone else gets nothing: no label, and no event.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccess,
    private readonly stream: ChatStream,
  ) {
    this.stream.onPresence((userId, online) => void this.changed(userId, online));
  }

  /** What the reader may know about when these people were last around. */
  async get(principal: Principal, userIds: readonly string[]): Promise<ActivityDto> {
    const me = principal.userId;
    const ids = [...new Set(userIds)].filter((id) => id !== me);
    if (ids.length === 0) return { items: [] };
    const settings = await this.access.settings([me, ...ids]);
    if (!settings.get(me)!.showActivity) return { items: [] };
    const [contacts, rows] = await Promise.all([
      this.access.contactsAmong(me, ids),
      this.prisma.chatPreference.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, lastActiveAt: true },
      }),
    ]);
    const lastActive = new Map(rows.map((row) => [row.userId, row.lastActiveAt]));
    const now = new Date();
    return {
      items: ids.flatMap((userId) => {
        if (!contacts.has(userId) || !settings.get(userId)!.showActivity) return [];
        const activity = activityLabel(
          this.stream.isOnline(userId),
          lastActive.get(userId) ?? null,
          now,
        );
        return activity ? [{ userId, activity }] : [];
      }),
    };
  }

  /**
   * A person's first chat page opened, or their last one closed. The time is kept, and the
   * people they talk with are told that something about them changed (they then ask what).
   */
  private async changed(userId: string, online: boolean): Promise<void> {
    try {
      const now = new Date();
      const stale = new Date(now.getTime() - ACTIVITY_WRITE_EVERY_MS);
      // Leaving is when they were last around; arriving is written only now and then.
      await this.prisma.$executeRaw`
        INSERT INTO chat_preferences (user_id, last_active_at, updated_at)
        VALUES (${userId}::uuid, ${now}, ${now})
        ON CONFLICT (user_id) DO UPDATE SET last_active_at = ${now}
        WHERE ${!online} OR chat_preferences.last_active_at IS NULL
           OR chat_preferences.last_active_at <= ${stale}`;
      if (!(await this.access.settings([userId])).get(userId)!.showActivity) return;
      const contacts = await this.prisma.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT o.user_id AS "userId"
        FROM conversation_members m
        JOIN conversations c ON c.id = m.conversation_id
        JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> m.user_id
        WHERE m.user_id = ${userId}::uuid
          AND ((c.kind = 'DIRECT' AND c.last_seq > 0) OR c.kind = 'GROUP')
        LIMIT ${CONTACTS_LIMIT}`;
      await this.stream.publish(
        contacts.map((row) => row.userId),
        { type: 'activity', userId },
      );
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Activity could not be recorded');
    }
  }
}
