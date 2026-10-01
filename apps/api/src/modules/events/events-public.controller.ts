import { Controller, Get, Header, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { PrincipalResolver, type RequestWithPrincipal } from '../../common/auth/principal';
import { Public } from '../../common/decorators/access.decorators';
import {
  EventCategoryListDto,
  PublicEventDto,
  PublicEventItemQueryDto,
  PublicEventListDto,
  PublicEventQueryDto,
} from './events.dto';
import { CalendarService } from './calendar.service';
import { EventsAdminService } from './events-admin.service';
import { EventsPublicService } from './events-public.service';
import { PublicSessionListDto, PublicSessionQueryDto } from './sessions.dto';
import { SessionsService } from './sessions.service';

/**
 * Public events (API_DESIGN.md §4). Open to everyone; signed-in members also see what their
 * membership allows (access tiers), so the caller is identified when a token is sent.
 */
@ApiTags('events')
@Controller('events')
@Public()
export class EventsPublicController {
  constructor(
    private readonly events: EventsPublicService,
    private readonly admin: EventsAdminService,
    private readonly sessions: SessionsService,
    private readonly calendar: CalendarService,
    private readonly principals: PrincipalResolver,
  ) {}

  @Get()
  @ApiOkResponse({ type: PublicEventListDto })
  async list(
    @Req() req: RequestWithPrincipal,
    @Query() query: PublicEventQueryDto,
  ): Promise<PublicEventListDto> {
    return this.events.list(await this.caller(req), query);
  }

  @Get('categories')
  @ApiOkResponse({ type: EventCategoryListDto })
  async listCategories(): Promise<EventCategoryListDto> {
    return { items: await this.admin.listCategories(true) };
  }

  /** The event as a calendar file. Declared before ':slug', which would match it too. */
  @Get(':slug.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @ApiProduces('text/calendar')
  @ApiOkResponse({ schema: { type: 'string' } })
  async ics(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Query() query: PublicEventItemQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.calendar.eventCalendar(await this.caller(req), slug, query.locale);
    res.setHeader('Content-Disposition', 'attachment; filename="event.ics"');
    return file;
  }

  @Get(':slug')
  @ApiOkResponse({ type: PublicEventDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Query() query: PublicEventItemQueryDto,
  ): Promise<PublicEventDto> {
    return this.events.get(await this.caller(req), slug, query.locale);
  }

  @Get(':slug/sessions')
  @ApiOkResponse({ type: PublicSessionListDto })
  async listSessions(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Query() query: PublicSessionQueryDto,
  ): Promise<PublicSessionListDto> {
    return this.sessions.publicSessions(await this.caller(req), slug, query.locale);
  }

  private async caller(req: RequestWithPrincipal) {
    return req.principal ?? (await this.principals.resolve(req));
  }
}
