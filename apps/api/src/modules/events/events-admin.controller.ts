import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import {
  RequirePermission,
  RequireScopedPermission,
} from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminEventDto,
  AdminEventListDto,
  AdminEventListQueryDto,
  CancelEventDto,
  CreateEventCategoryDto,
  EventCategoryDto,
  EventCategoryListDto,
  EventInputDto,
  UpdateEventCategoryDto,
} from './events.dto';
import { EventsAdminService } from './events-admin.service';

/**
 * Event management (API_DESIGN.md §4 "/admin/events"). Needs events.manage, which applies only
 * in a session that completed MFA. Audited by the service.
 *
 * An event is an organisation's or the platform's own, and events.manage is used where it is
 * held (M16): the service checks the owner on every route, and another owner's event reads as
 * "not found". The categories are the platform's.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/events')
@RequireScopedPermission('events.manage')
export class EventsAdminController {
  constructor(private readonly events: EventsAdminService) {}

  @Get()
  @ApiOkResponse({ type: AdminEventListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: AdminEventListQueryDto,
  ): Promise<AdminEventListDto> {
    return this.events.list(principalOf(req), query);
  }

  // Category routes come before ':id' so "categories" is never read as an ID.
  @Get('categories')
  @ApiOkResponse({ type: EventCategoryListDto })
  async listCategories(): Promise<EventCategoryListDto> {
    return { items: await this.events.listCategories(false) };
  }

  @Post('categories')
  @RequirePermission('events.manage')
  @ApiCreatedResponse({ type: EventCategoryDto })
  createCategory(@Body() body: CreateEventCategoryDto): Promise<EventCategoryDto> {
    return this.events.createCategory(body);
  }

  @Patch('categories/:id')
  @RequirePermission('events.manage')
  @ApiOkResponse({ type: EventCategoryDto })
  updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateEventCategoryDto,
  ): Promise<EventCategoryDto> {
    return this.events.updateCategory(id, body);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminEventDto })
  async create(
    @Req() req: RequestWithPrincipal,
    @Body() body: EventInputDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEventDto> {
    return withEtag(res, await this.events.create(principalOf(req), body, actor(req, meta)));
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminEventDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEventDto> {
    return withEtag(res, await this.events.get(principalOf(req), id));
  }

  @Put(':id')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The version you edited: "<n>"' })
  @ApiOkResponse({ type: AdminEventDto })
  async update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: EventInputDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEventDto> {
    return withEtag(
      res,
      await this.events.update(principalOf(req), id, body, ifMatch, actor(req, meta)),
    );
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminEventDto })
  async publish(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEventDto> {
    return withEtag(res, await this.events.publish(principalOf(req), id, actor(req, meta)));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminEventDto })
  async cancel(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CancelEventDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEventDto> {
    return withEtag(
      res,
      await this.events.cancel(principalOf(req), id, body.reason, actor(req, meta)),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.events.remove(principalOf(req), id, actor(req, meta));
  }
}

const actor = (req: RequestWithPrincipal, meta: RequestMeta) => ({
  userId: principalOf(req).userId,
  meta,
});

function withEtag(res: Response, item: AdminEventDto): AdminEventDto {
  res.setHeader('ETag', `"${item.version}"`);
  return item;
}
