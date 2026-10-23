import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';

/**
 * Communities for the demo (M25 plan §10, answer 5): about 10 posts with comments in 4
 * communities, written by the demo's fictional people, one question with its answer, and one
 * post removed by a moderator to show the marker. They talk about training, meetings and
 * research habits, never about a patient, and give no clinical advice (nothing medical is shown
 * without the owner's review). Moderators for the four, and a few follows.
 *
 * Communities replace chat rooms (§10, answer 6): this layer also archives every room, as the
 * migration does for a database that had them before.
 *
 * Development and the hosted demo only. Runs once: skipped when its first post exists, and when
 * the demo layer is missing. Its own layer, so a hosted demo seeded before M25 gets it.
 */
const MARKER_TITLE = 'Which journal club format works for a small department?';
const HOUR = 60 * 60 * 1000;

interface DemoComment {
  by: string;
  body: string;
  replyTo?: number;
  answer?: boolean;
}
interface DemoPost {
  community: string;
  by: string;
  kind: 'QUESTION' | 'DISCUSSION';
  title: string;
  body: string;
  hoursAgo: number;
  comments: DemoComment[];
  removed?: { by: string; reason: string };
}

const MODERATORS: Record<string, string> = {
  'uro-oncology': 'director.rambam@demo.test',
  urolithiasis: 'mentor.yonatan@demo.test',
  andrology: 'member.full@demo.test',
  pediatric: 'mentor.hila@demo.test',
};

const POSTS: DemoPost[] = [
  {
    community: 'uro-oncology',
    by: 'director.rambam@demo.test',
    kind: 'QUESTION',
    title: MARKER_TITLE,
    body: 'We are six urologists and four residents. A monthly session with one paper has faded out twice. What format kept yours going?',
    hoursAgo: 70,
    comments: [
      {
        by: 'mentor.rana@demo.test',
        body: 'Two short papers every two weeks, each presented by a resident in ten minutes, and the session never runs past 45 minutes. A fixed slot in the timetable mattered most.',
        answer: true,
      },
      {
        by: 'member.resident@demo.test',
        body: 'As a resident, a one-page template for the presentation helped a lot.',
        replyTo: 0,
      },
      { by: 'director.rambam@demo.test', body: 'Thank you both, we will try it this month.' },
    ],
  },
  {
    community: 'uro-oncology',
    by: 'mentor.rana@demo.test',
    kind: 'DISCUSSION',
    title: 'Writing a first paper during residency: what helped you?',
    body: 'Several residents asked me this week. My short list: a small, answerable question, a mentor who answers emails, and a fixed writing hour each week. What would you add?',
    hoursAgo: 40,
    comments: [
      {
        by: 'member.full@demo.test',
        body: 'Agree on the fixed hour. I would add: talk to a statistician before collecting anything.',
      },
      {
        by: 'applicant.student@demo.test',
        body: 'Is it realistic to start as a student, or is it better to wait?',
      },
      {
        by: 'mentor.rana@demo.test',
        body: 'Realistic, if the project is small. Many good first papers start that way.',
        replyTo: 1,
      },
    ],
  },
  {
    community: 'urolithiasis',
    by: 'mentor.yonatan@demo.test',
    kind: 'DISCUSSION',
    title: 'The stone course in the spring: who is going?',
    body: 'The yearly two-day course is open for registration. We can share rides from the south. Reply here if you plan to come.',
    hoursAgo: 30,
    comments: [
      {
        by: 'member.resident@demo.test',
        body: 'I am going, and can take two people from Tel Aviv.',
      },
      { by: 'director.sheba@demo.test', body: 'Two of our residents will be there too.' },
    ],
  },
  {
    community: 'urolithiasis',
    by: 'member.resident@demo.test',
    kind: 'QUESTION',
    title: 'Simulator training for ureteroscopy: how many hours before the first case?',
    body: 'Our department is setting up a simulator corner. How did other programmes decide how much simulator time a resident has before their first supervised case?',
    hoursAgo: 20,
    comments: [
      {
        by: 'mentor.yonatan@demo.test',
        body: 'We use a short checklist of tasks rather than hours: a resident moves on when they complete it twice without help. Hours alone said little.',
        answer: true,
      },
    ],
  },
  {
    community: 'andrology',
    by: 'member.full@demo.test',
    kind: 'DISCUSSION',
    title: 'A reading list for residents new to andrology',
    body: 'I am collecting a short reading list for residents starting their andrology rotation: review articles and the main guideline chapters. Suggestions welcome; I will post the final list here.',
    hoursAgo: 55,
    comments: [
      {
        by: 'director.sheba@demo.test',
        body: 'Please include the guideline summary chapters; residents read those first.',
      },
      { by: 'member.resident@demo.test', body: 'This would help a lot. Thank you.' },
    ],
  },
  {
    community: 'andrology',
    by: 'applicant.student@demo.test',
    kind: 'QUESTION',
    title: 'Is there an elective in andrology for medical students?',
    body: 'I am a fifth-year student. Do any departments offer a short elective that includes the andrology clinic?',
    hoursAgo: 12,
    comments: [
      {
        by: 'member.full@demo.test',
        body: 'We take one student each month. Write to me through Chat and I will tell you how to apply.',
      },
    ],
  },
  {
    community: 'andrology',
    by: 'member.resident@demo.test',
    kind: 'DISCUSSION',
    title: 'Selling textbooks',
    body: 'I have a few older textbooks to sell, write to me.',
    hoursAgo: 8,
    comments: [],
    removed: {
      by: 'member.full@demo.test',
      reason: 'Buying and selling is not what this community is for.',
    },
  },
  {
    community: 'pediatric',
    by: 'mentor.hila@demo.test',
    kind: 'DISCUSSION',
    title: 'Pediatric urology fellowships abroad: sharing experience',
    body: 'Several of us did a fellowship abroad. Let us collect here what each programme was like: the length, the language, the paperwork, and coming back.',
    hoursAgo: 48,
    comments: [
      {
        by: 'director.rambam@demo.test',
        body: 'The paperwork took us longer than expected; start a year ahead.',
      },
      {
        by: 'mentor.hila@demo.test',
        body: 'Agreed. I will add a short checklist of documents.',
        replyTo: 0,
      },
    ],
  },
  {
    community: 'pediatric',
    by: 'director.sheba@demo.test',
    kind: 'QUESTION',
    title: 'A shared on-call handbook for residents?',
    body: 'Would departments be willing to share their resident on-call handbooks (the organisational parts only), so we can learn from each other?',
    hoursAgo: 6,
    comments: [
      {
        by: 'mentor.hila@demo.test',
        body: 'Happy to share ours. I will remove the names and phone numbers first.',
      },
    ],
  },
  {
    community: 'uro-oncology',
    by: 'director.sheba@demo.test',
    kind: 'DISCUSSION',
    title: 'The annual meeting: topics you would like for the residents’ session',
    body: 'We are planning the residents’ session of the annual meeting. Which topics would you like? Career paths, research, and surgical training have been proposed so far.',
    hoursAgo: 3,
    comments: [],
  },
];

