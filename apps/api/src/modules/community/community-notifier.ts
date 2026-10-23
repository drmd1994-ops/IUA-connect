import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Notifier } from '../notifications';

type PersonalTemplate = 'communityComment' | 'communityReply' | 'communityMention';

export interface PostNotice {
  postId: string;
  title: string;
  communitySlug: string;
  communityId: string;
  writerId: string;
  writerName: string;
}

/**
 * Notices about communities (M25 plan §2), under the "Communities" switches. Personal ones (a
 * comment on your post, a reply to your comment, a mention) go through the app and, when the
 * person switched it on, email. What concerns many people (a new post in a community they
 * follow, a new comment on a post they follow) is one statement, in the app only. Nobody is told
 * about someone they blocked, or about their own writing. A failure never undoes the post.
 */
@Injectable()
export class CommunityNotifier {
  private readonly logger = new Logger(CommunityNotifier.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly notifier: Notifier,
  ) {}

  private path(notice: PostNotice): string {
    return `/communities/${notice.communitySlug}/${notice.postId}`;
  }

  /** A new post: its mentions, and the community's followers. */
  async newPost(notice: PostNotice, mentions: readonly string[]): Promise<void> {
    const told = await this.personal(notice, 'communityMention', mentions);
    await this.many(
      notice,
      'communityPost',
      `SELECT f.user_id FROM community_follows f WHERE f.community_id = $1::uuid`,
      notice.communityId,
      told,
    );
  }

  /** A new comment: the post's writer, the parent comment's writer, mentions, then followers. */
  async newComment(
    notice: PostNotice,
    postWriterId: string | null,
    parentWriterId: string | null,
    mentions: readonly string[],
  ): Promise<void> {
    const told = new Set<string>();
    for (const id of await this.personal(notice, 'communityMention', mentions)) told.add(id);
    if (parentWriterId && !told.has(parentWriterId)) {
      for (const id of await this.personal(notice, 'communityReply', [parentWriterId])) {
        told.add(id);
      }
    }
    if (postWriterId && !told.has(postWriterId)) {
      for (const id of await this.personal(notice, 'communityComment', [postWriterId])) {
        told.add(id);
      }
    }
    await this.many(
      notice,
      'communityFollowedPost',
      `SELECT f.user_id FROM post_follows f WHERE f.post_id = $1::uuid`,
      notice.postId,
      [...told],
    );
  }

  /** One notice to each person, by the Notifier (app, and email when switched on). */
  private async personal(
    notice: PostNotice,
    template: PersonalTemplate,
    userIds: readonly string[],
  ): Promise<string[]> {
    const ids = [...new Set(userIds)].filter((id) => id !== notice.writerId);
    if (ids.length === 0) return [];
    const people = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        status: 'ACTIVE',
        // Not someone who blocked the writer.
        chatBlocksMade: { none: { blockedId: notice.writerId } },
      },
      select: { id: true, email: true, locale: true },
    });
    for (const person of people) {
      const locale: Locale = isLocale(person.locale) ? person.locale : DEFAULT_LOCALE;
      try {
        await this.notifier.send({
          userId: person.id,
          kind: 'COMMUNITIES',
          to: person.email,
          locale,
          template,
          params: {
            name: notice.writerName,
            title: notice.title,
            link: new URL(`/${locale}${this.path(notice)}`, this.env.APP_BASE_URL).toString(),
          },
        });
      } catch (error) {
        this.logger.warn({ err: error, template }, 'Community notice failed');
      }
    }
    return people.map((person) => person.id);
  }

  /** One statement: a notice in the app for each of `audience`, but the writer and `skip`. */
  private async many(
    notice: PostNotice,
    type: 'communityPost' | 'communityFollowedPost',
    audience: string,
    audienceId: string,
    skip: readonly string[],
  ): Promise<void> {
    try {
      const params = JSON.stringify({ name: notice.writerName, title: notice.title });
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notifications (id, user_id, kind, type, params, link)
         SELECT gen_random_uuid(), a.user_id, 'COMMUNITIES', $2, $3::jsonb, $4
         FROM (${audience}) a
         JOIN users u ON u.id = a.user_id AND u.status = 'ACTIVE'
         WHERE a.user_id <> $5::uuid
           AND NOT (a.user_id = ANY($6::uuid[]))
           AND NOT EXISTS (
             SELECT 1 FROM chat_blocks b
             WHERE b.blocker_id = a.user_id AND b.blocked_id = $5::uuid
           )
           AND NOT EXISTS (
             SELECT 1 FROM notification_preferences p
             WHERE p.user_id = a.user_id AND p.kind = 'COMMUNITIES' AND p.channel = 'APP'
               AND NOT p.enabled
           )`,
        audienceId,
        type,
        params,
        this.path(notice),
        notice.writerId,
        [...skip],
      );
    } catch (error) {
      this.logger.warn({ err: error, type }, 'Community notices failed');
    }
  }
}
