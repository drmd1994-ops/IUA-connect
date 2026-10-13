import { uuidv7 } from '@medconnect/shared';
import { type Prisma, type PrismaClient } from '../../src/generated/prisma/client';

/**
 * Demo chat (M11 plan §2.16): a few conversations between the demo members who are listed in
 * the directory, in Hebrew and English, with unread messages, one muted conversation, one
 * blocked pair and one report waiting for review. Everything is fictional and says so; nothing
 * in it is medical. Development only (the seed runner refuses production). Runs once: skipped
 * when the demo members already have a conversation. It follows the notifications layer, which
 * lists these members in the directory.
 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

type Who = 'full' | 'honorary' | 'resident';

interface Line {
  from: Who;
  body: string;
  /** How long ago it was sent. */
  ago: number;
}

export async function seedDemoChat(prisma: PrismaClient): Promise<void> {
  const user = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
  const [full, honorary, resident] = await Promise.all([
    user('member.full@demo.test'),
    user('member.honorary@demo.test'),
    user('member.resident@demo.test'),
  ]);
  if (!full || !honorary || !resident) {
    console.log('seed: demo chat needs the demo people first, skipped');
    return;
  }
  const ids: Record<Who, string> = { full, honorary, resident };
  if (await prisma.conversationMember.findFirst({ where: { userId: full } })) {
    console.log('seed: demo chat already present, skipped');
    return;
  }
  const spam = await prisma.chatReportCategory.findUnique({ where: { key: 'SPAM' } });
  if (!spam) {
    console.log('seed: demo chat needs the reference layer first, skipped');
    return;
  }
  const now = Date.now();

  /** A conversation with its messages; `read` is how far each person has read. */
  const conversation = async (
    tx: Prisma.TransactionClient,
    a: Who,
    b: Who,
    lines: Line[],
    read: Partial<Record<Who, number>>,
    mine: Partial<Record<Who, Prisma.ConversationMemberUncheckedCreateWithoutConversationInput>>,
  ) => {
    const id = uuidv7();
    const [userLowId, userHighId] = ids[a] < ids[b] ? [ids[a], ids[b]] : [ids[b], ids[a]];
    const last = lines.at(-1)!;
    await tx.conversation.create({
      data: {
        id,
        kind: 'DIRECT',
        userLowId,
        userHighId,
        lastSeq: lines.length,
        lastMessageAt: new Date(now - last.ago),
        createdAt: new Date(now - lines[0]!.ago),
        members: {
          create: [a, b].map((who) => ({
            userId: ids[who as Who],
            joinedAt: new Date(now - lines[0]!.ago),
            lastReadSeq: read[who as Who] ?? lines.length,
            lastDeliveredSeq: lines.length,
            ...mine[who as Who],
          })),
        },
      },
    });
    const messages = lines.map((line, index) => ({
      id: uuidv7(now - line.ago),
      conversationId: id,
      seq: index + 1,
      senderId: ids[line.from],
      body: line.body,
      createdAt: new Date(now - line.ago),
    }));
    await tx.message.createMany({ data: messages });
    return { id, messages };
  };

  await prisma.$transaction(
    async (tx) => {
      // Hebrew and English, with two messages the demo member has not read yet.
      await conversation(
        tx,
        'full',
        'honorary',
        [
          {
            from: 'honorary',
            body: 'שלום נועה, ראית את סדר היום של המפגש השנתי? (הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.)',
            ago: 26 * HOUR,
          },
          { from: 'full', body: 'כן, תודה. אגיע למושב הבוקר.', ago: 25 * HOUR },
          {
            from: 'honorary',
            body: 'מצוין. Could you also chair the afternoon session?',
            ago: 3 * HOUR,
          },
          {
            from: 'full',
            body: 'בשמחה. אשלח לך את רשימת הדוברים עד יום חמישי.',
            ago: 2 * HOUR + 50 * MINUTE,
          },
          { from: 'honorary', body: 'תודה רבה!', ago: 40 * MINUTE },
          { from: 'honorary', body: 'ואם אפשר, גם את לוח הזמנים המעודכן.', ago: 38 * MINUTE },
        ],
        { full: 4 },
        {},
      );

      // Muted by the demo member, with one message waiting.
      await conversation(
        tx,
        'full',
        'resident',
        [
          {
            from: 'resident',
            body: 'Hello Dr. Bar-Lev, is the reading group still on Tuesday? (A sample message in the demo version. Every detail in it is fictional.)',
            ago: 50 * HOUR,
          },
          { from: 'full', body: 'Yes, at 16:00 in the seminar room.', ago: 49 * HOUR },
          { from: 'resident', body: 'Great, I will bring the slides.', ago: 5 * HOUR },
        ],
        { full: 2 },
        { full: { userId: full, muted: true } },
      );

      // An unwanted message: the resident blocked the sender and reported it.
      const unwanted = await conversation(
        tx,
        'honorary',
        'resident',
        [
          {
            from: 'honorary',
            body: 'A special price on conference posters, this week only! (A sample message in the demo version, written to show a report. Every detail in it is fictional.)',
            ago: 8 * HOUR,
          },
          { from: 'honorary', body: 'Did you see my offer?', ago: 7 * HOUR },
        ],
        {},
        {},
      );
      await tx.chatBlock.create({
        data: { blockerId: resident, blockedId: honorary, createdAt: new Date(now - 6 * HOUR) },
      });
      const reported = unwanted.messages[0]!;
      await tx.chatReport.create({
        data: {
          id: uuidv7(),
          reporterId: resident,
          reportedUserId: honorary,
          conversationId: unwanted.id,
          messageId: reported.id,
          categoryId: spam.id,
          description: 'Advertising I did not ask for. (A sample report in the demo version.)',
          snapshot: unwanted.messages.map((message) => ({
            seq: message.seq,
            senderId: message.senderId,
            body: message.body,
            deleted: false,
            createdAt: message.createdAt.toISOString(),
            reported: message.id === reported.id,
          })),
          createdAt: new Date(now - 6 * HOUR),
        },
      });
    },
    { timeout: 60_000 },
  );
  console.log('seed: demo chat created (3 conversations, 1 blocked pair, 1 report waiting)');
}
