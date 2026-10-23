import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { markOf } from '../../common/verified-as';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { JobQueue } from '../../infra/jobs/job-queue';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { DirectConversations } from '../chat';
import { refusePatientDetails } from '../community';
import { Notifier } from '../notifications';
import {
  type JoinInputDto,
  type ProjectDto,
  type ProjectInputDto,
  type ProjectListDto,
  type ProjectListQueryDto,
  type ResearchRequestDto,
  type ResearchRequestListDto,
} from './research.dto';
import {
  MAX_OPEN_PROJECTS,
  PROJECTS_PAGE_SIZE,
  type RequestAction,
  STALE_AFTER_MS,
  askProblem,
  expiredBefore,
  isStale,
  planStep,
} from './research-rules';

export const RESEARCH_DAILY_JOB = 'research.daily';
const EXCERPT = 240;
const NAME_REF = { id: true, nameHe: true, nameEn: true } as const;

const PERSON = {
  userId: true,
  firstName: true,
  lastName: true,
  hospital: { select: NAME_REF },
  user: { select: { verifiedAs: true } },
} satisfies Prisma.ProfileSelect;
type PersonRow = Prisma.ProfileGetPayload<{ select: typeof PERSON }>;

const PROJECT_INCLUDE = {
  subspecialties: {
    include: { subspecialty: { select: { id: true, key: true, nameHe: true, nameEn: true } } },
  },
  lead: { select: { profile: { select: PERSON } } },
} satisfies Prisma.ResearchProjectInclude;
type ProjectRow = Prisma.ResearchProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

type Template =
  | 'researchRequested'
  | 'researchAccepted'
  | 'researchDeclined'
  | 'researchExpired'
  | 'researchStale';

/**
 * Research projects (M27 plan §2 and §3; owner answers §10.1, §10.2 and §10.4): a verified
 * physician lists a study that seeks collaborators; verified people find it and ask to join; the
 * lead accepts, which adds the person to the project's chat group, or declines without a reason.
 * A project holds no data about participants, and its text goes through the patient-details
 * check. Requests are seen by their two people only.
 */
