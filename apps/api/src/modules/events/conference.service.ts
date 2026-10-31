import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { mayActOn } from '../../common/auth/scope';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { SessionsService as AuthSessions } from '../auth';
import { type IssuedTokens } from '../auth/sessions.service';
import { AttendanceService } from './attendance.service';
import {
  feedbackOpen,
  firstQuestionStatus,
  guestEntryOpen,
  isDemoServer,
  questionsOpen,
  shiftedFromNow,
  showsResults,
} from './conference-rules';
import { ConferenceStream } from './conference-stream';
import {
  type FeedbackInputDto,
  type FeedbackSummaryDto,
  type GuestEntryAdminDto,
  type GuestEntryInputDto,
  type LivePollDto,
  type LiveQuestionDto,
  type LiveSessionDto,
  type LiveSettingsDto,
  type PollInputDto,
  type QuestionInputDto,
  type SessionStaffDto,
  type SessionStaffInputDto,
} from './conference.dto';
import { EventsPublicService } from './events-public.service';

/** The fictional conference of the demo (seed: demo-conference.ts). */
export const DEMO_CONFERENCE_SLUG = 'demo-conference';

/** A guest has no password: this is no valid hash, so no password ever matches it. */
const NO_PASSWORD = '!guest';
const GUEST_EMAIL_DOMAIN = 'guest.invalid';

type EventRow = Awaited<ReturnType<EventsPublicService['visible']>>;

export interface ConferenceActor {
  userId: string;
  meta: RequestMeta;
}

/**
 * The live part of a session (M32): polls, audience questions and feedback; and the guest entry.
 * Votes and feedback can't be traced to a person: who took part and what they chose are stored
 * apart, with no link, and neither is written to the audit log (plan §3).
 */
