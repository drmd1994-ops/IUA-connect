import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { type Observable, map } from 'rxjs';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import {
  Authenticated,
  GuestAllowed,
  Public,
  RequireScopedPermission,
} from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { Meta, type RequestMeta } from '../../common/request-meta';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { setSessionCookies } from '../auth/auth.cookies';
import { appTokens } from '../auth/auth.controller';
import { ConferenceStream } from './conference-stream';
import {
  ConferenceQueryDto,
  EnterAsGuestDto,
  EnterAsGuestResultDto,
  FeedbackInputDto,
  FeedbackSummaryDto,
  GuestEntryAdminDto,
  GuestEntryInputDto,
  GuestEntryQueryDto,
  LiveSessionDto,
  LiveSettingsDto,
  PollInputDto,
  QuestionInputDto,
  QuestionStatusDto,
  SessionStaffDto,
  SessionStaffInputDto,
  VoteDto,
} from './conference.dto';
import { ConferenceService } from './conference.service';
import { CheckInCodeDto } from './attendance.dto';
import { EventOwnerGuard } from './event-owner.guard';

/**
 * A session's live part (M32). Every phone in a hall shares one address, so these routes count
 * by person, and by address only with a limit meant for a hall (plan §4).
 */
@ApiTags('events')
@ApiBearerAuth()
@Controller('events/:slug')
@Authenticated()
@GuestAllowed()
export class ConferenceController {
  constructor(
    private readonly conference: ConferenceService,
    private readonly stream: ConferenceStream,
    private readonly limits: RateLimitStore,
  ) {}

  /** Live events of this event; each names ids only. It ends after ten minutes; open a new one. */
  @Sse('live/stream')
  @RateLimit(RATE_LIMITS.conferenceHall)
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Server-sent events; each one is a JSON object with a "type".' })
  async events(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
  ): Promise<Observable<MessageEvent>> {
    const principal = principalOf(req);
    const event = await this.conference.eventFor(principal, slug);
    return this.stream.open(event.id, principal.userId).pipe(map((data) => ({ data })));
  }

  @Get('sessions/:sessionId/live')
  @RateLimit(RATE_LIMITS.conferenceHall)
  @ApiOkResponse({ type: LiveSessionDto })
  live(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<LiveSessionDto> {
    return this.conference.live(principalOf(req), slug, sessionId);
  }

  @Post('sessions/:sessionId/polls/:pollId/vote')
  @RateLimit(RATE_LIMITS.conferenceHall)
  @HttpCode(204)
  @ApiNoContentResponse()
  async vote(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @Body() body: VoteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.conferenceVotesPerUser, principal.userId, res);
    await this.conference.vote(principal, slug, sessionId, pollId, body.optionId);
  }

  @Post('sessions/:sessionId/questions')
  @RateLimit(RATE_LIMITS.conferenceHall)
  @HttpCode(204)
  @ApiNoContentResponse()
  async ask(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: QuestionInputDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.conferenceQuestionsPerUser, principal.userId, res);
    await this.conference.ask(principal, slug, sessionId, body);
  }

  @Put('sessions/:sessionId/questions/:questionId/upvote')
  @RateLimit(RATE_LIMITS.conferenceHall)
  @HttpCode(204)
  @ApiNoContentResponse()
  async upvote(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.conferenceVotesPerUser, principal.userId, res);
    await this.conference.setUpvote(principal, slug, sessionId, questionId, true);
  }

  @Delete('sessions/:sessionId/questions/:questionId/upvote')
  @RateLimit(RATE_LIMITS.conferenceHall)
  @HttpCode(204)
  @ApiNoContentResponse()
  async removeUpvote(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.conferenceVotesPerUser, principal.userId, res);
    await this.conference.setUpvote(principal, slug, sessionId, questionId, false);
  }

  @Post('sessions/:sessionId/feedback')
  @RateLimit(RATE_LIMITS.conferenceHall)
  @HttpCode(204)
  @ApiNoContentResponse()
  async feedback(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: FeedbackInputDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.conferenceVotesPerUser, principal.userId, res);
    await this.conference.giveFeedback(principal, slug, sessionId, body);
  }
}

/** What only a session's chair or moderator does. The service checks who they are. */
@ApiTags('events')
@ApiBearerAuth()
@Controller('events/:slug/sessions/:sessionId/chair')
@Authenticated()
export class ConferenceChairController {
  constructor(private readonly conference: ConferenceService) {}

  @Post('polls')
  @HttpCode(204)
  @ApiNoContentResponse()
  createPoll(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: PollInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    return this.conference.createPoll(principal, slug, sessionId, body, {
      userId: principal.userId,
      meta,
    });
  }

  @Post('polls/:pollId/open')
  @HttpCode(204)
  @ApiNoContentResponse()
  openPoll(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    return this.conference.setPollStatus(principal, slug, sessionId, pollId, 'OPEN', {
      userId: principal.userId,
      meta,
    });
  }