@Injectable()
export class ResearchService implements OnModuleInit {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
    private readonly chat: DirectConversations,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: RESEARCH_DAILY_JOB,
      cron: '40 4 * * *',
      run: async () => {
        const expired = await this.expireDue();
        const asked = await this.askStale();
        if (expired || asked) this.logger.log({ expired, asked }, 'Research housekeeping');
      },
    });
  }

  // --- Who ----------------------------------------------------------------------------------------

  private ensureVerified(principal: Principal): void {
    if (!principal.verified) throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
  }

  /** Listing a project needs a verified physician: not a medical student (owner answer §10.1). */
  private async ensurePhysician(principal: Principal): Promise<void> {
    this.ensureVerified(principal);
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: { verifiedAs: true },
    });
    if (user?.verifiedAs === 'STUDENT') {
      throw new AppException('FORBIDDEN', [{ code: 'researchPhysiciansOnly' }]);
    }
  }

  private async ensureNamed(userId: string): Promise<void> {
    const named = await this.prisma.profile.count({
      where: {
        userId,
        firstName: { not: null },
        lastName: { not: null },
        NOT: [{ firstName: '' }, { lastName: '' }],
      },
    });
    if (!named) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'mentorNameRequired' }]);
  }

  // --- Projects -----------------------------------------------------------------------------------

  async list(principal: Principal, query: ProjectListQueryDto): Promise<ProjectListDto> {
    this.ensureVerified(principal);
    const contains = query.q ? { contains: query.q, mode: 'insensitive' as const } : null;
    const where: Prisma.ResearchProjectWhereInput = {
      AND: [
        query.mine ? { leadId: principal.userId } : { endedAt: null },
        { lead: { status: 'ACTIVE' } },
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.studyType ? [{ studyType: query.studyType }] : []),
        ...(query.need ? [{ needs: { has: query.need } }] : []),
        ...(query.subspecialty
          ? [{ subspecialties: { some: { subspecialty: { key: query.subspecialty } } } }]
          : []),
        ...(contains ? [{ OR: [{ title: contains }, { description: contains }] }] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.researchProject.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * PROJECTS_PAGE_SIZE,
        take: PROJECTS_PAGE_SIZE,
      }),
      this.prisma.researchProject.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({ ...summary(row), excerpt: excerpt(row.description) })),
      page: query.page,
      pageSize: PROJECTS_PAGE_SIZE,
      total,
    };
  }

  async get(principal: Principal, id: string): Promise<ProjectDto> {
    this.ensureVerified(principal);
    const row = await this.prisma.researchProject.findFirst({
      where: { id, lead: { status: 'ACTIVE' } },
      include: PROJECT_INCLUDE,
    });
    if (!row) throw new AppException('NOT_FOUND');
    const me = principal.userId;
    const [mine, members] = await Promise.all([
      this.prisma.researchRequest.findFirst({
        where: { projectId: id, userId: me, state: { in: ['PENDING', 'ACCEPTED'] } },
        select: { id: true, state: true },
      }),
      this.prisma.researchRequest.count({ where: { projectId: id, state: 'ACCEPTED' } }),
    ]);
    const isLead = row.leadId === me;
    const inGroup = isLead || mine?.state === 'ACCEPTED';
    return {
      ...summary(row),
      description: row.description,
      funding: row.funding,
      contact: row.contact,
      mine: isLead,
      myRequest: mine,
      groupId: inGroup ? row.groupId : null,
      members,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(
    principal: Principal,
    input: ProjectInputDto,
    meta: RequestMeta,
  ): Promise<ProjectDto> {
    await this.ensurePhysician(principal);
    await this.ensureNamed(principal.userId);
    refusePatientDetails({ title: input.title, description: input.description });
    const open = await this.prisma.researchProject.count({
      where: { leadId: principal.userId, endedAt: null },
    });
    if (open >= MAX_OPEN_PROJECTS) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'researchTooManyProjects' }]);
    }
    await this.checkSubspecialties(input.subspecialtyIds);
    const id = uuidv7();
    const groupId = await this.chat.openGroup(input.title, principal.userId);
    await this.prisma.researchProject.create({
      data: {
        id,
        leadId: principal.userId,
        groupId,
        ...fields(input),
        subspecialties: {
          create: [...new Set(input.subspecialtyIds)].map((subspecialtyId) => ({ subspecialtyId })),
        },
      },
    });
    await this.record('research.project.create', id, principal, meta);
    return this.get(principal, id);
  }

  /** The lead changes it; saving also says it is still current. */
  async update(
    principal: Principal,
    id: string,
    input: ProjectInputDto,
    meta: RequestMeta,
  ): Promise<ProjectDto> {
    await this.ownProject(principal, id);
    refusePatientDetails({ title: input.title, description: input.description });
    await this.checkSubspecialties(input.subspecialtyIds);
    await this.prisma.$transaction(async (tx) => {
      await tx.researchProject.update({
        where: { id },
        data: { ...fields(input), confirmedAt: new Date(), staleAskedAt: null },
      });
      await tx.researchProjectSubspecialty.deleteMany({ where: { projectId: id } });
      await tx.researchProjectSubspecialty.createMany({
        data: [...new Set(input.subspecialtyIds)].map((subspecialtyId) => ({
          projectId: id,
          subspecialtyId,
        })),
      });
    });
    await this.record('research.project.update', id, principal, meta);
    return this.get(principal, id);
  }

  /** The lead ends it: it stays readable and takes no requests; waiting ones are closed. */
  async end(principal: Principal, id: string, meta: RequestMeta): Promise<ProjectDto> {
    await this.ownProject(principal, id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.researchProject.update({
        where: { id },
        data: { endedAt: now, open: false, status: 'COMPLETED' },
      }),
      this.prisma.researchRequest.updateMany({
        where: { projectId: id, state: 'PENDING' },
        data: { state: 'EXPIRED', closedAt: now },
      }),
    ]);
    await this.record('research.project.end', id, principal, meta);
    return this.get(principal, id);
  }

  private async ownProject(principal: Principal, id: string) {
    this.ensureVerified(principal);
    const row = await this.prisma.researchProject.findFirst({
      where: { id, leadId: principal.userId },
      select: { id: true, endedAt: true },
    });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  // --- Requests -----------------------------------------------------------------------------------

  async ask(
    principal: Principal,
    projectId: string,
    input: JoinInputDto,
  ): Promise<ResearchRequestDto> {
    this.ensureVerified(principal);
    const me = principal.userId;
    await this.ensureNamed(me);
    await this.expireDue();
    const project = await this.prisma.researchProject.findFirst({
      where: { id: projectId, lead: { status: 'ACTIVE' } },
      select: { id: true, leadId: true, open: true, endedAt: true, title: true },
    });
    if (!project) throw new AppException('NOT_FOUND');
    // A lead who blocked the asker, or whom the asker blocked, is not there for them (M11).
    const blocked = await this.prisma.chatBlock.count({
      where: {
        OR: [
          { blockerId: me, blockedId: project.leadId },
          { blockerId: project.leadId, blockedId: me },
        ],
      },
    });
    if (blocked) throw new AppException('NOT_FOUND');
    const [open, lastDecline, waiting] = await Promise.all([
      this.prisma.researchRequest.findFirst({
        where: { projectId, userId: me, state: { in: ['PENDING', 'ACCEPTED'] } },
        select: { id: true },
      }),
      this.prisma.researchRequest.findFirst({
        where: { projectId, userId: me, state: 'DECLINED' },
        orderBy: { answeredAt: 'desc' },
        select: { answeredAt: true },
      }),
      this.prisma.researchRequest.count({ where: { userId: me, state: 'PENDING' } }),
    ]);
    const problem = askProblem({
      taking: project.open && project.endedAt === null,
      ownProject: project.leadId === me,
      openWithProject: open !== null,
      lastDeclinedAt: lastDecline?.answeredAt ?? null,
      waiting,
      now: new Date(),
    });
    if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    refusePatientDetails({ message: input.message });
    const id = uuidv7();
    try {
      await this.prisma.researchRequest.create({
        data: { id, projectId, userId: me, message: input.message },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'researchAlreadyOpen' }]);
    }
    await this.tell(project.leadId, me, project.title, 'researchRequested', '/research/requests');
    return this.one(me, id);
  }

  async requests(principal: Principal): Promise<ResearchRequestListDto> {
    this.ensureVerified(principal);
    const me = principal.userId;
    await this.expireDue();
    const rows = await this.prisma.researchRequest.findMany({
      where: { OR: [{ userId: me }, { project: { leadId: me } }] },
      include: { project: { select: { id: true, title: true, leadId: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    const people = await this.people(
      rows.map((row) => (row.project.leadId === me ? row.userId : row.project.leadId)),
    );
    return {
      items: rows.flatMap((row) => {
        const role = row.project.leadId === me ? ('lead' as const) : ('asker' as const);
        const other = people.get(role === 'lead' ? row.userId : row.project.leadId);
        return other ? [view(row, role, other)] : [];
      }),
    };
  }

  async step(principal: Principal, id: string, action: RequestAction): Promise<ResearchRequestDto> {
    this.ensureVerified(principal);
    const me = principal.userId;
    const row = await this.prisma.researchRequest.findFirst({
      where: { id, OR: [{ userId: me }, { project: { leadId: me } }] },
      include: { project: { select: { id: true, title: true, leadId: true, groupId: true } } },
    });
    if (!row) throw new AppException('NOT_FOUND');
    const side = row.project.leadId === me ? 'lead' : 'asker';
    const plan = planStep(action, row.state, side);
    if (!plan.ok) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: plan.code }]);
    const now = new Date();
    const { count } = await this.prisma.researchRequest.updateMany({
      where: { id, state: 'PENDING' },
      data: {
        state: plan.to,
        ...(action === 'withdraw' ? { closedAt: now } : { answeredAt: now }),
        ...(action === 'decline' ? { closedAt: now } : {}),
      },
    });
    if (count === 0) throw new AppException('CONFLICT', [{ code: 'researchNotWaiting' }]);
    if (action === 'accept') {
      // Into the project's group (owner answer §10.4); a full group leaves it to the lead.
      if (row.project.groupId) await this.chat.joinGroup(row.project.groupId, row.userId);
      await this.tell(
        row.userId,
        me,
        row.project.title,
        'researchAccepted',
        `/research/${row.project.id}`,
      );
    }
    if (action === 'decline') {
      await this.tell(row.userId, me, row.project.title, 'researchDeclined', '/research');
    }
    return this.one(me, id);
  }

  /** Closes requests unanswered for 30 days, telling each asker. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.researchRequest.findMany({
      where: { state: 'PENDING', createdAt: { lt: expiredBefore(now) } },
      include: { project: { select: { title: true, leadId: true } } },
      take: 500,
    });
    let closed = 0;
    for (const row of due) {
      const { count } = await this.prisma.researchRequest.updateMany({
        where: { id: row.id, state: 'PENDING' },
        data: { state: 'EXPIRED', closedAt: now },
      });
      if (count === 0) continue;
      closed += 1;
      await this.tell(
        row.userId,
        row.project.leadId,
        row.project.title,
        'researchExpired',
        '/research',
      );
    }
    return closed;
  }

  /** Asks the lead of each project not confirmed for a year, once, whether it is still current. */
  async askStale(now = new Date()): Promise<number> {
    const due = await this.prisma.researchProject.findMany({
      where: {
        endedAt: null,
        staleAskedAt: null,
        confirmedAt: { lte: new Date(now.getTime() - STALE_AFTER_MS) },
      },
      select: { id: true, leadId: true, title: true },
      take: 500,
    });
    for (const row of due) {
      await this.prisma.researchProject.update({
        where: { id: row.id },
        data: { staleAskedAt: now },
      });
      await this.tell(row.leadId, row.leadId, row.title, 'researchStale', `/research/${row.id}`);
    }
    return due.length;
  }

  // --- internals ----------------------------------------------------------------------------------

  private async checkSubspecialties(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const found = await this.prisma.subspecialty.count({
      where: { id: { in: unique }, active: true },
    });
    if (found !== unique.length) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'subspecialtyIds', code: 'unknownSubspecialty' },
      ]);
    }
  }

  private async one(me: string, id: string): Promise<ResearchRequestDto> {
    const row = await this.prisma.researchRequest.findUniqueOrThrow({
      where: { id },
      include: { project: { select: { id: true, title: true, leadId: true } } },
    });
    const role = row.project.leadId === me ? ('lead' as const) : ('asker' as const);
    const otherId = role === 'lead' ? row.userId : row.project.leadId;
    const other = (await this.people([otherId])).get(otherId);
    if (!other) throw new AppException('NOT_FOUND');
    return view(row, role, other);
  }

  private async people(ids: readonly string[]): Promise<Map<string, PersonRow>> {
    const rows = await this.prisma.profile.findMany({
      where: { userId: { in: [...new Set(ids)] } },
      select: PERSON,
    });
    return new Map(rows.map((row) => [row.userId, row]));
  }

  private async tell(
    userId: string,
    aboutId: string,
    title: string,
    template: Template,
    path: string,
  ): Promise<void> {
    try {
      const [user, about] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, locale: true },
        }),
        this.prisma.profile.findUnique({
          where: { userId: aboutId },
          select: { firstName: true, lastName: true },
        }),
      ]);
      if (!user) return;
      const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
      const name = [about?.firstName, about?.lastName].filter(Boolean).join(' ');
      await this.notifier.send({
        userId,
        kind: 'RESEARCH',
        to: user.email,
        locale,
        template,
        params: {
          name,
          title,
          link: new URL(`/${locale}${path}`, this.env.APP_BASE_URL).toString(),
        },
      });
    } catch (error) {
      this.logger.warn({ err: error, template }, 'Research notice failed');
    }
  }

  private record(action: string, id: string, principal: Principal, meta: RequestMeta) {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'research_project',
      entityId: id,
    });
  }
}

