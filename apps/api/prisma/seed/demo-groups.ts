import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uuidv7 } from '@iua/shared';
import sharp from 'sharp';
import { type Prisma, type PrismaClient } from '../../src/generated/prisma/client';
import { onePagePdf } from './demo-education';

/**
 * Demo groups, invitations and files in messages (M13 plan §2.9): one group of the three demo
 * members with a few messages, a drawn sample picture and a sample PDF; one group the demo
 * member is invited to and has not answered; and one room by invitation with an invitation
 * waiting for the demo member. Everything is fictional and says so; nothing in it is medical,
 * and no picture is of a person. There is no sample video: the seed can't draw one.
 * Development only (the seed runner refuses production). Runs once: skipped when a group
 * already exists. It follows the demo rooms.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Tx = Prisma.TransactionClient;

export async function seedDemoGroups(prisma: PrismaClient): Promise<void> {
  const user = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
  const [admin, full, honorary, resident] = await Promise.all([
    user('admin@demo.test'),
    user('member.full@demo.test'),
    user('member.honorary@demo.test'),
    user('member.resident@demo.test'),
  ]);
  if (!admin || !full || !honorary || !resident) {
    console.log('seed: demo groups need the demo people first, skipped');
    return;
  }
  if (await prisma.conversation.findFirst({ where: { kind: 'GROUP' } })) {
    console.log('seed: demo groups already present, skipped');
    return;
  }
  const category = await prisma.chatRoomCategory.findUnique({ where: { key: 'ASSOCIATION' } });
  const now = Date.now();
  // A drawn picture: coloured shapes, nothing photographed.
  const picture = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">
         <rect width="640" height="400" fill="#eef4f8"/>
         <rect x="60" y="230" width="90" height="110" fill="#134e6b"/>
         <rect x="190" y="170" width="90" height="170" fill="#2f7fa3"/>
         <rect x="320" y="110" width="90" height="230" fill="#134e6b"/>
         <rect x="450" y="60" width="90" height="280" fill="#2f7fa3"/>
         <rect x="40" y="340" width="560" height="6" fill="#0f2f40"/>
       </svg>`,
    ),
  )
    .png()
    .toBuffer();
  const thumbnail = await sharp(picture).resize(480, 480, { fit: 'inside' }).png().toBuffer();
  const document = onePagePdf([
    'Reading group: timetable (sample)',
    'IUA Connect demo. This document is fictional.',
  ]);

  await prisma.$transaction(
    async (tx) => {
      // The reading group: Noa made it and runs it; Ruth and Yoav accepted.
      const readingId = uuidv7();
      const lines: { from: string; body: string; ago: number; files?: string[] }[] = [
        {
          from: full,
          body: 'פתחתי קבוצה לתיאום קבוצת הקריאה. (הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.)',
          ago: 3 * DAY,
        },
        { from: resident, body: 'Thanks! Which day suits everyone?', ago: 3 * DAY - HOUR },
        {
          from: full,
          body: 'Here is the timetable, and a chart of how many came each month. (Sample files: a drawn chart and a one-page document.)',
          ago: 5 * HOUR,
          files: [
            await storeFile(tx, {
              name: 'attendance-chart.png',
              mimeType: 'image/png',
              kind: 'IMAGE',
              body: picture,
              thumbnail,
              width: 640,
              height: 400,
              ownerUserId: full,
            }),
            await storeFile(tx, {
              name: 'reading-group-timetable.pdf',
              mimeType: 'application/pdf',
              kind: 'DOCUMENT',
              body: document,
              ownerUserId: full,
            }),
          ],
        },
        { from: honorary, body: 'מצוין, תודה. יום שלישי מתאים לי.', ago: 70 * MINUTE },
      ];
      await tx.conversation.create({
        data: {
          id: readingId,
          kind: 'GROUP',
          nameHe: 'קבוצת קריאה / Reading group',
          createdBy: full,
          memberCount: 3,
          lastSeq: lines.length,
          lastMessageAt: new Date(now - lines.at(-1)!.ago),
          createdAt: new Date(now - 3 * DAY - HOUR),
          members: {
            create: [
              {
                userId: full,
                role: 'ADMIN' as const,
                lastReadSeq: 3,
                lastDeliveredSeq: lines.length,
              },
              {
                userId: honorary,
                role: 'MEMBER' as const,
                lastReadSeq: lines.length,
                lastDeliveredSeq: lines.length,
              },
              {
                userId: resident,
                role: 'MEMBER' as const,
                lastReadSeq: lines.length,
                lastDeliveredSeq: lines.length,
              },
            ].map((member) => ({ ...member, joinedAt: new Date(now - 3 * DAY - HOUR) })),
          },
        },
      });
      for (const [index, line] of lines.entries()) {
        await tx.message.create({
          data: {
            id: uuidv7(now - line.ago),
            conversationId: readingId,
            seq: index + 1,
            senderId: line.from,
            body: line.body,
            createdAt: new Date(now - line.ago),
            attachments: {
              create: (line.files ?? []).map((fileId, position) => ({ fileId, position })),
            },
          },
        });
      }

      // A group Ruth made; Noa was invited and has not answered.
      const organisersId = uuidv7();
      await tx.conversation.create({
        data: {
          id: organisersId,
          kind: 'GROUP',
          nameHe: 'מארגני המפגש השנתי / Annual meeting organisers',
          createdBy: honorary,
          memberCount: 1,
          lastSeq: 1,
          lastMessageAt: new Date(now - 2 * HOUR),
          createdAt: new Date(now - 2 * HOUR - 10 * MINUTE),
          members: {
            create: [
              {
                userId: honorary,
                role: 'ADMIN',
                lastReadSeq: 1,
                lastDeliveredSeq: 1,
                joinedAt: new Date(now - 2 * HOUR - 10 * MINUTE),
              },
            ],
          },
          messages: {
            create: [
              {
                id: uuidv7(now - 2 * HOUR),
                seq: 1,
                senderId: honorary,
                body: 'A first note for the organisers. (A sample message in the demo version. Every detail in it is fictional.)',
                createdAt: new Date(now - 2 * HOUR),
              },
            ],
          },
          invitations: {
            create: [
              {
                id: uuidv7(),
                userId: full,
                invitedBy: honorary,
                createdAt: new Date(now - 2 * HOUR),
                expiresAt: new Date(now + 30 * DAY),
              },
            ],
          },
        },
      });

      // A room by invitation: Ruth moderates it, and Noa is invited.
      await tx.conversation.create({
        data: {
          id: uuidv7(),
          kind: 'ROOM',
          nameHe: 'ועדת הכנס',
          nameEn: 'Conference committee',
          descriptionHe: 'חדר בהזמנה לחברי ועדת הכנס. (חדר לדוגמה בגרסת ההדגמה.)',
          descriptionEn:
            'A room by invitation for the conference committee. (A sample room in the demo version.)',
          categoryId: category?.id ?? null,
          inviteOnly: true,
          createdBy: admin,
          memberCount: 2,
          lastSeq: 1,
          lastMessageAt: new Date(now - 6 * HOUR),
          createdAt: new Date(now - DAY),
          members: {
            create: [
              { userId: honorary, role: 'MODERATOR' as const, lastReadSeq: 1, lastDeliveredSeq: 1 },
              { userId: resident, role: 'MEMBER' as const, lastReadSeq: 0, lastDeliveredSeq: 1 },
            ].map((member) => ({ ...member, joinedAt: new Date(now - DAY) })),
          },
          messages: {
            create: [
              {
                id: uuidv7(now - 6 * HOUR),
                seq: 1,
                senderId: honorary,
                body: 'ברוכים הבאים לוועדת הכנס. (הודעה לדוגמה בגרסת ההדגמה. כל הפרטים בה בדויים.)',
                createdAt: new Date(now - 6 * HOUR),
              },
            ],
          },
          invitations: {
            create: [
              {
                id: uuidv7(),
                userId: full,
                invitedBy: honorary,
                createdAt: new Date(now - 5 * HOUR),
                expiresAt: new Date(now + 30 * DAY),
              },
            ],
          },
        },
      });

      // Noa keeps the reading group at the top of her list.
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId: readingId, userId: full } },
        data: { pinnedAt: new Date(now - DAY) },
      });
    },
    { timeout: 60_000 },
  );
  console.log(
    'seed: demo groups created (2 groups, 1 room by invitation, 2 invitations waiting, 2 files)',
  );
}

/** Stores bytes the way an upload for chat is stored, and returns the file's id. */
async function storeFile(
  tx: Tx,
  file: {
    name: string;
    mimeType: string;
    kind: 'IMAGE' | 'DOCUMENT';
    body: Buffer;
    thumbnail?: Buffer;
    width?: number;
    height?: number;
    ownerUserId: string;
  },
): Promise<string> {
  const today = new Date();
  const folder = `${today.getUTCFullYear()}/${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const storageKey = `${folder}/${randomUUID()}`;
  const root = path.join(REPO_ROOT, process.env.STORAGE_DIR ?? 'storage');
  const target = path.join(root, ...storageKey.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.body, { flag: 'wx' });
  if (file.thumbnail) await writeFile(`${target}.thumb`, file.thumbnail, { flag: 'wx' });
  const id = uuidv7();
  await tx.storedFile.create({
    data: {
      id,
      storageKey,
      thumbnailKey: file.thumbnail ? `${storageKey}.thumb` : null,
      originalName: file.name,
      mimeType: file.mimeType,
      kind: file.kind,
      purpose: 'CHAT',
      sizeBytes: file.body.length,
      sha256: createHash('sha256').update(file.body).digest('hex'),
      width: file.width ?? null,
      height: file.height ?? null,
      scanStatus: 'UNSCANNED',
      ownerUserId: file.ownerUserId,
      attachedAt: today,
    },
  });
  return id;
}