@Injectable()
export class ConferenceService {
  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly events: EventsPublicService,
    private readonly stream: ConferenceStream,
    private readonly audit: AuditService,
    private readonly authSessions: AuthSessions,
    private readonly attendance: AttendanceService,
  ) {}

  // --- reading ---------------------------------------------------------------------------------

  /** The event, if the caller may take part in it: a guest only in the event they came for. */
  async eventFor(principal: Principal, slug: string): Promise<EventRow> {
    const event = await this.events.visible(principal, slug);
    if (principal.guestEventId && principal.guestEventId !== event.id) {
      throw new AppException('NOT_FOUND');
    }
    return event;
  }

  async live(principal: Principal, slug: string, sessionId: string): Promise<LiveSessionDto> {
    const event = await this.eventFor(principal, slug);
    const session = await this.sessionOf(event.id, sessionId);
    const { canChair, canModerate } = await this.rolesIn(principal, event, sessionId);
    const now = new Date();
    const [polls, voted, questions, upvoted, given] = await Promise.all([
      this.prisma.poll.findMany({
        where: { sessionId, ...(canChair ? {} : { status: { not: 'DRAFT' } }) },
        include: { options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.pollVoter.findMany({
        where: { userId: principal.userId, poll: { sessionId } },
        select: { pollId: true },
      }),
      this.prisma.sessionQuestion.findMany({
        where: {
          sessionId,
          // A reader sees what was let through; a moderator sees what waits and what was hidden.
          ...(canModerate ? {} : { status: { in: ['VISIBLE', 'ANSWERED'] } }),
        },
        include: {
          author: { select: { profile: true, conferenceGuest: { select: { number: true } } } },
        },
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
      this.prisma.sessionQuestionVote.findMany({
        where: { userId: principal.userId, question: { sessionId } },
        select: { questionId: true },
      }),
      this.prisma.sessionFeedbackGiven.findUnique({
        where: { sessionId_userId: { sessionId, userId: principal.userId } },
        select: { userId: true },
      }),
    ]);
    const votedIn = new Set(voted.map((row) => row.pollId));
    const upvotedIn = new Set(upvoted.map((row) => row.questionId));
    return {
      sessionId,
      moderateQuestions: session.moderateQuestions,
      allowAnonymousQuestions: session.allowAnonymousQuestions,
      questionsOpen: questionsOpen(session, now),
      feedbackOpen: feedbackOpen(session, now),
      feedbackGiven: given !== null,
      canChair,
      canModerate,
      polls: polls.map((poll) => {
        const results = showsResults({
          status: poll.status,
          voted: votedIn.has(poll.id),
          canChair,
        });
        return {
          id: poll.id,
          question: poll.question,
          status: poll.status,
          options: poll.options.map((option) => ({
            id: option.id,
            text: option.text,
            votes: results ? option.votes : null,
          })),
          total: results ? poll.options.reduce((sum, option) => sum + option.votes, 0) : null,
          voted: votedIn.has(poll.id),
        } satisfies LivePollDto;
      }),
      questions: questions.map(
        (question) =>
          ({
            id: question.id,
            text: question.text,
            status: question.status,
            upvotes: question.upvotes,
            authorName: profileName(question.author?.profile ?? null),
            guestNumber: question.author?.conferenceGuest?.number ?? null,
            upvoted: upvotedIn.has(question.id),
          }) satisfies LiveQuestionDto,
      ),
    };
  }

  // --- taking part -----------------------------------------------------------------------------

  async vote(
    principal: Principal,
    slug: string,
    sessionId: string,
    pollId: string,
    optionId: string,
  ): Promise<void> {
    const event = await this.eventFor(principal, slug);
    await this.sessionOf(event.id, sessionId);
    const poll = await this.prisma.poll.findFirst({
      where: { id: pollId, sessionId },
      select: { status: true, options: { select: { id: true } } },
    });
    if (!poll) throw new AppException('NOT_FOUND');
    if (poll.status !== 'OPEN') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'pollNotOpen' }]);
    }
    if (!poll.options.some((option) => option.id === optionId)) {
      throw new AppException('NOT_FOUND');
    }
    // Who voted and what was chosen go to two places with nothing that links them.
    const added = await this.prisma.$transaction(async (tx) => {
      const voter = await tx.pollVoter.createMany({
        data: { pollId, userId: principal.userId },
        skipDuplicates: true,
      });
      if (voter.count === 0) return false;
      await tx.pollOption.update({
        where: { id: optionId },
        data: { votes: { increment: 1 } },
      });
      return true;
    });
    if (!added) throw new AppException('CONFLICT', [{ code: 'pollAlreadyVoted' }]);
    this.stream.changed(event.id, sessionId, 'polls');
  }

  async ask(
    principal: Principal,
    slug: string,
    sessionId: string,
    input: QuestionInputDto,
  ): Promise<void> {
    const event = await this.eventFor(principal, slug);
    const session = await this.sessionOf(event.id, sessionId);
    if (!questionsOpen(session, new Date())) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'questionsClosed' }]);
    }
    if (input.anonymous && !session.allowAnonymousQuestions) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'anonymous', code: 'anonymousNotAllowed' },
      ]);
    }
    await this.prisma.sessionQuestion.create({
      data: {
        id: uuidv7(),
        sessionId,
        // An anonymous question keeps no author at all, so nobody can look it up.
        authorId: input.anonymous ? null : principal.userId,
        text: input.text,
        status: firstQuestionStatus(session.moderateQuestions),
      },
    });
    this.stream.changed(event.id, sessionId, 'questions');
  }

  async setUpvote(
    principal: Principal,
    slug: string,
    sessionId: string,
    questionId: string,
    on: boolean,
  ): Promise<void> {
    const event = await this.eventFor(principal, slug);
    await this.sessionOf(event.id, sessionId);
    const question = await this.prisma.sessionQuestion.findFirst({
      where: { id: questionId, sessionId, status: { in: ['VISIBLE', 'ANSWERED'] } },
      select: { id: true },
    });
    if (!question) throw new AppException('NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      const key = { questionId, userId: principal.userId };
      if (on) {
        const added = await tx.sessionQuestionVote.createMany({
          data: key,
          skipDuplicates: true,
        });
        if (added.count > 0) {
          await tx.sessionQuestion.update({
            where: { id: questionId },
            data: { upvotes: { increment: 1 } },
          });
        }
      } else {
        const removed = await tx.sessionQuestionVote.deleteMany({ where: key });
        if (removed.count > 0) {
          await tx.sessionQuestion.update({
            where: { id: questionId },
            data: { upvotes: { decrement: 1 } },
          });
        }
      }
    });
    this.stream.changed(event.id, sessionId, 'questions');
  }

  async giveFeedback(
    principal: Principal,
    slug: string,
    sessionId: string,
    input: FeedbackInputDto,
  ): Promise<void> {
    const event = await this.eventFor(principal, slug);
    const session = await this.sessionOf(event.id, sessionId);
    if (!feedbackOpen(session, new Date())) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'feedbackClosed' }]);
    }
    const added = await this.prisma.$transaction(async (tx) => {
      const given = await tx.sessionFeedbackGiven.createMany({
        data: { sessionId, userId: principal.userId },
        skipDuplicates: true,
      });
      if (given.count === 0) return false;
      await tx.sessionFeedback.create({
        data: {
          // A random id: the time-ordered ids used elsewhere carry the time.
          id: randomUUID(),
          sessionId,
          rating: input.rating,
          comment: input.comment || null,
        },
      });
      return true;
    });
    if (!added) throw new AppException('CONFLICT', [{ code: 'feedbackAlreadyGiven' }]);
  }

  // --- the chair and the moderator -------------------------------------------------------------

  async createPoll(
    principal: Principal,
    slug: string,
    sessionId: string,
    input: PollInputDto,
    actor: ConferenceActor,
  ): Promise<void> {
    const event = await this.chairOf(principal, slug, sessionId);
    const id = uuidv7();
    await this.prisma.poll.create({
      data: {
        id,
        sessionId,
        question: input.question,
        options: {
          create: input.options.map((text, sortOrder) => ({ id: uuidv7(), text, sortOrder })),
        },
      },
    });
    await this.record('conference.poll.created', 'poll', id, actor);
    this.stream.changed(event.id, sessionId, 'polls');
  }

  async setPollStatus(
    principal: Principal,
    slug: string,
    sessionId: string,
    pollId: string,
    status: 'OPEN' | 'CLOSED',
    actor: ConferenceActor,
  ): Promise<void> {
    const event = await this.chairOf(principal, slug, sessionId);
    const poll = await this.prisma.poll.findFirst({
      where: { id: pollId, sessionId },
      select: { status: true },
    });
    if (!poll) throw new AppException('NOT_FOUND');
    if (
      (status === 'OPEN' && poll.status !== 'DRAFT') ||
      (status === 'CLOSED' && poll.status !== 'OPEN')
    ) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'pollWrongState' }]);
    }
    const now = new Date();
    await this.prisma.poll.update({
      where: { id: pollId },
      data: status === 'OPEN' ? { status, openedAt: now } : { status, closedAt: now },
    });
    await this.record(
      status === 'OPEN' ? 'conference.poll.opened' : 'conference.poll.closed',
      'poll',
      pollId,
      actor,
    );
    this.stream.changed(event.id, sessionId, 'polls');
  }

  async removeDraftPoll(
    principal: Principal,
    slug: string,
    sessionId: string,
    pollId: string,
    actor: ConferenceActor,
  ): Promise<void> {
    const event = await this.chairOf(principal, slug, sessionId);
    const removed = await this.prisma.poll.deleteMany({
      where: { id: pollId, sessionId, status: 'DRAFT' },
    });
    if (removed.count === 0) throw new AppException('NOT_FOUND');
    await this.record('conference.poll.removed', 'poll', pollId, actor);
    this.stream.changed(event.id, sessionId, 'polls');
  }

  async updateSettings(
    principal: Principal,
    slug: string,
    sessionId: string,
    input: LiveSettingsDto,
    actor: ConferenceActor,
  ): Promise<void> {
    const event = await this.chairOf(principal, slug, sessionId);
    await this.prisma.eventSession.update({
      where: { id: sessionId },
      data: {
        ...(input.moderateQuestions === undefined
          ? {}
          : { moderateQuestions: input.moderateQuestions }),
        ...(input.allowAnonymousQuestions === undefined
          ? {}
          : { allowAnonymousQuestions: input.allowAnonymousQuestions }),
      },
    });
    await this.record('conference.settings.changed', 'event_session', sessionId, actor, {
      ...input,
    });
    this.stream.changed(event.id, sessionId, 'questions');
  }

  async setQuestionStatus(
    principal: Principal,
    slug: string,
    sessionId: string,
    questionId: string,
    status: 'VISIBLE' | 'ANSWERED' | 'HIDDEN',
    actor: ConferenceActor,
  ): Promise<void> {
    const event = await this.eventFor(principal, slug);
    await this.sessionOf(event.id, sessionId);
    const { canModerate } = await this.rolesIn(principal, event, sessionId);
    if (!canModerate) throw new AppException('FORBIDDEN');
    const changed = await this.prisma.sessionQuestion.updateMany({
      where: { id: questionId, sessionId },
      data: { status, answeredAt: status === 'ANSWERED' ? new Date() : null },
    });
    if (changed.count === 0) throw new AppException('NOT_FOUND');
    if (status === 'HIDDEN') {
      await this.record('conference.question.hidden', 'session_question', questionId, actor);
    }
    this.stream.changed(event.id, sessionId, 'questions');
  }

  async feedbackSummary(
    principal: Principal,
    slug: string,
    sessionId: string,
  ): Promise<FeedbackSummaryDto> {
    await this.chairOf(principal, slug, sessionId);
    const rows = await this.prisma.sessionFeedback.findMany({
      where: { sessionId },
      select: { rating: true, comment: true },
      // By the random id, so the order says nothing about who or when.
      orderBy: { id: 'asc' },
    });
    const sum = rows.reduce((total, row) => total + row.rating, 0);
    return {
      count: rows.length,
      average: rows.length === 0 ? null : Math.round((sum / rows.length) * 10) / 10,
      comments: rows.flatMap((row) => (row.comment ? [row.comment] : [])),
    };
  }

  async attendanceCode(principal: Principal, slug: string, sessionId: string, locale: 'he' | 'en') {
    const event = await this.chairOf(principal, slug, sessionId);
    return this.attendance.code(event.id, sessionId, locale);
  }

  // --- who runs a session (events.manage; the route's guard checks the owner) ------------------

  async staff(eventId: string, sessionId: string): Promise<SessionStaffDto> {
    await this.sessionOf(eventId, sessionId);
    const rows = await this.prisma.sessionStaff.findMany({
      where: { sessionId },
      include: { user: { select: { email: true } } },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
    const of = (role: 'CHAIR' | 'MODERATOR') =>
      rows
        .filter((row) => row.role === role)
        .map((row) => ({ userId: row.userId, email: row.user.email }));
    return { chairs: of('CHAIR'), moderators: of('MODERATOR') };
  }

  async setStaff(
    eventId: string,
    sessionId: string,
    input: SessionStaffInputDto,
    actor: ConferenceActor,
  ): Promise<SessionStaffDto> {
    await this.sessionOf(eventId, sessionId);
    const emails = [...new Set([...input.chairs, ...input.moderators].map(lower))];
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails }, status: 'ACTIVE', conferenceGuest: null },
      select: { id: true, email: true },
    });
    const byEmail = new Map(users.map((user) => [lower(user.email), user.id]));
    const missing = emails.find((email) => !byEmail.has(email));
    if (missing) {
      throw new AppException('VALIDATION_FAILED', [{ field: 'email', code: 'personNotFound' }]);
    }
    const rows = (emails: string[], role: 'CHAIR' | 'MODERATOR') =>
      [...new Set(emails.map(lower))].map((email) => ({
        sessionId,
        userId: byEmail.get(email)!,
        role,
      }));
    await this.prisma.$transaction([
      this.prisma.sessionStaff.deleteMany({ where: { sessionId } }),
      this.prisma.sessionStaff.createMany({
        data: [...rows(input.chairs, 'CHAIR'), ...rows(input.moderators, 'MODERATOR')],
      }),
    ]);
    await this.record('conference.staff.changed', 'event_session', sessionId, actor);
    return this.staff(eventId, sessionId);
  }

  // --- the guest entry -------------------------------------------------------------------------

  /** A new guest for this phone. The code on the QR and the time the manager set are the key. */
  async enterAsGuest(
    slug: string,
    code: string,
    meta: RequestMeta,
    from?: { client: 'APP'; clientName: string | null },
  ): Promise<{ tokens: IssuedTokens; number: number }> {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true,
        guestCode: true,
        guestEntryFrom: true,
        guestEntryUntil: true,
      },
    });
    if (
      !event ||
      !guestEntryOpen(event, isDemoServer(this.env), new Date()) ||
      event.guestCode !== code
    ) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'guestEntryClosed' }]);
    }
    const userId = uuidv7();
    const number = await this.prisma.$transaction(async (tx) => {
      const counted = await tx.event.update({
        where: { id: event.id },
        data: { guestCount: { increment: 1 } },
        select: { guestCount: true },
      });
      await tx.user.create({
        data: {
          id: userId,
          email: `guest-${userId}@${GUEST_EMAIL_DOMAIN}`,
          passwordHash: NO_PASSWORD,
          emailVerifiedAt: new Date(),
          conferenceGuest: { create: { eventId: event.id, number: counted.guestCount } },
        },
      });
      return counted.guestCount;
    });
    const tokens = await this.authSessions.create({
      userId,
      deviceId: null,
      mfa: false,
      meta,
      from,
    });
    return { tokens, number };
  }

  async guestEntry(eventId: string, locale: 'he' | 'en'): Promise<GuestEntryAdminDto> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        slug: true,
        status: true,
        guestCode: true,
        guestEntryFrom: true,
        guestEntryUntil: true,
      },
    });
    if (!event) throw new AppException('NOT_FOUND');
    const available = isDemoServer(this.env);
    return {
      available,
      open: guestEntryOpen(event, available, new Date()),
      from: event.guestEntryFrom?.toISOString() ?? null,
      until: event.guestEntryUntil?.toISOString() ?? null,
      link:
        available && event.guestCode
          ? new URL(
              `/${locale}/events/${event.slug}/join?code=${encodeURIComponent(event.guestCode)}`,
              this.env.APP_BASE_URL,
            ).toString()
          : null,
      guests: await this.prisma.eventGuest.count({ where: { eventId } }),
    };
  }

  async setGuestEntry(
    eventId: string,
    input: GuestEntryInputDto | null,
    locale: 'he' | 'en',
    actor: ConferenceActor,
  ): Promise<GuestEntryAdminDto> {
    if (!isDemoServer(this.env)) throw new AppException('NOT_FOUND');
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { guestCode: true },
    });
    if (!event) throw new AppException('NOT_FOUND');
    await this.prisma.event.update({
      where: { id: eventId },
      data: input
        ? {
            guestCode: event.guestCode ?? newGuestCode(),
            guestEntryFrom: new Date(input.from),
            guestEntryUntil: new Date(input.until),
          }
        : { guestEntryFrom: null, guestEntryUntil: null },
    });
    await this.record(
      input ? 'conference.guests.opened' : 'conference.guests.closed',
      'event',
      eventId,
      actor,
    );
    return this.guestEntry(eventId, locale);
  }

  /**
   * Starts the demo conference from now, for a rehearsal or a showing: the sessions move so that
   * one is on, what people left there goes, and the guest entry opens until the end of the day.
   * Only the demo's own fictional conference, and never on real production.
   */
  async startDemonstration(
    eventId: string,
    locale: 'he' | 'en',
    actor: ConferenceActor,
  ): Promise<GuestEntryAdminDto> {
    if (!isDemoServer(this.env)) throw new AppException('NOT_FOUND');
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        slug: true,
        startAt: true,
        endAt: true,
        guestCode: true,
        sessions: { select: { id: true, startAt: true, endAt: true } },
      },
    });
    if (!event) throw new AppException('NOT_FOUND');
    if (event.slug !== DEMO_CONFERENCE_SLUG || event.sessions.length === 0) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'notTheDemoConference' }]);
    }
    const now = new Date();
    const moved = shiftedFromNow(event.sessions, now);
    const start = new Date(Math.min(...moved.map((session) => session.startAt.getTime())));
    const lastEnd = Math.max(...moved.map((session) => session.endAt.getTime()));
    const end = new Date(lastEnd);
    const until = new Date(lastEnd + 60 * 60 * 1000);
    const guests = await this.prisma.eventGuest.findMany({
      where: { eventId },
      select: { userId: true },
    });
    const sessionIds = event.sessions.map((session) => session.id);
    await this.prisma.$transaction(async (tx) => {
      // The database rule keeps sessions inside the event's time: widen it, move, then fit it.
      await tx.event.update({
        where: { id: eventId },
        data: {
          startAt: new Date(Math.min(start.getTime(), event.startAt?.getTime() ?? start.getTime())),
          endAt: new Date(Math.max(end.getTime(), event.endAt?.getTime() ?? end.getTime())),
        },
      });
      for (const session of moved) {
        await tx.eventSession.update({
          where: { id: session.id },
          data: { startAt: session.startAt, endAt: session.endAt },
        });
      }
      await tx.event.update({
        where: { id: eventId },
        data: {
          startAt: start,
          endAt: end,
          guestCode: event.guestCode ?? newGuestCode(),
          guestEntryFrom: now,
          guestEntryUntil: until,
          guestCount: 0,
        },
      });
      await tx.sessionReminder.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.sessionQuestion.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.sessionFeedback.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.sessionFeedbackGiven.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.pollVoter.deleteMany({ where: { poll: { sessionId: { in: sessionIds } } } });
      await tx.pollOption.updateMany({
        where: { poll: { sessionId: { in: sessionIds } } },
        data: { votes: 0 },
      });
      await tx.poll.updateMany({
        where: { sessionId: { in: sessionIds } },
        data: { status: 'DRAFT', openedAt: null, closedAt: null },
      });
      await tx.user.deleteMany({ where: { id: { in: guests.map((guest) => guest.userId) } } });
    });
    await this.record('conference.demonstration.started', 'event', eventId, actor);
    this.stream.scheduleChanged(eventId);
    return this.guestEntry(eventId, locale);
  }

  // --- helpers ---------------------------------------------------------------------------------

  private async sessionOf(eventId: string, sessionId: string) {
    const session = await this.prisma.eventSession.findFirst({
      where: { id: sessionId, eventId },
      select: {
        startAt: true,
        endAt: true,
        moderateQuestions: true,
        allowAnonymousQuestions: true,
      },
    });
    if (!session) throw new AppException('NOT_FOUND');
    return session;
  }

  private async chairOf(principal: Principal, slug: string, sessionId: string) {
    const event = await this.eventFor(principal, slug);
    await this.sessionOf(event.id, sessionId);
    const { canChair } = await this.rolesIn(principal, event, sessionId);
    if (!canChair) throw new AppException('FORBIDDEN');
    return event;
  }

  /** Whoever manages the event may do both; a chair moderates too; each only in their session. */
  private async rolesIn(principal: Principal, event: EventRow, sessionId: string) {
    if (mayActOn(principal, 'events.manage', event.organisationId)) {
      return { canChair: true, canModerate: true };
    }
    if (principal.guestEventId) return { canChair: false, canModerate: false };
    const rows = await this.prisma.sessionStaff.findMany({
      where: { sessionId, userId: principal.userId },
      select: { role: true },
    });
    const canChair = rows.some((row) => row.role === 'CHAIR');
    return { canChair, canModerate: canChair || rows.some((row) => row.role === 'MODERATOR') };
  }

  private record(
    action: string,
    entityType: string,
    entityId: string,
    actor: ConferenceActor,
    changes?: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      correlationId: actor.meta.correlationId,
      actorUserId: actor.userId,
      actorIp: actor.meta.ip,
      entityType,
      entityId,
      ...(changes ? { changes } : {}),
    });
  }
}

function lower(email: string): string {
  return email.trim().toLowerCase();
}

function newGuestCode(): string {
  return randomBytes(24).toString('base64url');
}

function profileName(
  profile: { firstName: string | null; lastName: string | null } | null,
): string | null {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  return name || null;
}
