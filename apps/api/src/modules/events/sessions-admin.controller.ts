import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminSessionDto,
  AdminSessionListDto,
  AdminSpeakerDto,
  AdminSpeakerListDto,
  AdminSpeakerListQueryDto,
  SessionInputDto,
  SpeakerInputDto,
} from './sessions.dto';
import { SessionsService } from './sessions.service';

const actor = (req: RequestWithPrincipal, meta: RequestMeta) => ({
  userId: principalOf(req).userId,
  meta,
});

/** Sessions of one event (API_DESIGN.md §4 "/admin/events/{id}/sessions"). Needs events.manage. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/events/:eventId/sessions')
@RequirePermission('events.manage')
export class SessionsAdminController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOkResponse({ type: AdminSessionListDto })
  async list(@Param('eventId', new ParseUUIDPipe()) eventId: string): Promise<AdminSessionListDto> {
    return { items: await this.sessions.listSessions(eventId) };
  }

  @Post()
  @ApiCreatedResponse({ type: AdminSessionDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: SessionInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSessionDto> {
    return this.sessions.createSession(eventId, body, actor(req, meta));
  }

  @Put(':sessionId')
  @ApiOkResponse({ type: AdminSessionDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: SessionInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSessionDto> {
    return this.sessions.updateSession(eventId, sessionId, body, actor(req, meta));
  }

  @Delete(':sessionId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.sessions.removeSession(eventId, sessionId, actor(req, meta));
  }
}

/** Speakers, shared between events (API_DESIGN.md §4 "/admin/speakers"). Needs events.manage. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/speakers')
@RequirePermission('events.manage')
export class SpeakersAdminController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOkResponse({ type: AdminSpeakerListDto })
  list(@Query() query: AdminSpeakerListQueryDto): Promise<AdminSpeakerListDto> {
    return this.sessions.listSpeakers(query);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminSpeakerDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: SpeakerInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSpeakerDto> {
    return this.sessions.createSpeaker(body, actor(req, meta));
  }

  @Put(':id')
  @ApiOkResponse({ type: AdminSpeakerDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SpeakerInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSpeakerDto> {
    return this.sessions.updateSpeaker(id, body, actor(req, meta));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.sessions.removeSpeaker(id, actor(req, meta));
  }
}
