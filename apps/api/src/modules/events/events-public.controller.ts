import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrincipalResolver, type RequestWithPrincipal } from '../../common/auth/principal';
import { Public } from '../../common/decorators/access.decorators';
import {
  EventCategoryListDto,
  PublicEventDto,
  PublicEventItemQueryDto,
  PublicEventListDto,
  PublicEventQueryDto,
} from './events.dto';
import { EventsAdminService } from './events-admin.service';
import { EventsPublicService } from './events-public.service';

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

  @Get(':slug')
  @ApiOkResponse({ type: PublicEventDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Query() query: PublicEventItemQueryDto,
  ): Promise<PublicEventDto> {
    return this.events.get(await this.caller(req), slug, query.locale);
  }

  private async caller(req: RequestWithPrincipal) {
    return req.principal ?? (await this.principals.resolve(req));
  }
}