function fields(input: ProjectInputDto) {
  return {
    title: input.title,
    description: input.description,
    studyType: input.studyType,
    status: input.status,
    ethics: input.ethics,
    funding: input.funding,
    contact: input.contact,
    needs: [...new Set(input.needs)],
    open: input.open,
  };
}

function personView(row: PersonRow | null | undefined, fallbackId: string) {
  return {
    id: row?.userId ?? fallbackId,
    firstName: row?.firstName ?? '',
    lastName: row?.lastName ?? '',
    mark: markOf(row?.user.verifiedAs),
    hospital: row?.hospital ?? null,
  };
}

function summary(row: ProjectRow) {
  return {
    id: row.id,
    title: row.title,
    studyType: row.studyType,
    status: row.status,
    ethics: row.ethics,
    needs: row.needs,
    subspecialties: row.subspecialties
      .map((s) => s.subspecialty)
      .sort((a, b) => a.key.localeCompare(b.key)),
    lead: personView(row.lead.profile, row.leadId),
    open: row.open && row.endedAt === null,
    ended: row.endedAt !== null,
    stale: row.endedAt === null && isStale(row.confirmedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const chars = [...line];
  return chars.length <= EXCERPT ? line : `${chars.slice(0, EXCERPT).join('').trimEnd()}…`;
}

function view(
  row: {
    id: string;
    userId: string;
    state: ResearchRequestDto['state'];
    message: string;
    createdAt: Date;
    answeredAt: Date | null;
    project: { id: string; title: string };
  },
  role: 'lead' | 'asker',
  other: PersonRow,
): ResearchRequestDto {
  return {
    id: row.id,
    role,
    project: { id: row.project.id, title: row.project.title },
    other: personView(other, other.userId),
    state: row.state,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString() ?? null,
  };
}
