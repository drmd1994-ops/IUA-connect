import { uuidv7 } from '@iua/shared';
import { FIRST_ORGANISATION } from './reference-data';
import { type PrismaClient } from '../../src/generated/prisma/client';
import { parseEnv } from '../../src/config/env.schema';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { FieldCipher, SecretHasher } from '../../src/infra/crypto/secrets';
import { identifierHashInput } from '../../src/modules/membership/identifier';
import { endOfYear, todayInIsrael } from '../../src/modules/membership/period';

/**
 * Demo layer (DATABASE_DESIGN.md §6, layer 2; M2 plan §11 answer 4): fictional people only, on the
 * reserved demo.test domain, sharing one documented password, with memberships and applications
 * at every step of the workflow. Development only: the seed runner refuses production. Runs once
 * (skipped when the demo admin exists).
 *
 * Every administrative role requires two-step verification, so the demo admin and directors set up
 * a passkey or an authenticator app at their first sign-in.
 */
export const DEMO_PASSWORD = 'ilikeIUAconnect11';
const DOMAIN = 'demo.test';

interface Person {
  local: string;
  firstName: string;
  lastName: string;
  nameHe: string;
  nameEn: string;
  locale?: 'he' | 'en';
  title?: string;
  position?: string;
  hospital?: string;
}

