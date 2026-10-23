import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';
import { demoPassword } from '../../src/config/demo-password';
import { PasswordHasher } from '../../src/infra/crypto/password-hasher';
import { todayInIsrael } from '../../src/modules/membership/period';
import { FIRST_ORGANISATION } from './reference-data';

/**
 * Jobs, fellowships and mentorship for the demo (M28 plan §10, answer 5): about 12 fictional
 * positions at hospitals from the list, each saying in its text that it is a sample and not a real
 * offer; 3 abroad, at made-up institutions; one waiting for review and one by a department
 * director. Six mentors among the demo's specialists (three of them new, fictional people), one
 * request waiting and one accepted mentorship with its conversation.
 * Development and the hosted demo only. Runs once: skipped when the first new mentor exists, and
 * when the demo layer is missing. Its own layer, so a hosted demo seeded before M28 gets it.
 */
const MARKER_EMAIL = 'mentor.hila@demo.test';
const DAY = 24 * 60 * 60 * 1000;

const SAMPLE = {
  he: '**משרה לדוגמה, לא הצעה אמיתית.** כל הפרטים בדויים, לצורך הדגמה בלבד.',
  en: '**Sample position, not a real offer.** Every detail is made up, for the demo only.',
};

const NEW_MENTORS = [
  {
    email: MARKER_EMAIL,
    firstName: 'Hila',
    lastName: 'Shapira',
    nameHe: 'ד״ר הילה שפירא',
    hospital: 'shaare-zedek',
    subspecialties: ['PEDIATRIC', 'RECONSTRUCTIVE'],
    academic: 'Outcomes of hypospadias repair; teaching surgical skills.',
    career: 'Choosing a fellowship, working part-time with young children.',
    availability: 'A video call every few weeks',
    languages: ['he', 'en'],
  },
  {
    email: 'mentor.yonatan@demo.test',
    firstName: 'Yonatan',
    lastName: 'Avrahami',
    nameHe: 'ד״ר יונתן אברהמי',
    hospital: 'soroka',
    subspecialties: ['ENDOUROLOGY', 'UROLITHIASIS'],
    academic: 'Stone disease in hot climates; clinical trials in a periphery hospital.',
    career: 'Building a career outside the centre of the country.',
    availability: 'One call a month',
    languages: ['he', 'en', 'ru'],
  },
  {
    email: 'mentor.rana@demo.test',
    firstName: 'Rana',
    lastName: 'Khoury',
    nameHe: 'ד״ר ראנה ח׳ורי',
    hospital: 'rabin',
    subspecialties: ['URO_ONCOLOGY', 'ROBOTIC'],
    academic: 'Robotic surgery outcomes; writing a first research paper.',
    career: 'Fellowships abroad and coming back.',
    availability: 'Two calls a month',
    languages: ['he', 'ar', 'en'],
  },
] as const;

/** Existing demo specialists who also mentor. */
const EXISTING_MENTORS = [
  {
    email: 'director.rambam@demo.test',
    subspecialties: ['URO_ONCOLOGY'],
    academic: 'Bladder cancer; running a department.',
    career: 'Leadership and the step to head of department.',
    availability: 'One meeting a month, in Haifa or by video',
    languages: ['he', 'en'],
    capacity: 3,
  },
  {
    email: 'director.sheba@demo.test',
    subspecialties: ['FUNCTIONAL', 'FEMALE'],
    academic: 'Pelvic floor research; urodynamics.',
    career: 'Women in surgery; research years during residency.',
    availability: 'One call a month',
    languages: ['en', 'he', 'fr'],
    capacity: 2,
  },
  {
    email: 'member.full@demo.test',
    subspecialties: ['ANDROLOGY'],
    academic: 'Male infertility.',
    career: 'Moving between a hospital and community clinics.',
    availability: 'A short call every two weeks',
    languages: ['he', 'en'],
    capacity: 2,
  },
] as const;

interface DemoPosition {
  kind: 'JOB' | 'FELLOWSHIP' | 'RESEARCH';
  hospital?: string;
  institution?: { name: string; city: string; country: string };
  organisation?: boolean;
  audience: 'ANYONE' | 'SPECIALISTS' | 'RESIDENTS' | 'STUDENTS';
  subspecialties: string[];
  closesInDays: number;
  he: { title: string; body: string };
  en: { title: string; body: string };
  /** Left in review, for the admin to try the review. */
  inReview?: boolean;
  /** Written by the Rambam department's director. */
  byDirector?: boolean;
}

