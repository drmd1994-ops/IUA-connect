import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { markOf } from '../../common/verified-as';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { JobQueue } from '../../infra/jobs/job-queue';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DirectConversations } from '../chat';
import { Notifier } from '../notifications';
import {
  type MentorDto,
  type MentorListDto,
  type MentorListQueryDto,
  type MentorSettingsDto,
  type MentorSettingsInputDto,
  type MentorshipDto,
  type MentorshipListDto,
  type MentorshipRequestInputDto,
} from './mentorship.dto';
import { type MentorshipAction, askProblem, expiredBefore, planStep } from './mentorship-rules';

export const MENTORSHIP_EXPIRY_JOB = 'mentorship.expire';

const NAME_REF = { id: true, nameHe: true, nameEn: true } as const;

/** What the other side of a mentorship sees of a person. */
const PERSON = {
  userId: true,
  firstName: true,
  lastName: true,
  hospital: { select: NAME_REF },
  department: { select: NAME_REF },
  user: { select: { verifiedAs: true } },
} satisfies Prisma.ProfileSelect;
type PersonRow = Prisma.ProfileGetPayload<{ select: typeof PERSON }>;

/** A person known as a specialist today, with a usable account. */
function specialistNow(now: Date): Prisma.UserWhereInput {
  return {
    status: 'ACTIVE',
    verifiedAs: 'SPECIALIST',
    verifiedAt: { not: null },
    OR: [{ verifiedUntil: null }, { verifiedUntil: { gt: now } }],
  };
}

/** A first and a last name: the other side sees who this is. */
const NAMED: Prisma.ProfileWhereInput = {
  firstName: { not: null },
  lastName: { not: null },
  NOT: [{ firstName: '' }, { lastName: '' }],
};

/**
 * Mentorship (M28 plan §2 and §3; owner answers §10.3 and §10.6). A verified specialist opts in
 * as a mentor; any verified person sees the open mentors and asks one, who accepts or declines.
 * Accepting opens a private conversation between the two. A request and its answer are seen by
 * the two people only, never by staff; a decline carries no reason. Blocking in chat applies.
 */
