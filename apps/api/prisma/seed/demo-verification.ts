import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient, type VerifiedAs } from '../../src/generated/prisma/client';
import { parseEnv } from '../../src/config/env.schema';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { FieldCipher, SecretHasher } from '../../src/infra/crypto/secrets';
import { numberHashInput } from '../../src/modules/verification/verification-rules';
import { demoPassword } from '../../src/config/demo-password';

/**
 * Demo verification by the platform (M17 plan §10): a fictional reviewer, and fictional people
 * who belong to no organisation: two waiting (a resident, a specialist), one refused with a
 * reason, and one verified physician. Their numbers are made up and encrypted like real ones.
 * Development only. Runs once: skipped when the reviewer exists.
 */
const REVIEWER_EMAIL = 'verifier@demo.test';
const DAY = 24 * 60 * 60 * 1000;

interface Person {
  email: string;
  firstName: string;
  lastName: string;
  nameHe: string;
  kind: VerifiedAs;
  licence: string;
  certificate?: string;
  /** Days ago the request was sent. */
  sent: number;
  outcome: 'PENDING' | 'REJECTED' | 'APPROVED';
  reason?: string;
}

const PEOPLE: Person[] = [
  {
    email: 'waiting.resident@demo.test',
    firstName: 'Omer',
    lastName: 'Hadar',
    nameHe: 'עומר הדר',
    kind: 'RESIDENT',
    licence: '900001',
    sent: 2,
    outcome: 'PENDING',
  },
  {
    email: 'waiting.specialist@demo.test',
    firstName: 'Shira',
    lastName: 'Nevo',
    nameHe: 'שירה נבו',
    kind: 'SPECIALIST',
    licence: '900002',
    certificate: '700002',
    sent: 5,
    outcome: 'PENDING',
  },
  {
    email: 'refused.physician@demo.test',
    firstName: 'Gil',
    lastName: 'Amir',
    nameHe: 'גיל אמיר',
    kind: 'PHYSICIAN',
    licence: '900003',
    sent: 9,
    outcome: 'REJECTED',
    reason: 'The name in the register does not match the profile. Please check your name.',
  },
  {
    email: 'verified.physician@demo.test',
    firstName: 'Lior',
    lastName: 'Ben-Ami',
    nameHe: 'ליאור בן־עמי',
    kind: 'PHYSICIAN',
    licence: '900004',
    sent: 20,
    outcome: 'APPROVED',
  },
];

export async function seedDemoVerification(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL } })) {
    console.log('seed: demo verification already present, skipped');
    return;
  }
  const env = parseEnv(process.env);
  const cipher = new FieldCipher(env);
  const hasher = new SecretHasher(env);
  const passwordHash = await new PasswordHasher().hash(demoPassword());
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'VERIFIER' } });
  const ago = (days: number) => new Date(Date.now() - days * DAY);

  await prisma.$transaction(async (tx) => {
    const reviewer = uuidv7();
    await tx.user.create({
      data: {
        id: reviewer,
        email: REVIEWER_EMAIL,
        passwordHash,
        emailVerifiedAt: ago(60),
        locale: 'he',
      },
    });
    await tx.profile.create({
      data: {
        userId: reviewer,
        firstName: 'Ruth',
        lastName: 'Carmel',
        nameHe: 'רות כרמל',
        nameEn: 'Ruth Carmel',
        position: 'Physician verifier (fictional)',
        languages: ['he', 'en'],
      },
    });
    await tx.userRole.create({ data: { id: uuidv7(), userId: reviewer, roleId: role.id } });

    for (const person of PEOPLE) {
      const userId = uuidv7();
      const approved = person.outcome === 'APPROVED';
      const decidedAt = ago(person.sent - 1);
      await tx.user.create({
        data: {
          id: userId,
          email: person.email,
          passwordHash,
          emailVerifiedAt: ago(person.sent + 1),
          locale: 'he',
          ...(approved
            ? {
                verifiedAt: decidedAt,
                verifiedAs: person.kind,
                verifiedUntil: new Date(decidedAt.getTime() + 730 * DAY),
              }
            : {}),
        },
      });
      await tx.profile.create({
        data: {
          userId,
          firstName: person.firstName,
          lastName: person.lastName,
          nameHe: person.nameHe,
          nameEn: `${person.firstName} ${person.lastName}`,
          languages: ['he'],
        },
      });
      const requestId = uuidv7();
      await tx.physicianVerification.create({
        data: {
          id: requestId,
          userId,
          kind: person.kind,
          state: person.outcome,
          licenceEnc: cipher.encrypt(person.licence),
          licenceHash: hasher.hash(numberHashInput('licence', person.licence)),
          certificateEnc: person.certificate ? cipher.encrypt(person.certificate) : null,
          certificateHash: person.certificate
            ? hasher.hash(numberHashInput('certificate', person.certificate))
            : null,
          createdAt: ago(person.sent),
          closedAt: person.outcome === 'PENDING' ? null : decidedAt,
        },
      });
      if (person.outcome !== 'PENDING') {
        await tx.physicianVerificationDecision.create({
          data: {
            id: uuidv7(),
            verificationId: requestId,
            decision: approved ? 'APPROVE' : 'REJECT',
            decidedBy: reviewer,
            reason: person.reason ?? null,
            registerStatus: approved ? 'ACTIVE_PERMANENT' : 'NOT_FOUND',
            licenceMatches: approved ? true : null,
            at: decidedAt,
          },
        });
      }
    }
  });
  console.log(
    `seed: demo verification — a reviewer (${REVIEWER_EMAIL}), ${PEOPLE.length} people outside any organisation`,
  );
}
