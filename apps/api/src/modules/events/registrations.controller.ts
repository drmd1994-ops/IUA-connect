import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { CalendarService } from './calendar.service';
import {
  AdminRegistrationListDto,
  AdminRegistrationListQueryDto,
  MyRegistrationDto,
  MyScheduleDto,
  MyScheduleQueryDto,
  ScheduleInputDto,
} from './registrations.dto';
import { RegistrationsService } from './registrations.service';

/**
 * The signed-in person's own registration for an event (API_DESIGN.md §4). The event must be one
 * they may see; otherwise the answer is 404, as for a missing event.
 */
@ApiTags('events')
@ApiBearerAuth()
@Controller('events/:slug')
@Authenticated()
export class EventRegistrationController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get('registration')
  @ApiOkResponse({ type: MyRegistrationDto })
  mine(@Req() req: RequestWithPrincipal, @Param('slug') slug: string): Promise<MyRegistrationDto> {
    return this.registrations.mine(principalOf(req), slug);
  }

  /** Registers, or joins the waiting list when the event is full. */
  @Post('registration')
  @HttpCode(200)
  @ApiOkResponse({ type: MyRegistrationDto })
  register(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Meta() meta: RequestMeta,
  ): Promise<MyRegistrationDto> {
    return this.registrations.register(principalOf(req), slug, meta);
  }

  @Delete('registration')
  @ApiOkResponse({ type: MyRegistrationDto })
  cancel(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Meta() meta: RequestMeta,
  ): Promise<MyRegistrationDto> {
    return this.registrations.cancel(principalOf(req), slug, meta);
  }

  /** Replaces the chosen sessions of this event in the personal schedule. */
  @Put('schedule')
  @ApiOkResponse({ type: MyRegistrationDto })
  setSchedule(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Body() body: ScheduleInputDto,
  ): Promise<MyRegistrationDto> {
    return this.registrations.setSchedule(principalOf(req), slug, body.sessionIds);
  }
}

/** The signed-in person's schedule across all their events. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@Authenticated()
export class MyScheduleController {
  constructor(
    private readonly registrations: RegistrationsService,
    private readonly calendar: CalendarService,
  ) {}

  /** The schedule as a calendar file: chosen sessions, or whole events where none was chosen. */
  @Get('schedule.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @ApiProduces('text/calendar')
  @ApiOkResponse({ schema: { type: 'string' } })
  async ics(
    @Req() req: RequestWithPrincipal,
    @Query() query: MyScheduleQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.calendar.scheduleCalendar(principalOf(req), query.locale);
    res.setHeader('Content-Disposition', 'attachment; filename="my-schedule.ics"');
    return file;
  }

  @Get('schedule')
  @ApiOkResponse({ type: MyScheduleDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Query() query: MyScheduleQueryDto,
  ): Promise<MyScheduleDto> {
    return this.registrations.mySchedule(principalOf(req), query.locale);
  }
}

/** Who registered for an event (API_DESIGN.md §4). Needs events.manage. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/events/:eventId/registrations')
@RequirePermission('events.manage')
export class RegistrationsAdminController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get()
  @ApiOkResponse({ type: AdminRegistrationListDto })
  list(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: AdminRegistrationListQueryDto,
  ): Promise<AdminRegistrationListDto> {
    return this.registrations.adminList(eventId, query);
  }
}