  @Post('polls/:pollId/close')
  @HttpCode(204)
  @ApiNoContentResponse()
  closePoll(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    return this.conference.setPollStatus(principal, slug, sessionId, pollId, 'CLOSED', {
      userId: principal.userId,
      meta,
    });
  }

  @Delete('polls/:pollId')
  @HttpCode(204)
  @ApiNoContentResponse()
  removePoll(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    return this.conference.removeDraftPoll(principal, slug, sessionId, pollId, {
      userId: principal.userId,
      meta,
    });
  }

  @Patch('settings')
  @HttpCode(204)
  @ApiNoContentResponse()
  settings(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: LiveSettingsDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    return this.conference.updateSettings(principal, slug, sessionId, body, {
      userId: principal.userId,
      meta,
    });
  }

  @Put('questions/:questionId/status')
  @HttpCode(204)
  @ApiNoContentResponse()
  questionStatus(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() body: QuestionStatusDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    return this.conference.setQuestionStatus(principal, slug, sessionId, questionId, body.status, {
      userId: principal.userId,
      meta,
    });
  }

  @Get('feedback')
  @ApiOkResponse({ type: FeedbackSummaryDto })
  feedback(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<FeedbackSummaryDto> {
    return this.conference.feedbackSummary(principalOf(req), slug, sessionId);
  }

  /** The session's attendance QR, for the chair's screen. Ask again before it expires. */
  @Get('attendance-code')
  @ApiOkResponse({ type: CheckInCodeDto })
  attendanceCode(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Query() query: ConferenceQueryDto,
  ): Promise<CheckInCodeDto> {
    return this.conference.attendanceCode(principalOf(req), slug, sessionId, query.locale);
  }
}

/** The guest entry: the code on the QR makes a guest with no details for this phone (plan §4). */
@ApiTags('events')
@Controller('events/:slug')
export class GuestEntryController {
  constructor(private readonly conference: ConferenceService) {}

  @Post('guest-entry')
  @Public()
  @RateLimit(RATE_LIMITS.guestEntryPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: EnterAsGuestResultDto })
  async enter(
    @Param('slug') slug: string,
    @Body() body: EnterAsGuestDto,
    @Req() _req: Request,
    @Res({ passthrough: true }) res: Response,
    @Meta() meta: RequestMeta,
  ): Promise<EnterAsGuestResultDto> {
    if (body.client === 'app') {
      const { tokens, number } = await this.conference.enterAsGuest(slug, body.code, meta, {
        client: 'APP',
        clientName: body.deviceName ?? null,
      });
      return { ...appTokens(tokens), number };
    }
    const { tokens, number } = await this.conference.enterAsGuest(slug, body.code, meta);
    setSessionCookies(res, tokens.refreshToken, tokens.sessionExpiresAt);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, number };
  }
}

/** Who runs a session, the guest entry and the demonstration. events.manage, where it is held. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/events/:eventId')
@RequireScopedPermission('events.manage')
@UseGuards(EventOwnerGuard)
export class ConferenceAdminController {
  constructor(private readonly conference: ConferenceService) {}

  @Get('sessions/:sessionId/staff')
  @ApiOkResponse({ type: SessionStaffDto })
  staff(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<SessionStaffDto> {
    return this.conference.staff(eventId, sessionId);
  }

  @Put('sessions/:sessionId/staff')
  @ApiOkResponse({ type: SessionStaffDto })
  setStaff(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: SessionStaffInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<SessionStaffDto> {
    return this.conference.setStaff(eventId, sessionId, body, {
      userId: principalOf(req).userId,
      meta,
    });
  }

  @Get('guest-entry')
  @ApiOkResponse({ type: GuestEntryAdminDto })
  guestEntry(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: GuestEntryQueryDto,
  ): Promise<GuestEntryAdminDto> {
    return this.conference.guestEntry(eventId, query.locale);
  }

  @Put('guest-entry')
  @ApiOkResponse({ type: GuestEntryAdminDto })
  setGuestEntry(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: GuestEntryQueryDto,
    @Body() body: GuestEntryInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<GuestEntryAdminDto> {
    return this.conference.setGuestEntry(eventId, body, query.locale, {
      userId: principalOf(req).userId,
      meta,
    });
  }

  @Delete('guest-entry')
  @ApiOkResponse({ type: GuestEntryAdminDto })
  closeGuestEntry(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: GuestEntryQueryDto,
    @Meta() meta: RequestMeta,
  ): Promise<GuestEntryAdminDto> {
    return this.conference.setGuestEntry(eventId, null, query.locale, {
      userId: principalOf(req).userId,
      meta,
    });
  }

  /** Starts the demo's fictional conference from now (a rehearsal, or a showing). */
  @Post('demonstration')
  @HttpCode(200)
  @ApiCreatedResponse({ type: GuestEntryAdminDto })
  demonstration(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: GuestEntryQueryDto,
    @Meta() meta: RequestMeta,
  ): Promise<GuestEntryAdminDto> {
    return this.conference.startDemonstration(eventId, query.locale, {
      userId: principalOf(req).userId,
      meta,
    });
  }
}