const FOLLOWS: [string, string][] = [
  ['member.resident@demo.test', 'urolithiasis'],
  ['member.resident@demo.test', 'uro-oncology'],
  ['applicant.student@demo.test', 'andrology'],
  ['member.full@demo.test', 'andrology'],
];

export async function seedDemoCommunities(prisma: PrismaClient): Promise<void> {
  // Communities replace chat rooms: every room is archived, kept for staff, nothing deleted.
  const archived = await prisma.conversation.updateMany({
    where: { kind: 'ROOM', archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (archived.count)
    console.log(`seed: communities layer — ${archived.count} chat rooms archived`);

  if (await prisma.post.findFirst({ where: { title: MARKER_TITLE } })) {
    console.log('seed: communities layer already present, skipped');
    return;
  }
  const emails = [
    ...new Set([
      ...Object.values(MODERATORS),
      ...POSTS.flatMap((p) => [p.by, ...p.comments.map((c) => c.by), p.removed?.by ?? p.by]),
      ...FOLLOWS.map(([email]) => email),
    ]),
  ];
  const users = new Map(
    (
      await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.email, u.id]),
  );
  if (!users.has('director.rambam@demo.test')) {
    console.log('seed: communities layer needs the demo layer first, skipped');
    return;
  }
  const communities = new Map(
    (await prisma.community.findMany({ select: { id: true, slug: true } })).map((c) => [
      c.slug,
      c.id,
    ]),
  );
  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    for (const [slug, email] of Object.entries(MODERATORS)) {
      const communityId = communities.get(slug);
      const userId = users.get(email);
      if (!communityId || !userId) continue;
      await tx.communityModerator.upsert({
        where: { communityId_userId: { communityId, userId } },
        create: { communityId, userId },
        update: {},
      });
    }
    for (const post of POSTS) {
      const communityId = communities.get(post.community);
      const authorId = users.get(post.by);
      if (!communityId || !authorId) continue;
      const id = uuidv7();
      const at = new Date(now - post.hoursAgo * HOUR);
      const commentIds: string[] = [];
      let answerId: string | null = null;
      await tx.post.create({
        data: {
          id,
          communityId,
          authorId,
          kind: post.kind,
          title: post.title,
          body: post.body,
          createdAt: at,
          activityAt: at,
          follows: { create: { userId: authorId } },
          ...(post.removed
            ? {
                removedAt: new Date(at.getTime() + HOUR),
                removedBy: users.get(post.removed.by) ?? null,
                removedReason: post.removed.reason,
              }
            : {}),
        },
      });
      let last = at;
      for (const [index, comment] of post.comments.entries()) {
        const by = users.get(comment.by);
        if (!by) continue;
        const commentId = uuidv7();
        last = new Date(at.getTime() + (index + 1) * HOUR);
        await tx.postComment.create({
          data: {
            id: commentId,
            postId: id,
            authorId: by,
            parentId: comment.replyTo !== undefined ? (commentIds[comment.replyTo] ?? null) : null,
            body: comment.body,
            createdAt: last,
          },
        });
        commentIds.push(commentId);
        if (comment.answer) answerId = commentId;
      }
      await tx.post.update({
        where: { id },
        data: {
          commentCount: commentIds.length,
          activityAt: last,
          answerCommentId: answerId,
        },
      });
    }
    for (const [email, slug] of FOLLOWS) {
      const userId = users.get(email);
      const communityId = communities.get(slug);
      if (!userId || !communityId) continue;
      await tx.communityFollow.upsert({
        where: { communityId_userId: { communityId, userId } },
        create: { communityId, userId },
        update: {},
      });
    }
  });
  console.log(`seed: communities layer — ${POSTS.length} posts`);
}
