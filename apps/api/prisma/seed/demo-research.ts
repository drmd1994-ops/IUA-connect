import { uuidv7 } from '@medconnect/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';

/**
 * Research for the demo (M27 plan §10, answer 5): six fictional projects listed by the demo's
 * fictional physicians, each with its chat group; one request waiting and one accepted; and a
 * few hand-typed fictional publications, with no real PubMed ID or DOI, so no fictional person
 * is tied to a real paper. Every project says it is a sample.
 * Development and the hosted demo only. Runs once: skipped when its first project exists, and
 * when the demo layer is missing. Its own layer, so a hosted demo seeded before M27 gets it.
 */
const MARKER_TITLE = 'A multicentre registry of stone clinic waiting times (sample)';
const DAY = 24 * 60 * 60 * 1000;
const SAMPLE = 'A fictional sample project for the demo; no study exists.';

interface DemoProject {
  lead: string;
  title: string;
  description: string;
  studyType: 'PROSPECTIVE' | 'RETROSPECTIVE' | 'TRIAL' | 'REGISTRY' | 'SURVEY' | 'OTHER';
  status: 'PLANNING' | 'RECRUITING' | 'ONGOING' | 'COMPLETED';
  ethics: 'APPROVED' | 'SUBMITTED' | 'NOT_YET' | 'NOT_NEEDED';
  needs: ('CENTRES' | 'CO_INVESTIGATORS' | 'STATISTICIAN' | 'RESIDENTS' | 'STUDENTS')[];
  subspecialties: string[];
  funding?: string;
  daysAgo: number;
}

const PROJECTS: DemoProject[] = [
  {
    lead: 'mentor.yonatan@demo.test',
    title: MARKER_TITLE,
    description: `How long do people wait for a first visit at stone clinics across the country? We collect the waiting times only, no patient details. Looking for centres willing to report once a month. ${SAMPLE}`,
    studyType: 'REGISTRY',
    status: 'RECRUITING',
    ethics: 'APPROVED',
    needs: ['CENTRES'],
    subspecialties: ['UROLITHIASIS'],
    daysAgo: 40,
  },
  {
    lead: 'mentor.rana@demo.test',
    title: 'Learning curves on the robotic simulator: a training study (sample)',
    description: `Residents record their simulator scores over six months. We are looking for residents who train on a simulator, and a statistician. ${SAMPLE}`,
    studyType: 'PROSPECTIVE',
    status: 'PLANNING',
    ethics: 'SUBMITTED',
    needs: ['RESIDENTS', 'STATISTICIAN'],
    subspecialties: ['ROBOTIC'],
    daysAgo: 20,
  },
  {
    lead: 'director.rambam@demo.test',
    title: 'Survey of follow-up practices after bladder tumour surgery (sample)',
    description: `A short online survey of urologists about how their departments organise follow-up. Looking for co-investigators to spread it, and students to help with the analysis. ${SAMPLE}`,
    studyType: 'SURVEY',
    status: 'RECRUITING',
    ethics: 'NOT_NEEDED',
    needs: ['CO_INVESTIGATORS', 'STUDENTS'],
    subspecialties: ['URO_ONCOLOGY'],
    funding: 'Department research fund (fictional)',
    daysAgo: 30,
  },
  {
    lead: 'director.sheba@demo.test',
    title: 'Pelvic floor clinic referral pathways, a retrospective review (sample)',
    description: `Reviewing how referrals reach a pelvic floor clinic, from anonymous clinic statistics. Looking for one more centre. ${SAMPLE}`,
    studyType: 'RETROSPECTIVE',
    status: 'ONGOING',
    ethics: 'APPROVED',
    needs: ['CENTRES'],
    subspecialties: ['FUNCTIONAL', 'FEMALE'],
    daysAgo: 60,
  },
  {
    lead: 'mentor.hila@demo.test',
    title: 'Teaching paediatric urology to residents: what works (sample)',
    description: `Comparing two teaching formats for residents' paediatric rotation. Looking for departments that would try one of them. ${SAMPLE}`,
    studyType: 'TRIAL',
    status: 'PLANNING',
    ethics: 'NOT_YET',
    needs: ['CENTRES', 'RESIDENTS'],
    subspecialties: ['PEDIATRIC'],
    daysAgo: 10,
  },
  {
    lead: 'member.full@demo.test',
    title: 'Time to first andrology appointment in the community (sample)',
    description: `Collecting anonymous waiting-time figures from community clinics. Looking for a statistician and a student. ${SAMPLE}`,
    studyType: 'OTHER',
    status: 'RECRUITING',
    ethics: 'NOT_NEEDED',
    needs: ['STATISTICIAN', 'STUDENTS'],
    subspecialties: ['ANDROLOGY', 'COMMUNITY'],
    daysAgo: 15,
  },
];

