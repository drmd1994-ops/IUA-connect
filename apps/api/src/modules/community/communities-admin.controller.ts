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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { CommunitiesService } from './communities.service';
import {
  AdminCommunityDto,
  AdminCommunityInputDto,
  AdminCommunityListDto,
  CommunityModeratorInputDto,
} from './community.dto';

/**
 * Opening and closing communities and appointing their moderators (M25): the platform's staff
 * with `communities.manage`, in a session that completed MFA. Audited by the service.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/communities')
@RequirePermission('communities.manage')
export class CommunitiesAdminController {
  constructor(private readonly communities: CommunitiesService) {}

  @Get()
  @ApiOkResponse({ type: AdminCommunityListDto })
  list(): Promise<AdminCommunityListDto> {
    return this.communities.adminList();
  }

  @Post()
  @ApiCreatedResponse({ type: AdminCommunityDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: AdminCommunityInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    return this.communities.create(principalOf(req), body, meta);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminCommunityDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminCommunityDto> {
    return this.communities.adminGet(id);
  }

  @Put(':id')
  @ApiOkResponse({ type: AdminCommunityDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AdminCommunityInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    return this.communities.update(principalOf(req), id, body, meta);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminCommunityDto })
  archive(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    return this.communities.setArchived(principalOf(req), id, true, meta);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminCommunityDto })
  restore(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    return this.communities.setArchived(principalOf(req), id, false, meta);
  }

  @Post(':id/moderators')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminCommunityDto })
  addModerator(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CommunityModeratorInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    return this.communities.addModerator(principalOf(req), id, body.userId, meta);
  }

  @Delete(':id/moderators/:userId')
  @ApiOkResponse({ type: AdminCommunityDto })
  removeModerator(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminCommunityDto> {
    return this.communities.removeModerator(principalOf(req), id, userId, meta);
  }
}