@Injectable()
export class MentorshipService implements OnModuleInit {
  private readonly logger = new Logger(MentorshipService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueue,
    private readonly notifier: Notifier,
    private readonly conversations: DirectConversations,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: MENTORSHIP_EXPIRY_JOB,
      cron: '17 * * * *',
      run: async () => {
        const closed = await this.expireDue();
        if (closed) this.logger.log({ closed }, 'Closed unanswered mentorship requests');
      },
    });
  }

  // --- Mentors --------------------------------------------------------------------------------

  async mentors(principal: Principal, query: MentorListQueryDto): Promise<MentorListDto> {
    ensureVerified(principal);
    const me = principal.userId;
    const now = new Date();
    const blocked = await this.blockedWith(me);
    const contains = query.q ? { contains: query.q, mode: 'insensitive' as const } : null;
    const where: Prisma.MentorProfileWhereInput = {
      open: true,
      userId: { notIn: [me, ...blocked] },
      user: { ...specialistNow(now), profile: { is: NAMED } },
      AND: [
        ...(query.subspecialty
          ? [{ subspecialties: { some: { subspecialty: { key: query.subspecialty } } } }]
          : []),
        ...(query.hospital ? [{ user: { profile: { is: { hospitalId: query.hospital } } } }] : []),
        ...(query.language ? [{ languages: { has: query.language } }] : []),
        ...(contains
          ? [
              {
                OR: [
                  { academicInterests: contains },
                  { careerInterests: contains },
                  { user: { profile: { is: { firstName: contains } } } },
                  { user: { profile: { is: { lastName: contains } } } },
                ],
              },
            ]
          : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.mentorProfile.findMany({
        where,
        include: MENTOR_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { userId: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.mentorProfile.count({ where }),
    ]);
    const ids = rows.map((row) => row.userId);
    const [active, mine] = await Promise.all([this.activeCounts(ids), this.mineWith(me, ids)]);
    return {
      items: rows.map((row) => mentorView(row, active.get(row.userId) ?? 0, mine.get(row.userId))),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async settings(principal: Principal): Promise<MentorSettingsDto> {
    const me = principal.userId;
    const [eligible, row, active] = await Promise.all([
      this.isSpecialist(me),
      this.prisma.mentorProfile.findUnique({
        where: { userId: me },
        include: { subspecialties: { select: { subspecialtyId: true } } },
      }),
      this.prisma.mentorship.count({ where: { mentorId: me, state: 'ACCEPTED' } }),
    ]);
    return {
      eligible,
      settings: row
        ? {
            open: row.open,
            subspecialtyIds: row.subspecialties.map((s) => s.subspecialtyId),
            academicInterests: row.academicInterests,
            careerInterests: row.careerInterests,
            availability: row.availability,
            languages: row.languages,
            capacity: row.capacity,
          }
        : null,
      active,
    };
  }

  /** Saves the reader's mentor settings. Opening needs a verified specialist with a name. */
  async saveSettings(
    principal: Principal,
    input: MentorSettingsInputDto,
  ): Promise<MentorSettingsDto> {
    const me = principal.userId;
    if (!(await this.isSpecialist(me))) {
      throw new AppException('FORBIDDEN', [{ code: 'mentorOnlySpecialists' }]);
    }
    if (input.open) await this.ensureNamed(me);
    const subspecialtyIds = [...new Set(input.subspecialtyIds)];
    if (subspecialtyIds.length) {
      const found = await this.prisma.subspecialty.count({
        where: { id: { in: subspecialtyIds }, active: true },
      });
      if (found !== subspecialtyIds.length) {
        throw new AppException('VALIDATION_FAILED', [
          { field: 'subspecialtyIds', code: 'unknownSubspecialty' },
        ]);
      }
    }
    const data = {
      open: input.open,
      academicInterests: input.academicInterests,
      careerInterests: input.careerInterests,
      availability: input.availability,
      languages: [...new Set(input.languages)],
      capacity: input.capacity,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.mentorProfile.upsert({
        where: { userId: me },
        create: { userId: me, ...data },
        update: data,
      });
      await tx.mentorSubspecialty.deleteMany({ where: { userId: me } });
      await tx.mentorSubspecialty.createMany({
        data: subspecialtyIds.map((subspecialtyId) => ({ userId: me, subspecialtyId })),
      });
    });
    return this.settings(principal);
  }

  // --- Requests -------------------------------------------------------------------------------

  /** The reader's requests and mentorships, on both sides, newest first. */
  async list(principal: Principal): Promise<MentorshipListDto> {
    const me = principal.userId;
    await this.expireDue();
    const rows = await this.prisma.mentorship.findMany({
      where: { OR: [{ mentorId: me }, { menteeId: me }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    const people = await this.people(
      rows.map((row) => (row.mentorId === me ? row.menteeId : row.mentorId)),
    );
    return {
      items: rows.flatMap((row) => {
        const role = row.mentorId === me ? ('mentor' as const) : ('mentee' as const);
        const other = people.get(role === 'mentor' ? row.menteeId : row.mentorId);
        return other ? [view(row, role, other)] : [];
      }),
    };
  }

  async ask(principal: Principal, input: MentorshipRequestInputDto): Promise<MentorshipDto> {
    ensureVerified(principal);
    const me = principal.userId;
    const now = new Date();
    if (input.mentorId === me) throw new AppException('NOT_FOUND');
    await this.ensureNamed(me);
    await this.expireDue(now);
    const mentor = await this.prisma.mentorProfile.findFirst({
      where: {
        userId: input.mentorId,
        open: true,
        user: { ...specialistNow(now), profile: { is: NAMED } },
      },
      select: { userId: true, capacity: true },
    });
    // A mentor who is not open, or who blocked or was blocked, is not there for the asker.
    if (!mentor || (await this.blockedWith(me)).includes(mentor.userId)) {
      throw new AppException('NOT_FOUND', [{ code: 'mentorUnavailable' }]);
    }
    const [waiting, open, lastDecline, active] = await Promise.all([
      this.prisma.mentorship.count({ where: { menteeId: me, state: 'PENDING' } }),
      this.prisma.mentorship.findFirst({
        where: { mentorId: mentor.userId, menteeId: me, state: { in: ['PENDING', 'ACCEPTED'] } },
        select: { id: true },
      }),
      this.prisma.mentorship.findFirst({
        where: { mentorId: mentor.userId, menteeId: me, state: 'DECLINED' },
        orderBy: { answeredAt: 'desc' },
        select: { answeredAt: true },
      }),
      this.prisma.mentorship.count({ where: { mentorId: mentor.userId, state: 'ACCEPTED' } }),
    ]);
    const problem = askProblem({
      waiting,
      openWithMentor: open !== null,
      lastDeclinedAt: lastDecline?.answeredAt ?? null,
      mentorActive: active,
      mentorCapacity: mentor.capacity,
      now,
    });
    if (problem) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
    const id = uuidv7();
    try {
      await this.prisma.mentorship.create({
        data: { id, mentorId: mentor.userId, menteeId: me, message: input.message },
      });
    } catch (error) {
      // Sent twice at the same moment: one open request per pair.
      if (!isUniqueViolation(error)) throw error;
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'mentorshipAlreadyOpen' }]);
    }
    await this.tell(mentor.userId, me, 'mentorshipRequested', '/mentorship/requests');
    return this.one(me, id);
  }

  async step(principal: Principal, id: string, action: MentorshipAction): Promise<MentorshipDto> {
    const me = principal.userId;
    const row = await this.prisma.mentorship.findFirst({
      where: { id, OR: [{ mentorId: me }, { menteeId: me }] },
    });
    if (!row) throw new AppException('NOT_FOUND');
    const side = row.mentorId === me ? 'mentor' : 'mentee';
    const plan = planStep(action, row.state, side);
    if (!plan.ok) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: plan.code }]);
    if (action === 'accept') {
      const [mentor, active] = await Promise.all([
        this.prisma.mentorProfile.findUnique({ where: { userId: me }, select: { capacity: true } }),
        this.prisma.mentorship.count({ where: { mentorId: me, state: 'ACCEPTED' } }),
      ]);
      if (active >= (mentor?.capacity ?? 0)) {
        throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'mentorFull' }]);
      }
    }
    const now = new Date();
    const data: Prisma.MentorshipUpdateManyMutationInput = { state: plan.to };
    if (action === 'accept' || action === 'decline') data.answeredAt = now;
    if (action === 'decline' || action === 'withdraw' || action === 'end') data.closedAt = now;
    const { count } = await this.prisma.mentorship.updateMany({
      where: { id, state: row.state },
      data,
    });
    // The other side moved it first.
    if (count === 0) throw new AppException('CONFLICT', [{ code: 'mentorshipNotWaiting' }]);

    if (action === 'accept') {
      const conversationId = await this.conversations.open(row.mentorId, row.menteeId);
      await this.prisma.mentorship.update({ where: { id }, data: { conversationId } });
      await this.tell(row.menteeId, me, 'mentorshipAccepted', `/chat/${conversationId}`);
    }
    if (action === 'decline') {
      await this.tell(row.menteeId, me, 'mentorshipDeclined', '/mentorship');
    }
    if (action === 'end') {
      const other = side === 'mentor' ? row.menteeId : row.mentorId;
      await this.tell(other, me, 'mentorshipEnded', '/mentorship/requests');
    }
    return this.one(me, id);
  }

  /**
   * Closes the requests left unanswered for 30 days and tells each mentee (run each hour, and
   * before requests are read or sent). A request is closed once, whoever gets there first.
   */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.mentorship.findMany({
      where: { state: 'PENDING', createdAt: { lt: expiredBefore(now) } },
      select: { id: true, mentorId: true, menteeId: true },
      take: 500,
    });
    let closed = 0;
    for (const row of due) {
      const { count } = await this.prisma.mentorship.updateMany({
        where: { id: row.id, state: 'PENDING' },
        data: { state: 'EXPIRED', closedAt: now },
      });
      if (count === 0) continue;
      closed += 1;
      await this.tell(row.menteeId, row.mentorId, 'mentorshipExpired', '/mentorship');
    }
    return closed;
  }

  // --- internals ------------------------------------------------------------------------------

  private async one(me: string, id: string): Promise<MentorshipDto> {
    const row = await this.prisma.mentorship.findUniqueOrThrow({ where: { id } });
    const role = row.mentorId === me ? ('mentor' as const) : ('mentee' as const);
    const otherId = role === 'mentor' ? row.menteeId : row.mentorId;
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

  private async isSpecialist(userId: string): Promise<boolean> {
    const found = await this.prisma.user.count({
      where: { id: userId, ...specialistNow(new Date()) },
    });
    return found > 0;
  }

  private async ensureNamed(userId: string): Promise<void> {
    const named = await this.prisma.profile.count({ where: { userId, ...NAMED } });
    if (!named) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'mentorNameRequired' }]);
    }
  }

  /** The people with a block between them and `me`, in either direction (chat, M11). */
  private async blockedWith(me: string): Promise<string[]> {
    const rows = await this.prisma.chatBlock.findMany({
      where: { OR: [{ blockerId: me }, { blockedId: me }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((row) => (row.blockerId === me ? row.blockedId : row.blockerId));
  }

  private async activeCounts(mentorIds: string[]): Promise<Map<string, number>> {
    if (mentorIds.length === 0) return new Map();
    const rows = await this.prisma.mentorship.groupBy({
      by: ['mentorId'],
      where: { mentorId: { in: mentorIds }, state: 'ACCEPTED' },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.mentorId, row._count._all]));
  }

  private async mineWith(
    me: string,
    mentorIds: string[],
  ): Promise<Map<string, { id: string; state: MentorshipDto['state'] }>> {
    if (mentorIds.length === 0) return new Map();
    const rows = await this.prisma.mentorship.findMany({
      where: { menteeId: me, mentorId: { in: mentorIds }, state: { in: ['PENDING', 'ACCEPTED'] } },
      select: { id: true, mentorId: true, state: true },
    });
    return new Map(rows.map((row) => [row.mentorId, { id: row.id, state: row.state }]));
  }

  /**
   * Tells a person about a step, naming the other side, in their language. A failed notice
   * never undoes the step.
   */
  private async tell(
    userId: string,
    aboutId: string,
    template:
      | 'mentorshipRequested'
      | 'mentorshipAccepted'
      | 'mentorshipDeclined'
      | 'mentorshipExpired'
      | 'mentorshipEnded',
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
        kind: 'MENTORSHIP',
        to: user.email,
        locale,
        template,
        params: { name, link: new URL(`/${locale}${path}`, this.env.APP_BASE_URL).toString() },
      });
    } catch (error) {
      this.logger.warn({ err: error, template }, 'Mentorship notice failed');
    }
  }
}