const people = {
  admin: {
    local: 'admin',
    firstName: 'Dana',
    lastName: 'Mizrahi',
    nameHe: 'דנה מזרחי',
    nameEn: 'Dana Mizrahi',
  },
  directorRambam: {
    local: 'director.rambam',
    firstName: 'Avi',
    lastName: 'Karmeli',
    nameHe: 'ד״ר אבי כרמלי',
    nameEn: 'Dr. Avi Karmeli',
    title: 'Dr.',
    position: 'Head of Department',
    hospital: 'rambam',
  },
  directorSheba: {
    local: 'director.sheba',
    firstName: 'Michal',
    lastName: 'Ofer',
    nameHe: 'ד״ר מיכל עופר',
    nameEn: 'Dr. Michal Ofer',
    title: 'Dr.',
    position: 'Head of Department',
    hospital: 'sheba',
    locale: 'en',
  },
  full: {
    local: 'member.full',
    firstName: 'Noa',
    lastName: 'Bar-Lev',
    nameHe: 'ד״ר נועה בר־לב',
    nameEn: 'Dr. Noa Bar-Lev',
    title: 'Dr.',
    position: 'Senior Urologist',
    hospital: 'rambam',
  },
  resident: {
    local: 'member.resident',
    firstName: 'Yoav',
    lastName: 'Sela',
    nameHe: 'יואב סלע',
    nameEn: 'Yoav Sela',
    position: 'Resident',
    hospital: 'sheba',
  },
  honorary: {
    local: 'member.honorary',
    firstName: 'Ruth',
    lastName: 'Golan',
    nameHe: 'פרופ׳ רות גולן',
    nameEn: 'Prof. Ruth Golan',
    title: 'Prof.',
    locale: 'en',
  },
  suspended: {
    local: 'member.suspended',
    firstName: 'Eitan',
    lastName: 'Harel',
    nameHe: 'ד״ר איתן הראל',
    nameEn: 'Dr. Eitan Harel',
    hospital: 'sheba',
  },
  expired: {
    local: 'member.expired',
    firstName: 'Lior',
    lastName: 'Ben-Ami',
    nameHe: 'ליאור בן־עמי',
    nameEn: 'Lior Ben-Ami',
    hospital: 'rambam',
  },
  pendingDirector: {
    local: 'applicant.director',
    firstName: 'Tamar',
    lastName: 'Levin',
    nameHe: 'תמר לוין',
    nameEn: 'Tamar Levin',
    position: 'Resident',
    hospital: 'rambam',
  },
  pendingAdmin: {
    local: 'applicant.admin',
    firstName: 'Omer',
    lastName: 'Shani',
    nameHe: 'ד״ר עומר שני',
    nameEn: 'Dr. Omer Shani',
    hospital: 'sheba',
  },
  student: {
    local: 'applicant.student',
    firstName: 'Maya',
    lastName: 'Adler',
    nameHe: 'מאיה אדלר',
    nameEn: 'Maya Adler',
    locale: 'en',
  },
  rejected: {
    local: 'applicant.rejected',
    firstName: 'Gal',
    lastName: 'Peretz',
    nameHe: 'גל פרץ',
    nameEn: 'Gal Peretz',
    hospital: 'rambam',
  },
  noDirector: {
    local: 'applicant.nodirector',
    firstName: 'Shira',
    lastName: 'Navon',
    nameHe: 'ד״ר שירה נבון',
    nameEn: 'Dr. Shira Navon',
    hospital: 'soroka',
  },
} satisfies Record<string, Person>;

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const adminEmail = `${people.admin.local}@${DOMAIN}`;
  if (await prisma.user.findUnique({ where: { email: adminEmail } })) {
    console.log('seed: demo layer already present, skipped');
    return;
  }
  const env = parseEnv(process.env);
  const cipher = new FieldCipher(env);
  const hasher = new SecretHasher(env);
  const passwordHash = await new PasswordHasher().hash(DEMO_PASSWORD);
  const today = todayInIsrael();
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const types = new Map(
    (
      await prisma.membershipType.findMany({ where: { organisationId: FIRST_ORGANISATION.id } })
    ).map((type) => [type.key, type] as const),
  );
  const urology = async (code: string) =>
    prisma.department.findFirstOrThrow({
      where: { code: 'urology', hospital: { code } },
      select: { id: true, hospitalId: true },
    });
  const place = {
    rambam: await urology('rambam'),
    sheba: await urology('sheba'),
    soroka: await urology('soroka'),
  };
  const roleId = async (key: string) =>
    (await prisma.role.findUniqueOrThrow({ where: { key } })).id;

  let certificate = 900_000;
  const identifier = (kind: 'SPECIALIST_CERTIFICATE' | 'MEDICAL_LICENCE') => {
    const value = String(++certificate);
    return {
      identifierEnc: cipher.encrypt(value),
      identifierHash: hasher.hash(identifierHashInput(kind, value)),
    };
  };

  await prisma.$transaction(
    async (tx) => {
      const ids = new Map<string, string>();
      for (const [key, person] of Object.entries(people) as [string, Person][]) {
        const id = uuidv7();
        ids.set(key, id);
        await tx.user.create({
          data: {
            id,
            email: `${person.local}@${DOMAIN}`,
            passwordHash,
            emailVerifiedAt: daysAgo(60),
            // The demo's people are physicians the platform knows (M16).
            verifiedAt: daysAgo(60),
            locale: person.locale ?? 'he',
          },
        });
        const hospital = person.hospital ? place[person.hospital as keyof typeof place] : undefined;
        await tx.profile.create({
          data: {
            userId: id,
            firstName: person.firstName,
            lastName: person.lastName,
            nameHe: person.nameHe,
            nameEn: person.nameEn,
            title: person.title ?? null,
            position: person.position ?? null,
            hospitalId: hospital?.hospitalId ?? null,
            departmentId: hospital?.id ?? null,
            languages: ['he', 'en'],
            visibility: {
              create: [
                { field: 'NAME', visibility: 'MEMBERS' },
                { field: 'INSTITUTION', visibility: 'MEMBERS' },
              ],
            },
          },
        });
      }
      const id = (key: keyof typeof people) => ids.get(key)!;
      const admin = id('admin');

      // The demo's administrator runs the organisation's office and the platform (M16).
      await tx.userRole.create({
        data: {
          id: uuidv7(),
          userId: admin,
          roleId: await roleId('ORG_ADMIN'),
          organisationId: FIRST_ORGANISATION.id,
          grantedBy: null,
        },
      });
      await tx.userRole.create({
        data: {
          id: uuidv7(),
          userId: admin,
          roleId: await roleId('PLATFORM_ADMIN'),
          grantedBy: null,
        },
      });
      const director = await roleId('DEPARTMENT_DIRECTOR');
      for (const [key, dept] of [
        ['directorRambam', place.rambam],
        ['directorSheba', place.sheba],
      ] as const) {
        await tx.userRole.create({
          data: {
            id: uuidv7(),
            userId: id(key),
            roleId: director,
            scopeType: 'DEPARTMENT',
            scopeId: dept.id,
            grantedBy: admin,
          },
        });
      }

      // Memberships in every state.
      const member = async (
        key: keyof typeof people,
        typeKey: string,
        options: {
          status?: 'ACTIVE' | 'SUSPENDED';
          start?: Date;
          end?: Date;
          payment?: 'NOT_REQUIRED' | 'UNPAID' | 'PAID' | 'WAIVED';
          number?: 'SPECIALIST_CERTIFICATE' | 'MEDICAL_LICENCE';
          history?: { event: 'SUSPENDED' | 'EXPIRED'; reason: string }[];
        } = {},
      ) => {
        const membershipId = uuidv7();
        await tx.membership.create({
          data: {
            id: membershipId,
            userId: id(key),
            organisationId: FIRST_ORGANISATION.id,
            typeId: types.get(typeKey)!.id,
            status: options.status ?? 'ACTIVE',
            startDate: options.start ?? new Date(Date.UTC(today.getUTCFullYear(), 0, 1)),
            endDate: options.end ?? endOfYear(today),
            paymentStatus: options.payment ?? 'NOT_REQUIRED',
            ...(options.number ? identifier(options.number) : {}),
          },
        });
        await tx.membershipHistory.create({
          data: {
            id: uuidv7(),
            membershipId,
            event: 'CREATED',
            toStatus: 'ACTIVE',
            details: { type: typeKey },
            changedBy: admin,
            at: daysAgo(90),
          },
        });
        for (const entry of options.history ?? []) {
          await tx.membershipHistory.create({
            data: {
              id: uuidv7(),
              membershipId,
              event: entry.event,
              fromStatus: 'ACTIVE',
              toStatus: entry.event === 'SUSPENDED' ? 'SUSPENDED' : 'EXPIRED',
              changedBy: admin,
              reason: entry.reason,
              at: daysAgo(10),
            },
          });
        }
      };
      await member('directorRambam', 'FULL_MEMBER', {
        number: 'SPECIALIST_CERTIFICATE',
        payment: 'PAID',
      });
      await member('directorSheba', 'FULL_MEMBER', {
        number: 'SPECIALIST_CERTIFICATE',
        payment: 'PAID',
      });
      await member('full', 'FULL_MEMBER', { number: 'SPECIALIST_CERTIFICATE', payment: 'PAID' });
      await member('resident', 'RESIDENT', { number: 'MEDICAL_LICENCE', payment: 'UNPAID' });
      await member('honorary', 'HONORARY_MEMBER', { payment: 'WAIVED' });
      await member('suspended', 'FULL_MEMBER', {
        status: 'SUSPENDED',
        number: 'SPECIALIST_CERTIFICATE',
        payment: 'UNPAID',
        history: [{ event: 'SUSPENDED', reason: 'Dues unpaid for two years (demo)' }],
      });
      const lastYear = today.getUTCFullYear() - 1;
      await member('expired', 'RESIDENT', {
        number: 'MEDICAL_LICENCE',
        start: new Date(Date.UTC(lastYear, 0, 1)),
        end: new Date(Date.UTC(lastYear, 11, 31)),
      });

      // Applications at every step.
      const application = async (
        key: keyof typeof people,
        typeKey: string,
        state: 'PENDING_DIRECTOR' | 'PENDING_ADMIN' | 'REJECTED',
        options: {
          place?: { id: string; hospitalId: string };
          number?: 'SPECIALIST_CERTIFICATE' | 'MEDICAL_LICENCE';
          flags?: string[];
          decisions?: {
            stage: 'DIRECTOR' | 'ADMIN';
            decision: 'APPROVE' | 'REJECT';
            by: string;
            reason?: string;
          }[];
        },
      ) => {
        const requestId = uuidv7();
        await tx.verificationRequest.create({
          data: {
            id: requestId,
            userId: id(key),
            organisationId: FIRST_ORGANISATION.id,
            typeId: types.get(typeKey)!.id,
            hospitalId: options.place?.hospitalId ?? null,
            departmentId: options.place?.id ?? null,
            state,
            flags: options.flags ?? [],
            ...(options.number ? identifier(options.number) : {}),
            createdAt: daysAgo(5),
            closedAt: state === 'REJECTED' ? daysAgo(2) : null,
          },
        });
        for (const decision of options.decisions ?? []) {
          await tx.verificationDecision.create({
            data: {
              id: uuidv7(),
              requestId,
              stage: decision.stage,
              decision: decision.decision,
              decidedBy: decision.by,
              reason: decision.reason ?? null,
              at: daysAgo(3),
            },
          });
        }
      };
      await application('pendingDirector', 'RESIDENT', 'PENDING_DIRECTOR', {
        place: place.rambam,
        number: 'MEDICAL_LICENCE',
      });
      await application('pendingAdmin', 'FULL_MEMBER', 'PENDING_ADMIN', {
        place: place.sheba,
        number: 'SPECIALIST_CERTIFICATE',
        decisions: [{ stage: 'DIRECTOR', decision: 'APPROVE', by: id('directorSheba') }],
      });
      await application('student', 'STUDENT', 'PENDING_ADMIN', {});
      await application('rejected', 'NON_FULL_MEMBER', 'REJECTED', {
        place: place.rambam,
        number: 'MEDICAL_LICENCE',
        decisions: [
          {
            stage: 'DIRECTOR',
            decision: 'REJECT',
            by: id('directorRambam'),
            reason: 'Not a member of this department (demo)',
          },
        ],
      });
      await application('noDirector', 'FULL_MEMBER', 'PENDING_ADMIN', {
        place: place.soroka,
        number: 'SPECIALIST_CERTIFICATE',
        flags: ['NO_DIRECTOR'],
      });
    },
    { timeout: 60_000 },
  );
  console.log(
    `seed: demo layer — ${Object.keys(people).length} fictional people at @${DOMAIN}, ` +
      `password documented in README ("Demo accounts")`,
  );
}
