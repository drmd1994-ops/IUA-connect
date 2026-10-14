import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { DEMO_PASSWORD } from './demo';

/**
 * Demo admin portal data (M8 plan §2.8): a super admin, who gives and removes roles and changes
 * the settings; fictional contact details for the footer; and a sample notice, written but
 * switched off. Development only (the seed runner refuses production). Runs once: skipped when
 * the super admin exists.
 */
const SUPER_ADMIN_EMAIL = 'super@demo.test';
const DAY = 24 * 60 * 60 * 1000;

export async function seedDemoPortal(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL } })) {
    console.log('seed: demo portal already present, skipped');
    return;
  }
  const passwordHash = await new PasswordHasher().hash(DEMO_PASSWORD);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const settings = await prisma.setting.count();

  await prisma.$transaction(async (tx) => {
    const id = uuidv7();
    await tx.user.create({
      data: {
        id,
        email: SUPER_ADMIN_EMAIL,
        passwordHash,
        emailVerifiedAt: new Date(Date.now() - 60 * DAY),
        verifiedAt: new Date(Date.now() - 60 * DAY),
        verifiedAs: 'PHYSICIAN',
        locale: 'he',
      },
    });
    await tx.profile.create({
      data: {
        userId: id,
        firstName: 'Ilan',
        lastName: 'Regev',
        nameHe: 'אילן רגב',
        nameEn: 'Ilan Regev',
        position: 'System administrator',
        languages: ['he', 'en'],
      },
    });
    await tx.userRole.create({ data: { id: uuidv7(), userId: id, roleId: role.id } });

    // Settings someone already saved are left alone.
    if (settings === 0) {
      await tx.setting.createMany({
        data: [
          {
            key: 'contact',
            updatedBy: id,
            value: {
              email: 'office@example.test',
              phone: '+972 3-000-0000',
              addressHe: 'רחוב הדוגמה 1, תל אביב (כתובת בדויה)',
              addressEn: '1 Example Street, Tel Aviv (fictional address)',
            },
          },
          {
            key: 'notice',
            updatedBy: id,
            value: {
              enabled: false,
              textHe: 'הודעה לדוגמה: האתר לא יהיה זמין ביום שישי בין 06:00 ל־07:00.',
              textEn:
                'Sample notice: the site will be unavailable on Friday between 06:00 and 07:00.',
            },
          },
        ],
      });
    }
  });
  console.log('seed: demo portal created (1 super admin, contact details, a notice switched off)');
}