const MENTOR_INCLUDE = {
  subspecialties: {
    include: { subspecialty: { select: { id: true, key: true, nameHe: true, nameEn: true } } },
  },
  user: { select: { profile: { select: PERSON } } },
} satisfies Prisma.MentorProfileInclude;
type MentorRow = Prisma.MentorProfileGetPayload<{ include: typeof MENTOR_INCLUDE }>;

function ensureVerified(principal: Principal): void {
  if (!principal.verified) throw new AppException('FORBIDDEN', [{ code: 'membersOnly' }]);
}

function personView(row: PersonRow) {
  return {
    id: row.userId,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    mark: markOf(row.user.verifiedAs),
    hospital: row.hospital,
    department: row.department,
  };
}

function mentorView(
  row: MentorRow,
  active: number,
  mine: { id: string; state: MentorshipDto['state'] } | undefined,
): MentorDto {
  return {
    person: personView(row.user.profile!),
    subspecialties: row.subspecialties
      .map((s) => s.subspecialty)
      .sort((a, b) => a.key.localeCompare(b.key)),
    academicInterests: row.academicInterests,
    careerInterests: row.careerInterests,
    availability: row.availability,
    languages: row.languages,
    taking: active < row.capacity,
    mine: mine ?? null,
  };
}

function view(
  row: {
    id: string;
    state: MentorshipDto['state'];
    message: string;
    createdAt: Date;
    answeredAt: Date | null;
    closedAt: Date | null;
    conversationId: string | null;
  },
  role: 'mentor' | 'mentee',
  other: PersonRow,
): MentorshipDto {
  return {
    id: row.id,
    role,
    other: personView(other),
    state: row.state,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    // The conversation is the two people's; it shows only while the mentorship is accepted.
    conversationId: row.state === 'ACCEPTED' ? row.conversationId : null,
  };
}