const PUBLICATIONS: {
  by: string;
  title: string;
  journal: string;
  year: number;
  topics: string[];
}[] = [
  {
    by: 'member.full@demo.test',
    title: 'A fictional review of clinic waiting times (sample)',
    journal: 'Sample Journal of Urology (fictional)',
    year: 2024,
    topics: ['andrology', 'health services'],
  },
  {
    by: 'member.full@demo.test',
    title: 'A made-up case series for the demo (sample)',
    journal: 'Examples in Urology (fictional)',
    year: 2021,
    topics: ['andrology'],
  },
  {
    by: 'director.rambam@demo.test',
    title: 'Organising a tumour board: a fictional experience (sample)',
    journal: 'Sample Journal of Urology (fictional)',
    year: 2023,
    topics: ['uro-oncology', 'teamwork'],
  },
  {
    by: 'mentor.rana@demo.test',
    title: 'Simulator training in a fictional residency programme (sample)',
    journal: 'Journal of Imaginary Surgical Education',
    year: 2025,
    topics: ['robotic surgery', 'education'],
  },
];

export async function seedDemoResearch(prisma: PrismaClient): Promise<void> {
  if (await prisma.researchProject.findFirst({ where: { title: MARKER_TITLE } })) {
    console.log('seed: research layer already present, skipped');
    return;
  }
  const emails = [
    ...new Set([
      ...PROJECTS.map((p) => p.lead),
      ...PUBLICATIONS.map((p) => p.by),
      'member.resident@demo.test',
      'applicant.student@demo.test',
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
    console.log('seed: research layer needs the demo layer first, skipped');
    return;
  }
  const subspecialties = new Map(
    (await prisma.subspecialty.findMany({ select: { id: true, key: true } })).map((s) => [
      s.key,
      s.id,
    ]),
  );
  const now = Date.now();
  const projectIds = new Map<string, { id: string; groupId: string }>();
  await prisma.$transaction(async (tx) => {
    for (const project of PROJECTS) {
      const leadId = users.get(project.lead);
      if (!leadId) continue;
      const id = uuidv7();
      const groupId = uuidv7();
      const at = new Date(now - project.daysAgo * DAY);
      await tx.conversation.create({
        data: {
          id: groupId,
          kind: 'GROUP',
          nameHe: project.title.slice(0, 120),
          createdBy: leadId,
          memberCount: 1,
          createdAt: at,
          members: { create: [{ userId: leadId, role: 'ADMIN' }] },
        },
      });
      await tx.researchProject.create({
        data: {
          id,
          leadId,
          groupId,
          title: project.title,
          description: project.description,
          studyType: project.studyType,
          status: project.status,
          ethics: project.ethics,
          funding: project.funding ?? null,
          needs: project.needs,
          createdAt: at,
          confirmedAt: at,
          subspecialties: {
            create: project.subspecialties.flatMap((key) => {
              const subspecialtyId = subspecialties.get(key);
              return subspecialtyId ? [{ subspecialtyId }] : [];
            }),
          },
        },
      });
      projectIds.set(project.title, { id, groupId });
    }

    // A resident's request waiting for the robotic study; a student accepted into the survey.
    const resident = users.get('member.resident@demo.test');
    const student = users.get('applicant.student@demo.test');
    const robotic = projectIds.get(PROJECTS[1]!.title);
    const survey = projectIds.get(PROJECTS[2]!.title);
    if (resident && robotic) {
      await tx.researchRequest.create({
        data: {
          id: uuidv7(),
          projectId: robotic.id,
          userId: resident,
          message: 'I train on the simulator twice a week and would like to take part.',
          createdAt: new Date(now - 2 * DAY),
        },
      });
    }
    if (student && survey) {
      await tx.researchRequest.create({
        data: {
          id: uuidv7(),
          projectId: survey.id,
          userId: student,
          message: 'I would be glad to help with the analysis.',
          state: 'ACCEPTED',
          createdAt: new Date(now - 9 * DAY),
          answeredAt: new Date(now - 8 * DAY),
        },
      });
      await tx.conversationMember.create({
        data: { conversationId: survey.groupId, userId: student },
      });
      await tx.conversation.update({
        where: { id: survey.groupId },
        data: { memberCount: { increment: 1 } },
      });
    }

    const positions = new Map<string, number>();
    for (const publication of PUBLICATIONS) {
      const userId = users.get(publication.by);
      if (!userId) continue;
      const position = positions.get(userId) ?? 0;
      positions.set(userId, position + 1);
      await tx.publication.create({
        data: {
          id: uuidv7(),
          userId,
          title: publication.title,
          authors: 'Fictional authors',
          journal: publication.journal,
          year: publication.year,
          topics: publication.topics,
          position,
        },
      });
    }
  });
  console.log(
    `seed: research layer — ${PROJECTS.length} projects, ${PUBLICATIONS.length} publications`,
  );
}