const POSITIONS: DemoPosition[] = [
  {
    kind: 'JOB',
    hospital: 'rambam',
    byDirector: true,
    audience: 'SPECIALISTS',
    subspecialties: ['URO_ONCOLOGY'],
    closesInDays: 45,
    he: {
      title: 'רופא/ה בכיר/ה, אורו־אונקולוגיה',
      body: 'משרה מלאה במחלקה, עם תורנויות ומרפאת המשך.',
    },
    en: {
      title: 'Senior urologist, uro-oncology',
      body: 'A full-time post in the department, with on-call duty and a follow-up clinic.',
    },
  },
  {
    kind: 'JOB',
    hospital: 'sheba',
    audience: 'RESIDENTS',
    subspecialties: [],
    closesInDays: 30,
    he: { title: 'תקן התמחות באורולוגיה', body: 'תקן התמחות פנוי, החל מהשנה הבאה.' },
    en: { title: 'Urology residency post', body: 'An open residency post, starting next year.' },
  },
  {
    kind: 'FELLOWSHIP',
    hospital: 'sourasky',
    audience: 'SPECIALISTS',
    subspecialties: ['ROBOTIC'],
    closesInDays: 60,
    he: { title: 'השתלמות בניתוחים רובוטיים', body: 'שנה אחת, עם קונסולה כפולה.' },
    en: { title: 'Robotic surgery fellowship', body: 'One year, with a dual console.' },
  },
  {
    kind: 'RESEARCH',
    hospital: 'hadassah-ein-kerem',
    audience: 'STUDENTS',
    subspecialties: ['UROLITHIASIS'],
    closesInDays: 20,
    he: {
      title: 'סטודנט/ית למחקר באבנים בדרכי השתן',
      body: 'פרויקט קיץ, בשיתוף עם בית הספר לרפואה.',
    },
    en: {
      title: 'Student research post in stone disease',
      body: 'A summer project, together with the medical school.',
    },
  },
  {
    kind: 'JOB',
    hospital: 'soroka',
    audience: 'SPECIALISTS',
    subspecialties: ['ENDOUROLOGY'],
    closesInDays: 35,
    he: { title: 'רופא/ה מומחה/ית, אנדואורולוגיה', body: 'משרה מלאה, עם אפשרות למחקר.' },
    en: {
      title: 'Specialist urologist, endourology',
      body: 'A full-time post, with time for research.',
    },
  },
  {
    kind: 'FELLOWSHIP',
    hospital: 'shaare-zedek',
    audience: 'SPECIALISTS',
    subspecialties: ['PEDIATRIC'],
    closesInDays: 75,
    he: { title: 'השתלמות באורולוגיה ילדים', body: 'שנתיים, כולל מרפאות ייעודיות.' },
    en: { title: 'Pediatric urology fellowship', body: 'Two years, including dedicated clinics.' },
  },
  {
    kind: 'JOB',
    hospital: 'meir',
    audience: 'ANYONE',
    subspecialties: ['COMMUNITY'],
    closesInDays: 25,
    he: { title: 'אורולוג/ית למרפאה בקהילה', body: 'חצי משרה, ימים גמישים.' },
    en: { title: 'Urologist for a community clinic', body: 'Half time, flexible days.' },
  },
  {
    kind: 'RESEARCH',
    hospital: 'rabin',
    audience: 'RESIDENTS',
    subspecialties: ['URO_ONCOLOGY'],
    closesInDays: 50,
    he: { title: 'שנת מחקר למתמחים בסרטן הערמונית', body: 'מחקר קליני, עם הנחיה צמודה.' },
    en: {
      title: 'Research year in prostate cancer, for residents',
      body: 'Clinical research, with close supervision.',
    },
  },
  {
    kind: 'JOB',
    hospital: 'wolfson',
    inReview: true,
    audience: 'SPECIALISTS',
    subspecialties: ['FUNCTIONAL'],
    closesInDays: 40,
    he: { title: 'רופא/ה מומחה/ית, אורולוגיה תפקודית', body: 'משרה מלאה, כולל מעבדת אורודינמיקה.' },
    en: {
      title: 'Specialist urologist, functional urology',
      body: 'A full-time post, including the urodynamics lab.',
    },
  },
  {
    kind: 'FELLOWSHIP',
    institution: {
      name: 'Northbridge University Hospital (fictional)',
      city: 'London',
      country: 'GB',
    },
    audience: 'SPECIALISTS',
    subspecialties: ['RECONSTRUCTIVE'],
    closesInDays: 90,
    he: { title: 'השתלמות בניתוחים שחזוריים, לונדון', body: 'שנה אחת, בתשלום.' },
    en: { title: 'Reconstructive urology fellowship, London', body: 'One year, paid.' },
  },
  {
    kind: 'FELLOWSHIP',
    institution: { name: 'Lakeview Medical Center (fictional)', city: 'Toronto', country: 'CA' },
    audience: 'SPECIALISTS',
    subspecialties: ['TRANSPLANT'],
    closesInDays: 70,
    he: { title: 'השתלמות בהשתלות כליה, טורונטו', body: 'שנתיים, קלינית ומחקרית.' },
    en: {
      title: 'Kidney transplant fellowship, Toronto',
      body: 'Two years, clinical and research.',
    },
  },
  {
    kind: 'RESEARCH',
    institution: {
      name: 'Rhône Medical Research Institute (fictional)',
      city: 'Lyon',
      country: 'FR',
    },
    organisation: true,
    audience: 'RESIDENTS',
    subspecialties: ['ANDROLOGY'],
    closesInDays: 55,
    he: { title: 'מלגת מחקר באנדרולוגיה, ליון', body: 'מלגה של האגודה לחצי שנה של מחקר.' },
    en: {
      title: 'Andrology research grant, Lyon',
      body: 'The society’s grant for six months of research.',
    },
  },
];

