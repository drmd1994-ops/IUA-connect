import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { RequireAnyScopedPermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminPositionDto,
  AdminPositionListDto,
  AdminPositionListQueryDto,
  PositionHistoryDto,
  PositionInputDto,
  PositionScopeDto,
  PositionTransitionDto,
} from './positions.dto';
import { POSITION_STAFF, PositionsAdminService } from './positions-admin.service';

/**
 * Writing and reviewing positions (M28). The guard lets in anyone who holds one of the
 * positions permissions somewhere; the service checks the owner of every position, and one of
 * an owner the caller does not work for reads as "not found". Admin roles apply only in a
 * session that completed MFA. Audited by the service.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/positions')
@RequireAnyScopedPermission(...POSITION_STAFF)
export class PositionsAdminController {
  constructor(private readonly positions: PositionsAdminService) {}

  @Get()
  @ApiOkResponse({ type: AdminPositionListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: AdminPositionListQueryDto,
  ): Promise<AdminPositionListDto> {
    return this.positions.list(principalOf(req), query);
  }

  // Before ':id', so "scope" is never read as an ID.
  @Get('scope')
  @ApiOkResponse({ type: PositionScopeDto })
  scope(@Req() req: RequestWithPrincipal): Promise<PositionScopeDto> {
    return this.positions.scope(principalOf(req));
  }

  @Post()
  @ApiCreatedResponse({ type: AdminPositionDto })
  async create(
    @Req() req: RequestWithPrincipal,
    @Body() body: PositionInputDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminPositionDto> {
    return withEtag(res, await this.positions.create(body, principalOf(req), meta));
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminPositionDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminPositionDto> {
    return withEtag(res, await this.positions.get(principalOf(req), id));
  }

  @Put(':id')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The version you edited: "<n>"' })
  @ApiOkResponse({ type: AdminPositionDto })
  async update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PositionInputDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminPositionDto> {
    return withEtag(res, await this.positions.update(id, body, ifMatch, principalOf(req), meta));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.positions.remove(id, principalOf(req), meta);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminPositionDto })
  async transition(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PositionTransitionDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminPositionDto> {
    return withEtag(res, await this.positions.transition(id, body, principalOf(req), meta));
  }

  @Get(':id/history')
  @ApiOkResponse({ type: PositionHistoryDto })
  history(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PositionHistoryDto> {
    return this.positions.history(principalOf(req), id);
  }
}

function withEtag(res: Response, item: AdminPositionDto): AdminPositionDto {
  res.setHeader('ETag', `"${item.version}"`);
  return item;
}
