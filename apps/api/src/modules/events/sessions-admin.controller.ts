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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequireScopedPermission } from '../../common/decorators/access.decorators';
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
import { EventOwnerGuard } from './event-owner.guard';
import { SessionsService } from './sessions.service';

const actor = (req: RequestWithPrincipal, meta: RequestMeta) => ({
  userId: principalOf(req).userId,
  meta,
});

/**
 * Sessions of one event (API_DESIGN.md §4 "/admin/events/{id}/sessions"). Needs events.manage,
 * held where the event is owned: the guard answers "not found" for anyone else's event (M16).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/events/:eventId/sessions')
@RequireScopedPermission('events.manage')
@UseGuards(EventOwnerGuard)
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

/**
 * Speakers, shared between the events of one owner (API_DESIGN.md §4 "/admin/speakers"). Needs
 * events.manage. An organisation's staff keep its list and the platform's staff the platform's;
 * the service checks whose a speaker is (M16).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/speakers')
@RequireScopedPermission('events.manage')
export class SpeakersAdminController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOkResponse({ type: AdminSpeakerListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: AdminSpeakerListQueryDto,
  ): Promise<AdminSpeakerListDto> {
    return this.sessions.listSpeakers(principalOf(req), query);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminSpeakerDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: SpeakerInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSpeakerDto> {
    return this.sessions.createSpeaker(principalOf(req), body, actor(req, meta));
  }

  @Put(':id')
  @ApiOkResponse({ type: AdminSpeakerDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SpeakerInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSpeakerDto> {
    return this.sessions.updateSpeaker(principalOf(req), id, body, actor(req, meta));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.sessions.removeSpeaker(principalOf(req), id, actor(req, meta));
  }
}