export async function seedDemoCareers(prisma: PrismaClient): Promise<void> {
  if (await prisma.user.findUnique({ where: { email: MARKER_EMAIL } })) {
    console.log('seed: careers layer already present, skipped');
    return;
  }
  const user = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
  const [admin, reviewer, director, resident, student] = await Promise.all([
    user('admin@demo.test'),
    user('admin2@demo.test'),
    user('director.rambam@demo.test'),
    user('member.resident@demo.test'),
    user('applicant.student@demo.test'),
  ]);
  if (!admin || !reviewer || !director || !resident || !student) {
    console.log('seed: careers layer needs the demo layer first, skipped');
    return;
  }
  const passwordHash = await new PasswordHasher().hash(demoPassword());
  const hospitals = new Map(
    (
      await prisma.hospital.findMany({
        select: { id: true, code: true, departments: { select: { id: true, code: true } } },
      })
    ).map((h) => [h.code, h]),
  );
  const subspecialties = new Map(
    (await prisma.subspecialty.findMany({ select: { id: true, key: true } })).map((s) => [
      s.key,
      s.id,
    ]),
  );
  const subspecialtyIds = (keys: readonly string[]) =>
    keys.map((key) => {
      const id = subspecialties.get(key);
      if (!id) throw new Error(`Unknown subspecialty ${key}`);
      return id;
    });
  const now = new Date();
  const today = todayInIsrael(now);
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  await prisma.$transaction(async (tx) => {
    // The new mentors: fictional specialists with no organisation, verified by the platform.
    for (const person of NEW_MENTORS) {
      const id = uuidv7();
      const hospital = hospitals.get(person.hospital)!;
      await tx.user.create({
        data: {
          id,
          email: person.email,
          passwordHash,
          emailVerifiedAt: ago(90),
          locale: 'he',
          verifiedAt: ago(80),
          verifiedAs: 'SPECIALIST',
          verifiedUntil: new Date(now.getTime() + 650 * DAY),
        },
      });
      await tx.profile.create({
        data: {
          userId: id,
          firstName: person.firstName,
          lastName: person.lastName,
          nameHe: person.nameHe,
          nameEn: `Dr. ${person.firstName} ${person.lastName}`,
          title: 'Dr.',
          position: 'Senior Urologist',
          hospitalId: hospital.id,
          departmentId: hospital.departments.find((d) => d.code === 'urology')?.id ?? null,
          languages: [...person.languages],
        },
      });
      await tx.mentorProfile.create({
        data: {
          userId: id,
          academicInterests: person.academic,
          careerInterests: person.career,
          availability: person.availability,
          languages: [...person.languages],
          capacity: 2,
          subspecialties: {
            create: subspecialtyIds(person.subspecialties).map((subspecialtyId) => ({
              subspecialtyId,
            })),
          },
        },
      });
    }
    for (const mentor of EXISTING_MENTORS) {
      const id = await tx.user.findUniqueOrThrow({ where: { email: mentor.email } });
      await tx.mentorProfile.create({
        data: {
          userId: id.id,
          academicInterests: mentor.academic,
          careerInterests: mentor.career,
          availability: mentor.availability,
          languages: [...mentor.languages],
          capacity: mentor.capacity,
          subspecialties: {
            create: subspecialtyIds(mentor.subspecialties).map((subspecialtyId) => ({
              subspecialtyId,
            })),
          },
        },
      });
    }

    // A request waiting for the full member (Noa) from the resident (Yoav).
    const noa = await tx.user.findUniqueOrThrow({ where: { email: 'member.full@demo.test' } });
    await tx.mentorship.create({
      data: {
        id: uuidv7(),
        mentorId: noa.id,
        menteeId: resident,
        message:
          'Hello, I am a third-year resident and thinking about andrology. Could we talk about it?',
        createdAt: ago(2),
      },
    });
    // An accepted mentorship between the Rambam director (Avi) and the student (Maya), with
    // its private conversation.
    const [low, high] = [director, student].sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : 1,
    );
    const existing = await tx.conversation.findFirst({
      where: { kind: 'DIRECT', userLowId: low, userHighId: high },
      select: { id: true },
    });
    const conversationId = existing?.id ?? uuidv7();
    if (!existing) {
      await tx.conversation.create({
        data: {
          id: conversationId,
          kind: 'DIRECT',
          userLowId: low!,
          userHighId: high!,
          members: { create: [{ userId: director }, { userId: student }] },
        },
      });
    }
    await tx.mentorship.create({
      data: {
        id: uuidv7(),
        mentorId: director,
        menteeId: student,
        state: 'ACCEPTED',
        message: 'I am a medical student interested in urology. Would you mentor me this year?',
        createdAt: ago(12),
        answeredAt: ago(10),
        conversationId,
      },
    });

    // The positions.
    const rambamUrology = hospitals.get('rambam')!.departments.find((d) => d.code === 'urology');
    for (const [index, item] of POSITIONS.entries()) {
      const id = uuidv7();
      const hospital = item.hospital ? hospitals.get(item.hospital) : undefined;
      if (item.hospital && !hospital) throw new Error(`Unknown hospital ${item.hospital}`);
      const author = item.byDirector ? director : admin;
      const published = !item.inReview;
      const created = ago(20 - index);
      await tx.position.create({
        data: {
          id,
          kind: item.kind,
          status: published ? 'PUBLISHED' : 'IN_REVIEW',
          organisationId: item.organisation ? FIRST_ORGANISATION.id : null,
          hospitalId: hospital?.id ?? null,
          departmentId: item.byDirector
            ? (rambamUrology?.id ?? null)
            : (hospital?.departments.find((d) => d.code === 'urology')?.id ?? null),
          institutionName: item.institution?.name ?? null,
          city: item.institution?.city ?? null,
          country: item.institution?.country ?? 'IL',
          audience: item.audience,
          applyEmail: `careers.${index + 1}@demo.test`,
          closesOn: new Date(today.getTime() + item.closesInDays * DAY),
          authorUserId: author,
          submittedBy: author,
          reviewedBy: published ? reviewer : null,
          publishedAt: published ? ago(18 - index) : null,
          createdAt: created,
          translations: {
            create: [
              { locale: 'he', title: item.he.title, body: `${SAMPLE.he}\n\n${item.he.body}` },
              { locale: 'en', title: item.en.title, body: `${SAMPLE.en}\n\n${item.en.body}` },
            ],
          },
          subspecialties: {
            create: subspecialtyIds(item.subspecialties).map((subspecialtyId) => ({
              subspecialtyId,
            })),
          },
          history: {
            create: [
              {
                id: uuidv7(),
                action: 'create',
                toStatus: 'DRAFT',
                actorUserId: author,
                at: created,
              },
              {
                id: uuidv7(),
                action: 'submit',
                fromStatus: 'DRAFT',
                toStatus: 'IN_REVIEW',
                actorUserId: author,
                at: created,
              },
              ...(published
                ? [
                    {
                      id: uuidv7(),
                      action: 'publish',
                      fromStatus: 'IN_REVIEW' as const,
                      toStatus: 'PUBLISHED' as const,
                      actorUserId: reviewer,
                      at: ago(18 - index),
                    },
                  ]
                : []),
            ],
          },
        },
      });
    }
    // The resident keeps one position.
    const kept = await tx.position.findFirst({
      where: { status: 'PUBLISHED', audience: 'RESIDENTS' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (kept) await tx.savedPosition.create({ data: { userId: resident, positionId: kept.id } });
  });
  console.log(
    `seed: careers layer — ${POSITIONS.length} positions, ${NEW_MENTORS.length + EXISTING_MENTORS.length} mentors`,
  );
}
